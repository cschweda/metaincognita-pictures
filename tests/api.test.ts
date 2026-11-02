// Runs against the production build with a throwaway database. Run `pnpm build` first.
import assert from 'node:assert/strict'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import argon2 from 'argon2'
import sharp from 'sharp'

const PORT = 3197
const BASE = `http://127.0.0.1:${PORT}`
const PASSWORD = 'test-password'
const CSRF = { 'X-Requested-With': 'fetch' }
const JSON_BODY = { ...CSRF, 'Content-Type': 'application/json' }

let server: ChildProcess
let directory: string
let admin: string

const cookieFrom = (response: Response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const adminFetch = (path: string, init: RequestInit = {}) =>
  fetch(BASE + path, { ...init, headers: { ...init.headers, cookie: admin } })
const adminJson = (path: string, method: string, body: unknown) =>
  adminFetch(path, { method, headers: JSON_BODY, body: JSON.stringify(body) })

async function upload(color: string, name: string, tags = '') {
  const image = await sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer()
  const form = new FormData()
  form.append('tags', tags)
  form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), name)
  const response = await adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })
  return (await response.json()).results[0]
}

async function pairDevice(name: string) {
  const start = await (await fetch(`${BASE}/api/pair/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ screen_w: 1920, screen_h: 1080, dpr: 1 }),
  })).json()
  const approved = await adminJson('/api/pair/approve', 'POST', { code: start.code, name })
  assert.equal(approved.status, 200)
  const poll = await fetch(`${BASE}/api/pair/poll?id=${start.pairing_id}`)
  assert.deepEqual(await poll.json(), { status: 'approved' })
  return { cookie: cookieFrom(poll), id: start.pairing_id as string }
}

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'pictures-test-'))
  server = spawn('node', ['.output/server/index.mjs'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NUXT_DB_PATH: join(directory, 'test.db'),
      NUXT_PICTURES_DIR: directory,
      NUXT_ADMIN_PASSWORD_HASH: await argon2.hash(PASSWORD),
    },
  })

  for (let attempt = 0; attempt < 50; attempt++) {
    if (await fetch(`${BASE}/api/health`).then(response => response.ok, () => false)) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: JSON_BODY,
    body: JSON.stringify({ password: PASSWORD }),
  })
  assert.equal(login.status, 200)
  admin = cookieFrom(login)
})

after(() => {
  server.kill()
  rmSync(directory, { recursive: true, force: true })
})

test('public routes answer without a login', async () => {
  assert.deepEqual(await (await fetch(`${BASE}/api/health`)).json(), { ok: true, db: true })
  assert.deepEqual(await (await fetch(`${BASE}/api/auth/session`)).json(), { admin: false })
})

test('every other api route is denied by default', async () => {
  for (const path of ['/api/photos', '/api/tags', '/api/devices', '/api/presets', '/api/stats', '/api/stats/server', '/api/sessions', '/api/no-such-route', '/api//photos']) {
    assert.equal((await fetch(BASE + path)).status, 401, path)
  }
  assert.equal((await fetch(`${BASE}/api/pair/approve`, { method: 'POST' })).status, 401)
  assert.equal((await fetch(`${BASE}//api/photos`)).status, 401)
})

test('a garbage device cookie is treated as no cookie', async () => {
  const response = await fetch(`${BASE}/api/photos`, { headers: { cookie: 'device_token=garbage' } })
  assert.equal(response.status, 401)
})

test('admin writes need the CSRF header', async () => {
  const response = await adminFetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x' }),
  })
  assert.equal(response.status, 403)
})

test('logout ends a session', async () => {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: JSON_BODY, body: JSON.stringify({ password: PASSWORD }) })
  const cookie = cookieFrom(login)
  assert.deepEqual(await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie } })).json(), { admin: true })
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { ...CSRF, cookie } })
  assert.deepEqual(await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie } })).json(), { admin: false })
})

test('uploads add photos, skip duplicates, and reject non-images', async () => {
  const added = await upload('#ff0000', 'red.jpg', 'alpha, beta')
  assert.equal(added.status, 'added')
  assert.equal((await upload('#ff0000', 'again.jpg')).status, 'duplicate')

  const form = new FormData()
  form.append('photo', new Blob(['not an image']), 'fake.jpg')
  const response = await adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })
  assert.equal((await response.json()).results[0].status, 'rejected')
})

test('images need a session or a device', async () => {
  const { photo } = await upload('#00ff00', 'green.jpg')
  const path = `/v/${photo.id}-640.webp`
  assert.equal((await fetch(BASE + path)).status, 401)
  assert.equal((await adminFetch(path)).status, 200)
})

test('pairing delivers the token once and scopes the device', async () => {
  const { cookie, id } = await pairDevice('Scoped')
  assert.ok(cookie.startsWith('device_token='))

  const replay = await fetch(`${BASE}/api/pair/poll?id=${id}`)
  assert.equal(replay.headers.getSetCookie().length, 0)
  assert.deepEqual(await replay.json(), { status: 'expired' })

  const device = { headers: { cookie } }
  assert.equal((await fetch(`${BASE}/api/frame/config`, device)).status, 200)
  assert.equal((await fetch(`${BASE}/api/photos`, device)).status, 403)
  assert.equal((await fetch(`${BASE}/api/devices`, device)).status, 403)
})

test('removing a frame ends its access', async () => {
  const { cookie } = await pairDevice('Removed')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Removed')
  assert.equal((await adminFetch(`/api/devices/${id}/revoke`, { method: 'POST', headers: CSRF })).status, 200)
  assert.equal((await fetch(`${BASE}/api/frame/config`, { headers: { cookie } })).status, 401)
})

test('filters choose photos by any tag or all tags, and hidden photos stay out', async () => {
  await upload('#111111', 'one.jpg', 'gamma')
  await upload('#222222', 'two.jpg', 'delta')
  const both = await upload('#333333', 'three.jpg', 'gamma, delta')

  const { cookie } = await pairDevice('Filtered')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Filtered')
  const { tags } = await (await adminFetch('/api/tags')).json()
  const tagId = (name: string) => tags.find((tag: { name: string }) => tag.name === name).id
  const count = async () =>
    (await (await fetch(`${BASE}/api/frame/playlist`, { headers: { cookie } })).json()).photos.length

  await adminJson(`/api/devices/${id}`, 'PATCH', { filter: { tags: [tagId('gamma'), tagId('delta')], mode: 'any' } })
  assert.equal(await count(), 3)
  await adminJson(`/api/devices/${id}`, 'PATCH', { filter: { tags: [tagId('gamma'), tagId('delta')], mode: 'all' } })
  assert.equal(await count(), 1)
  await adminJson(`/api/photos/${both.photo.id}`, 'PATCH', { hidden: true })
  assert.equal(await count(), 0)
})

test('the remote reaches a connected frame, and only an admin can use it', async () => {
  const { cookie } = await pairDevice('Remote')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Remote')
  const send = (action: string) => adminJson(`/api/devices/${id}/control`, 'POST', { action })

  assert.equal((await send('next')).status, 409)

  const stream = await fetch(`${BASE}/api/frame/events`, { headers: { cookie } })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal((await send('dance')).status, 400)
  assert.equal((await send('next')).status, 200)

  const { value } = await stream.body!.getReader().read()
  const received = new TextDecoder().decode(value)
  assert.match(received, /event: control\ndata: next/)
  await stream.body?.cancel().catch(() => undefined)

  const asDevice = await fetch(`${BASE}/api/devices/${id}/control`, {
    method: 'POST',
    headers: { ...JSON_BODY, cookie },
    body: JSON.stringify({ action: 'next' }),
  })
  assert.equal(asDevice.status, 403)
})

test('an admin slideshow can open on a chosen photo, even one that is turned off', async () => {
  const { photo } = await upload('#555555', 'chosen.jpg')
  await adminJson(`/api/photos/${photo.id}`, 'PATCH', { hidden: true })

  const { photos } = await (await adminFetch(`/api/frame/playlist?first=${photo.id}`)).json()
  assert.equal(photos[0].id, photo.id)
  const plain = await (await adminFetch('/api/frame/playlist')).json()
  assert.ok(!plain.photos.some((item: { id: string }) => item.id === photo.id))
})

test('photo search matches file names and captions, and treats wildcards literally', async () => {
  const { photo } = await upload('#444444', 'searchable.jpg')
  await adminJson(`/api/photos/${photo.id}`, 'PATCH', { caption: 'Sunset at 100% zoom' })

  const search = async (q: string) =>
    (await (await adminFetch(`/api/photos?q=${encodeURIComponent(q)}`)).json()).photos.length
  assert.equal(await search('searchable'), 1)
  assert.equal(await search('sunset'), 1)
  assert.equal(await search('100%'), 1)
  assert.equal(await search('%'), 1)
  assert.equal(await search('no such photo'), 0)
})

test('deleting a tag removes it from filters, and renaming keeps them', async () => {
  const { tag } = await (await adminJson('/api/tags', 'POST', { name: 'temporary' })).json()
  const { preset } = await (await adminJson('/api/presets', 'POST', { name: 'P', filter: { tags: [tag.id], mode: 'any' } })).json()

  assert.equal((await adminJson(`/api/tags/${tag.id}`, 'PATCH', { name: 'renamed' })).status, 200)
  const kept = await (await adminFetch('/api/presets')).json()
  assert.deepEqual(kept.presets.find((item: { id: string }) => item.id === preset.id).filter.tags, [tag.id])

  assert.equal((await adminFetch(`/api/tags/${tag.id}`, { method: 'DELETE', headers: CSRF })).status, 200)
  const cleared = await (await adminFetch('/api/presets')).json()
  assert.deepEqual(cleared.presets.find((item: { id: string }) => item.id === preset.id).filter.tags, [])
})
