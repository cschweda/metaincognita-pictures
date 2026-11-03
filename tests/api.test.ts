// Runs against the production build with a throwaway database. Run `pnpm build` first.
import assert from 'node:assert/strict'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import argon2 from 'argon2'
import sharp from 'sharp'
import { inSchedule } from '../app/utils/schedule'

const PORT = 3197
const BASE = `http://127.0.0.1:${PORT}`
const PASSWORD = 'test-password-long'
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
  // Each approval uses its own session, because approvals are limited to 5 a minute per session.
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: JSON_BODY, body: JSON.stringify({ password: PASSWORD }) })
  const approved = await fetch(`${BASE}/api/pair/approve`, {
    method: 'POST',
    headers: { ...JSON_BODY, cookie: cookieFrom(login) },
    body: JSON.stringify({ code: start.code, name }),
  })
  assert.equal(approved.status, 200)
  const poll = await fetch(`${BASE}/api/pair/poll?id=${start.pairing_id}`)
  assert.deepEqual(await poll.json(), { status: 'approved' })
  return { cookie: cookieFrom(poll), id: start.pairing_id as string }
}

// Stand-ins for the demo's photos, so demo tests never reach the internet. Named by Picsum id.
const DEMO_IDS = [10, 11, 12, 15, 16, 20, 22, 24, 26, 27, 28, 29, 30, 37, 42, 48, 49, 54, 58, 60, 64, 65, 76, 83, 96,
  100, 101, 102, 103, 104, 106, 107, 108, 109, 110, 111, 112, 113, 116, 117, 118, 119, 120, 121, 122, 124, 125, 126, 127, 128]
let demoSource: string

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'pictures-test-'))
  demoSource = mkdtempSync(join(tmpdir(), 'pictures-demo-'))
  const { writeFileSync } = await import('node:fs')
  await Promise.all(DEMO_IDS.map(async (id) => {
    const image = await sharp({ create: { width: 320, height: 200, channels: 3, background: { r: id, g: 255 - id, b: (id * 7) % 255 } } }).jpeg().toBuffer()
    writeFileSync(join(demoSource, `${id}.jpg`), image)
  }))
  server = spawn('node', ['.output/server/index.mjs'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NUXT_DB_PATH: join(directory, 'test.db'),
      NUXT_PICTURES_DIR: directory,
      NUXT_ADMIN_PASSWORD_HASH: await argon2.hash(PASSWORD),
      // This database starts empty, so without this it would load the demo at startup.
      NUXT_DEMO_AUTOLOAD: 'false',
      NUXT_DEMO_SOURCE_DIR: demoSource,
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
  rmSync(demoSource, { recursive: true, force: true })
})

test('public routes answer without a login', async () => {
  assert.deepEqual(await (await fetch(`${BASE}/api/health`)).json(), { ok: true, db: true })
  assert.deepEqual(await (await fetch(`${BASE}/api/auth/session`)).json(), { admin: false, device: false })
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
  assert.deepEqual(await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie } })).json(), { admin: true, device: false })
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { ...CSRF, cookie } })
  assert.deepEqual(await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie } })).json(), { admin: false, device: false })
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

test('a frame can be told to show one photo', async () => {
  const { photo } = await upload('#666666', 'shown.jpg')
  const { cookie } = await pairDevice('Shower')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Shower')

  const stream = await fetch(`${BASE}/api/frame/events`, { headers: { cookie } })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal((await adminJson(`/api/devices/${id}/control`, 'POST', { action: 'show', photo_id: 'nope' })).status, 404)
  assert.equal((await adminJson(`/api/devices/${id}/control`, 'POST', { action: 'show', photo_id: photo.id })).status, 200)
  const { value } = await stream.body!.getReader().read()
  assert.match(new TextDecoder().decode(value), new RegExp(`event: show\\ndata: .*${photo.id}`))
  await stream.body?.cancel().catch(() => undefined)
})

test('frames can skip photos that do not suit the screen', async () => {
  const image = await sharp({ create: { width: 200, height: 400, channels: 3, background: '#777777' } }).jpeg().toBuffer()
  const form = new FormData()
  form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'tall.jpg')
  const { results } = await (await adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })).json()
  const tall = results[0].photo.id

  const { cookie } = await pairDevice('Wide')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Wide')
  const ids = async () =>
    (await (await fetch(`${BASE}/api/frame/playlist`, { headers: { cookie } })).json()).photos.map((p: { id: string }) => p.id)

  assert.ok((await ids()).includes(tall))
  assert.equal((await adminJson(`/api/devices/${id}`, 'PATCH', { match_shape: true })).status, 200)
  assert.ok(!(await ids()).includes(tall))
})

test('memories come first on their date, and dates can be edited', async () => {
  const { photo } = await upload('#888888', 'old.jpg')
  const now = new Date()
  const date = `2019-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  assert.equal((await adminJson(`/api/photos/${photo.id}`, 'PATCH', { taken_at: 'soon' })).status, 400)
  assert.equal((await adminJson(`/api/photos/${photo.id}`, 'PATCH', { taken_at: date })).status, 200)

  const { photos } = await (await adminFetch('/api/photos?tag=memories')).json()
  assert.deepEqual(photos.map((p: { id: string }) => p.id), [photo.id])

  const { cookie } = await pairDevice('Memories')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Memories')
  await adminJson(`/api/devices/${id}`, 'PATCH', { memories_first: true, sort: 'uploaded_at' })
  const list = await (await fetch(`${BASE}/api/frame/playlist`, { headers: { cookie } })).json()
  assert.equal(list.photos[0].id, photo.id)
})

test('captions can be turned off for a frame, and a schedule switches to its preset', async () => {
  const { photo: red } = await upload('#a01010', 'plain.jpg')
  const { photo: tagged } = await upload('#10a010', 'holiday.jpg', 'scheduled')
  const { cookie } = await pairDevice('Scheduled')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Scheduled')
  const device = { headers: { cookie } }
  const ids = async (query = '') =>
    (await (await fetch(`${BASE}/api/frame/playlist${query}`, device)).json()).photos.map((p: { id: string }) => p.id)
  const config = async () => (await fetch(`${BASE}/api/frame/config`, device)).json()

  assert.equal((await config()).show_captions, true)
  await adminJson(`/api/devices/${id}`, 'PATCH', { show_captions: false })
  assert.equal((await config()).show_captions, false)

  const { tags } = await (await adminFetch('/api/tags')).json()
  const tag = tags.find((item: { name: string }) => item.name === 'scheduled')
  const { preset } = await (await adminJson('/api/presets', 'POST', { name: 'Weekends', filter: { tags: [tag.id], mode: 'any' } })).json()

  // Without a preset, the flag changes nothing.
  assert.ok((await ids('?scheduled=1')).includes(red.id))
  assert.equal((await adminJson(`/api/devices/${id}`, 'PATCH', { schedule_preset_id: 'nope' })).status, 400)
  assert.equal((await adminJson(`/api/devices/${id}`, 'PATCH', { schedule_days: [7] })).status, 400)
  assert.equal((await adminJson(`/api/devices/${id}`, 'PATCH', { schedule_start: '25:00' })).status, 400)

  const saved = await adminJson(`/api/devices/${id}`, 'PATCH', { schedule_preset_id: preset.id, schedule_days: [6, 0, 6], schedule_start: '09:00', schedule_end: '17:00' })
  assert.equal(saved.status, 200)
  assert.deepEqual((await config()).schedule, { days: [0, 6], start: '09:00', end: '17:00' })
  assert.deepEqual(await ids('?scheduled=1'), [tagged.id])
  assert.ok((await ids()).includes(red.id))

  // A deleted preset ends the schedule, and the frame goes back to its normal filter.
  await adminFetch(`/api/presets/${preset.id}`, { method: 'DELETE', headers: CSRF })
  assert.equal((await config()).schedule, null)
  assert.ok((await ids('?scheduled=1')).includes(red.id))
})

test('a schedule follows days, hours, and windows that cross midnight', () => {
  const at = (day: number, time: string) => new Date(`2026-11-0${day + 1}T${time}:00`) // Nov 1, 2026 is a Sunday.
  assert.equal(inSchedule(null, at(0, '12:00')), false)
  assert.equal(inSchedule({ days: [], start: null, end: null }, at(3, '12:00')), true)

  const weekends = { days: [0, 6], start: '09:00', end: '17:00' }
  assert.equal(inSchedule(weekends, at(6, '09:00')), true)
  assert.equal(inSchedule(weekends, at(6, '17:00')), false)
  assert.equal(inSchedule(weekends, at(1, '12:00')), false)

  const fridayNight = { days: [5], start: '22:00', end: '02:00' }
  assert.equal(inSchedule(fridayNight, at(5, '23:00')), true)
  assert.equal(inSchedule(fridayNight, at(6, '01:00')), true)
  assert.equal(inSchedule(fridayNight, at(5, '01:00')), false)
  assert.equal(inSchedule(fridayNight, at(6, '23:00')), false)
})

test('the library can be arranged by date and exported', async () => {
  assert.equal((await adminFetch('/api/photos/arrange', { method: 'POST', headers: CSRF })).status, 200)
  assert.equal((await fetch(`${BASE}/api/photos/export`)).status, 401)

  const response = await adminFetch('/api/photos/export')
  assert.equal(response.status, 200)
  const tar = Buffer.from(await response.arrayBuffer())
  assert.equal(tar.length % 512, 0)
  assert.equal(tar.subarray(0, 24).toString(), 'openmantel/manifest.json')
  assert.equal(tar.subarray(257, 262).toString(), 'ustar')
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

test('an admin slideshow plays at random by default, or sequentially in the arranged order', async () => {
  for (let i = 0; i < 6; i++) await upload(`#2${i}2${i}2${i}`, `order-${i}.jpg`, 'ordered')
  const { tags } = await (await adminFetch('/api/tags')).json()
  const tag = tags.find((item: { name: string }) => item.name === 'ordered').id
  const ids = async (query: string) =>
    (await (await adminFetch(`/api/frame/playlist?tag=${tag}&${query}`)).json()).photos.map((p: { id: string }) => p.id).join()

  const sequential = await ids('order=sequential&seed=a')
  assert.equal(await ids('order=sequential&seed=b'), sequential, 'the arranged order does not depend on the seed')
  const { photos } = await (await adminFetch(`/api/photos?tag=${tag}`)).json()
  assert.equal(sequential, photos.map((p: { id: string }) => p.id).join(), 'it matches the grid')

  const shuffles = await Promise.all(['1', '2', '3', '4', '5'].map(seed => ids(`seed=${seed}`)))
  assert.ok(shuffles.some(order => order !== sequential), 'with no order given, a chosen tag plays at random')
})

test('a random frame reshuffles on every lap and always plays every photo', async () => {
  const { cookie } = await pairDevice('Laps')
  const lapIds = async (lap: number) =>
    (await (await fetch(`${BASE}/api/frame/playlist?lap=${lap}`, { headers: { cookie } })).json()).photos.map((p: { id: string }) => p.id)

  const first = await lapIds(0)
  assert.deepEqual(await lapIds(0), first, 'a lap is stable, so paging within it works')
  const later = await Promise.all([1, 2, 3, 4, 5].map(lapIds))
  for (const lap of later) assert.deepEqual([...lap].sort(), [...first].sort(), 'every lap has every photo')
  assert.ok(later.some(lap => lap.join() !== first.join()), 'later laps are shuffled differently')

  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Laps')
  await adminJson(`/api/devices/${id}`, 'PATCH', { sort: 'manual' })
  assert.deepEqual(await lapIds(3), await lapIds(0), 'a sequential order repeats as it is')
})

test('technical details are for admins only, and report the schema in use', async () => {
  assert.equal((await fetch(`${BASE}/api/system`)).status, 401)
  const { cookie } = await pairDevice('Curious')
  assert.equal((await fetch(`${BASE}/api/system`, { headers: { cookie } })).status, 403)

  const system = await (await adminFetch('/api/system')).json()
  assert.match(system.runtime.node, /^v\d+/)
  assert.match(system.libraries.sqlite, /^3\./)
  assert.ok(system.database.migrations >= 6)
  assert.match(system.database.latest_migration, /^\d{4}_.+\.sql$/)
  assert.deepEqual(system.storage.variant_sizes, [640, 1280, 1920, 2560])
  assert.match(system.app.commit ?? '', /^([0-9a-f]{40})?$/)
})

test('playlists hold hand-picked photos in their own order, and can be renamed and deleted', async () => {
  const a = (await upload('#311111', 'pl-a.jpg')).photo
  const b = (await upload('#113111', 'pl-b.jpg')).photo
  const c = (await upload('#111131', 'pl-c.jpg')).photo

  assert.equal((await fetch(`${BASE}/api/playlists`)).status, 401)
  assert.equal((await adminJson('/api/playlists', 'POST', { name: '' })).status, 400)
  const created = await adminJson('/api/playlists', 'POST', { name: 'Living room', photo_ids: [c.id, a.id] })
  assert.equal(created.status, 200)
  const { playlist } = await created.json()
  assert.equal(playlist.photos, 2)
  assert.equal(playlist.cover, c.id)
  assert.equal((await adminJson('/api/playlists', 'POST', { name: 'living ROOM' })).status, 409, 'names are unique, ignoring case')

  const order = async () =>
    (await (await adminFetch(`/api/playlists/${playlist.id}/photos`)).json()).photos.map((p: { id: string }) => p.id)
  assert.deepEqual(await order(), [c.id, a.id])

  const added = await (await adminJson(`/api/playlists/${playlist.id}/photos`, 'POST', { photo_ids: [a.id, b.id, 'nope'] })).json()
  assert.equal(added.added, 1, 'photos already in it, and unknown ids, are skipped')
  assert.deepEqual(await order(), [c.id, a.id, b.id], 'new photos go on the end')

  assert.equal((await adminJson(`/api/playlists/${playlist.id}/order`, 'POST', { photo_ids: [a.id, b.id] })).status, 409, 'an order must hold every photo')
  assert.equal((await adminJson(`/api/playlists/${playlist.id}/order`, 'POST', { photo_ids: [b.id, c.id, a.id] })).status, 200)
  assert.deepEqual(await order(), [b.id, c.id, a.id])

  await adminJson(`/api/playlists/${playlist.id}/remove`, 'POST', { photo_ids: [c.id] })
  assert.deepEqual(await order(), [b.id, a.id])
  const library = await (await adminFetch('/api/photos?limit=200')).json()
  assert.ok(library.photos.some((p: { id: string }) => p.id === c.id), 'taking a photo out keeps it in the library')

  const renamed = await (await adminJson(`/api/playlists/${playlist.id}`, 'PATCH', { name: 'Den' })).json()
  assert.equal(renamed.playlist.name, 'Den')

  await adminFetch(`/api/photos/${a.id}`, { method: 'DELETE', headers: CSRF })
  assert.deepEqual(await order(), [b.id], 'deleting a photo from the library takes it out of playlists')

  assert.equal((await adminFetch(`/api/playlists/${playlist.id}`, { method: 'DELETE', headers: CSRF })).status, 200)
  assert.equal((await adminFetch(`/api/playlists/${playlist.id}/photos`)).status, 404)
})

test('a frame can show a playlist, in its order or shuffled, and its schedule still wins', async () => {
  const x = (await upload('#411111', 'fp-x.jpg')).photo
  const y = (await upload('#114111', 'fp-y.jpg')).photo
  const z = (await upload('#111141', 'fp-z.jpg')).photo
  const { playlist } = await (await adminJson('/api/playlists', 'POST', { name: 'Kitchen picks', photo_ids: [z.id, x.id, y.id] })).json()

  const { cookie } = await pairDevice('Playlist frame')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Playlist frame')
  const ids = async (query = '') =>
    (await (await fetch(`${BASE}/api/frame/playlist${query}`, { headers: { cookie } })).json()).photos.map((p: { id: string }) => p.id)

  assert.equal((await adminJson(`/api/devices/${id}`, 'PATCH', { playlist_id: 'nope' })).status, 400)
  const saved = await (await adminJson(`/api/devices/${id}`, 'PATCH', { playlist_id: playlist.id, sort: 'manual' })).json()
  assert.equal(saved.device.playlist_id, playlist.id)
  assert.deepEqual(await ids(), [z.id, x.id, y.id], 'My order is the playlist order')

  await adminJson(`/api/devices/${id}`, 'PATCH', { sort: 'random' })
  const laps = await Promise.all([0, 1, 2, 3, 4, 5].map(lap => ids(`?lap=${lap}`)))
  for (const lap of laps) assert.deepEqual([...lap].sort(), [x.id, y.id, z.id].sort(), 'random plays just the playlist')

  await adminJson(`/api/photos/${x.id}`, 'PATCH', { hidden: true })
  assert.ok(!(await ids()).includes(x.id), 'hidden photos are skipped')

  const { tags } = await (await adminFetch('/api/tags')).json()
  const scheduledTag = tags.find((tag: { name: string }) => tag.name === 'scheduled')
  const { preset } = await (await adminJson('/api/presets', 'POST', { name: 'Playlist schedule', filter: { tags: [scheduledTag.id], mode: 'any' } })).json()
  await adminJson(`/api/devices/${id}`, 'PATCH', { schedule_preset_id: preset.id })
  const during = await ids('?scheduled=1')
  assert.ok(during.length > 0 && !during.includes(y.id), 'the scheduled preset replaces the playlist at its times')

  // The admin's own slideshow can play a playlist too.
  const preview = await (await adminFetch(`/api/frame/playlist?playlist=${playlist.id}&order=sequential`)).json()
  assert.deepEqual(preview.photos.map((p: { id: string }) => p.id), [z.id, y.id])

  await adminFetch(`/api/playlists/${playlist.id}`, { method: 'DELETE', headers: CSRF })
  const after = await (await adminFetch('/api/devices')).json()
  assert.equal(after.devices.find((item: { id: string }) => item.id === id).playlist_id, null, 'deleting a playlist sends its frames back to tags')
})

test('Start slideshow can target one frame and leave the others as they were', async () => {
  const p = (await upload('#511111', 'start-p.jpg')).photo
  const q = (await upload('#115111', 'start-q.jpg')).photo
  const { playlist } = await (await adminJson('/api/playlists', 'POST', { name: 'Start test', photo_ids: [q.id, p.id] })).json()
  const living = await pairDevice('Living room')
  await pairDevice('Kitchen untouched')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const livingId = devices.find((item: { name: string }) => item.name === 'Living room').id
  const kitchenBefore = devices.find((item: { name: string }) => item.name === 'Kitchen untouched')

  assert.equal((await adminJson('/api/slideshow/start', 'POST', { frame: livingId, show: '', order: 'backwards' })).status, 400)
  assert.equal((await adminJson('/api/slideshow/start', 'POST', { frame: 'nope', show: '', order: 'random' })).status, 404)

  const stream = await fetch(`${BASE}/api/frame/events`, { headers: { cookie: living.cookie } })
  await new Promise(resolve => setTimeout(resolve, 100))
  const started = await adminJson('/api/slideshow/start', 'POST', { frame: livingId, show: `playlist:${playlist.id}`, order: 'sequential' })
  assert.equal(started.status, 200)
  assert.deepEqual((await started.json()).started, ['Living room'])
  const { value } = await stream.body!.getReader().read()
  assert.match(new TextDecoder().decode(value), /event: control\ndata: restart/)
  await stream.body?.cancel().catch(() => undefined)

  const list = await (await fetch(`${BASE}/api/frame/playlist`, { headers: { cookie: living.cookie } })).json()
  assert.deepEqual(list.photos.map((photo: { id: string }) => photo.id), [q.id, p.id], 'the frame plays the playlist in order')

  const after = await (await adminFetch('/api/devices')).json()
  const kitchenAfter = after.devices.find((item: { name: string }) => item.name === 'Kitchen untouched')
  assert.deepEqual(
    { filter: kitchenAfter.filter, sort: kitchenAfter.sort, playlist_id: kitchenAfter.playlist_id },
    { filter: kitchenBefore.filter, sort: kitchenBefore.sort, playlist_id: kitchenBefore.playlist_id },
    'other frames are left alone',
  )

  const all = await (await adminJson('/api/slideshow/start', 'POST', { frame: 'all', show: '', order: 'random' })).json()
  assert.ok([...all.started, ...all.offline].includes('Kitchen untouched'), 'All frames reaches every frame')
  const everywhere = await (await adminFetch('/api/devices')).json()
  for (const device of everywhere.devices) {
    assert.equal(device.playlist_id, null)
    assert.equal(device.sort, 'random')
  }
})

test('photos can be added to a playlist at a position, in one step', async () => {
  const [m, n, o, p] = await Promise.all(['#611111', '#116111', '#111161', '#616161'].map((color, i) => upload(color, `at-${i}.jpg`)))
  const { playlist } = await (await adminJson('/api/playlists', 'POST', { name: 'Positions', photo_ids: [m.photo.id, n.photo.id] })).json()
  const order = async () =>
    (await (await adminFetch(`/api/playlists/${playlist.id}/photos`)).json()).photos.map((photo: { id: string }) => photo.id)

  assert.equal((await adminJson(`/api/playlists/${playlist.id}/photos`, 'POST', { photo_ids: [o.photo.id], at: -1 })).status, 400)
  await adminJson(`/api/playlists/${playlist.id}/photos`, 'POST', { photo_ids: [o.photo.id], at: 1 })
  assert.deepEqual(await order(), [m.photo.id, o.photo.id, n.photo.id])
  await adminJson(`/api/playlists/${playlist.id}/photos`, 'POST', { photo_ids: [p.photo.id], at: 0 })
  assert.deepEqual(await order(), [p.photo.id, m.photo.id, o.photo.id, n.photo.id])
  const again = await (await adminJson(`/api/playlists/${playlist.id}/photos`, 'POST', { photo_ids: [m.photo.id], at: 3 })).json()
  assert.equal(again.added, 0, 'a photo already in the playlist stays where it is')
  assert.deepEqual(await order(), [p.photo.id, m.photo.id, o.photo.id, n.photo.id])
})

test('Start slideshow keeps a frame\'s memories-first setting unless On this day is chosen', async () => {
  await pairDevice('Memories kept')
  const { devices } = await (await adminFetch('/api/devices')).json()
  const { id } = devices.find((item: { name: string }) => item.name === 'Memories kept')
  const memoriesFirst = async () =>
    (await (await adminFetch('/api/devices')).json()).devices.find((item: { id: string }) => item.id === id).memories_first

  await adminJson(`/api/devices/${id}`, 'PATCH', { memories_first: true })
  await adminJson('/api/slideshow/start', 'POST', { frame: id, show: '', order: 'random' })
  assert.equal(await memoriesFirst(), true)
  await adminJson(`/api/devices/${id}`, 'PATCH', { memories_first: false })
  await adminJson('/api/slideshow/start', 'POST', { frame: id, show: 'memories', order: 'random' })
  assert.equal(await memoriesFirst(), true)
})

// Regression tests for the 2026-11-03 red/blue audit (README, Security audits).

test('audit RX-1: large and unsized bodies are refused before any handler reads them', async () => {
  const big = JSON.stringify({ password: 'x'.repeat(70 * 1024) })
  assert.equal((await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: JSON_BODY, body: big })).status, 413)
  assert.equal((await fetch(`${BASE}/api/pair/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: big })).status, 413)
  const chunked = await fetch(`${BASE}/api/pair/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{}')); controller.close() } }),
    duplex: 'half',
  } as RequestInit)
  assert.equal(chunked.status, 411)
})

test('audit RA-4: paths with dot segments are refused', async () => {
  // fetch() tidies dot segments before sending, so these go out raw, as an attacker would send them.
  const { request } = await import('node:http')
  const raw = (path: string) => new Promise<number>((resolve, reject) => {
    request({ host: '127.0.0.1', port: PORT, path, headers: { cookie: admin } }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    }).on('error', reject).end()
  })
  for (const path of ['/api/frame/../devices', '/api/frame/..%2fdevices', '/api/frame/%2e%2e/devices', '/api/frame/..%5cdevices']) {
    assert.equal(await raw(path), 400, path)
  }
  assert.equal(await raw('/api/devices'), 200)
})

test('audit RX-2, RX-3: a heartbeat only records a real photo id', async () => {
  const { photo } = await upload('#717171', 'beat.jpg')
  const { cookie } = await pairDevice('Beats')
  const beat = (photo_id: string) => fetch(`${BASE}/api/frame/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ photo_id }),
  })
  const current = async () => (await (await adminFetch('/api/devices')).json()).devices
    .find((device: { name: string }) => device.name === 'Beats').current_photo_id

  await beat(photo.id)
  assert.equal(await current(), photo.id)
  await beat('../api/photos/export?')
  assert.equal(await current(), null)
  await beat('01ZZZZZZZZZZZZZZZZZZZZZZZZ')
  assert.equal(await current(), null, 'a well-formed id that is not a photo is not stored')
})

test('audit RX-4: a frame holds at most two live streams', async () => {
  const { cookie } = await pairDevice('Streams')
  const open = () => fetch(`${BASE}/api/frame/events`, { headers: { cookie } })
  const first = await open()
  const reader = first.body!.getReader()
  await open()
  await open()
  // The oldest stream is closed by the server once a third opens.
  const ended = await Promise.race([
    (async () => { while (!(await reader.read()).done) { /* drain */ } return true })(),
    new Promise(resolve => setTimeout(() => resolve(false), 3000)),
  ])
  assert.equal(ended, true)
})

test('audit RX-6: a frame cannot fetch a hidden photo, though the admin can', async () => {
  const { photo } = await upload('#727272', 'secret.jpg')
  const { cookie } = await pairDevice('Hidden check')
  const image = `/v/${photo.id}-640.webp`
  assert.equal((await fetch(BASE + image, { headers: { cookie } })).status, 200)
  await adminJson(`/api/photos/${photo.id}`, 'PATCH', { hidden: true })
  assert.equal((await fetch(BASE + image, { headers: { cookie } })).status, 404)
  assert.equal((await adminFetch(image)).status, 200)
})

test('audit RX-7, RF-4: bulk tag changes and upload tags are limited', async () => {
  const { photo } = await upload('#737373', 'tags.jpg')
  const tooMany = Array.from({ length: 101 }, (_, i) => `t${i}`)
  assert.equal((await adminJson('/api/photos/tags', 'POST', { photo_ids: [photo.id], remove: tooMany })).status, 400)

  const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#747474' } }).jpeg().toBuffer()
  const send = async (tags: string) => {
    const form = new FormData()
    form.append('tags', tags)
    form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'tagged.jpg')
    return adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })
  }
  assert.equal((await send('x'.repeat(41))).status, 400, 'a tag over 40 characters')
  assert.equal((await send(tooMany.slice(0, 21).join(','))).status, 400, 'more than 20 tags')
})

test('audit RF-1: an image over 100 megapixels is refused from its header', async () => {
  // A PNG claiming 12000 x 10000 (120 megapixels: over this app's limit, under sharp's own 268),
  // with almost no pixel data, so the test itself needs no memory.
  const { crc32, deflateSync } = await import('node:zlib')
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(12000, 0)
  header.writeUInt32BE(10000, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(64))), chunk('IEND', Buffer.alloc(0))])

  const form = new FormData()
  form.append('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'huge.png')
  const { results } = await (await adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })).json()
  assert.equal(results[0].status, 'rejected')
  assert.match(results[0].error, /megapixels/)
})

test('photo details show the original\'s format and camera data, for admins only', async () => {
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#757575' } })
    .jpeg({ quality: 90 })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'Model 7', Software: 'audit' } })
    .toBuffer()
  const form = new FormData()
  form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'camera.jpg')
  const { results } = await (await adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })).json()
  const id = results[0].photo.id

  const details = await (await adminFetch(`/api/photos/${id}/details`)).json()
  assert.equal(details.photo.filename, 'camera.jpg')
  assert.equal(details.original.format, 'jpeg')
  assert.equal(details.original.width, 400)
  assert.equal(details.original.camera.make, 'TestCam')
  assert.equal(details.original.camera.model, 'Model 7')
  assert.equal(details.variants.length, 4)
  assert.ok(details.variants.every((variant: { bytes: number, has_exif: boolean }) => variant.bytes > 0 && !variant.has_exif), 'frame images carry no EXIF')

  assert.equal((await adminFetch('/api/photos/nope/details')).status, 404)
  assert.equal((await fetch(`${BASE}/api/photos/${id}/details`)).status, 401)
  const { cookie } = await pairDevice('Details check')
  assert.equal((await fetch(`${BASE}/api/photos/${id}/details`, { headers: { cookie } })).status, 403)
})

test('audit follow-up: the nginx image check accepts exactly one image path', async () => {
  const { photo: shown } = await upload('#767676', 'shown-for-nginx.jpg')
  const { photo: hidden } = await upload('#777777', 'hidden-for-nginx.jpg')
  await adminJson(`/api/photos/${hidden.id}`, 'PATCH', { hidden: true })
  const { cookie } = await pairDevice('Nginx check')
  const check = async (uri: string) => (await fetch(`${BASE}/api/auth/image`, { headers: { cookie, 'X-Original-URI': uri } })).status

  assert.equal(await check(`/v/${shown.id}-640.webp`), 204)
  assert.equal(await check(`/v/${hidden.id}-640.webp`), 403)
  assert.equal(await check(`/v/${hidden.id}-640.webp?x=/v/${shown.id}-640.webp`), 403, 'an id in the query string is ignored')
  assert.equal(await check(`/v/${hidden.id}-640.webp/v/${shown.id}-640.webp`), 403)
  assert.equal(await check(`/x/v/${shown.id}-640.webp`), 403)
  assert.equal(await check(''), 403)
})

test('deleting two or more photos needs the typed phrase and the password', async () => {
  const photos = await Promise.all(['#811111', '#118111', '#111181'].map((color, i) => upload(color, `bulk-${i}.jpg`)))
  const ids = photos.map(result => result.photo.id)
  const bulkDelete = (body: unknown) => adminJson('/api/photos/delete', 'POST', body)

  assert.equal((await bulkDelete({ photo_ids: ids.slice(0, 1), phrase: 'delete 1 photos', password: PASSWORD })).status, 400, 'one photo uses the single delete')
  assert.equal((await bulkDelete({ photo_ids: ids.slice(0, 2), phrase: 'delete 3 photos', password: PASSWORD })).status, 400, 'the count must match')
  assert.equal((await bulkDelete({ photo_ids: ids.slice(0, 2), phrase: 'delete 2 photos', password: 'wrong-password' })).status, 401)
  const done = await bulkDelete({ photo_ids: ids.slice(0, 2), phrase: 'delete 2 photos', password: PASSWORD })
  assert.equal(done.status, 200)
  assert.equal((await done.json()).deleted, 2)
  const left = (await (await adminFetch('/api/photos?limit=200')).json()).photos.map((p: { id: string }) => p.id)
  assert.ok(!left.includes(ids[0]) && !left.includes(ids[1]) && left.includes(ids[2]))
})

test('the single delete can\'t be looped to get around the bulk checks', async () => {
  const statuses = []
  for (let i = 0; i < 31; i++) statuses.push((await adminFetch(`/api/photos/01ZZZZZZZZZZZZZZZZZZZZZZ${String(i).padStart(2, '0')}`, { method: 'DELETE', headers: CSRF })).status)
  assert.ok(statuses.slice(0, 30).every(status => status === 404))
  assert.equal(statuses[30], 429)
})

// This deletes everything in the test database, so it runs last.
test('the nuclear option needs a token that has waited, the exact phrase, and the password', async () => {
  const { cookie } = await pairDevice('Doomed')
  const start = async () => (await (await adminJson('/api/nuke/start', 'POST', {})).json()) as { token: string, phrase: string, counts: { photos: number } }
  const confirm = (body: unknown) => adminJson('/api/nuke/confirm', 'POST', body)

  assert.equal((await fetch(`${BASE}/api/nuke/start`, { method: 'POST', headers: CSRF })).status, 401)
  const first = await start()
  assert.equal(first.phrase, 'I want to nuke everything and start from scratch')
  assert.ok(first.counts.photos > 0)
  assert.equal((await confirm({ token: first.token, phrase: first.phrase, password: PASSWORD })).status, 425, 'too soon after starting')
  assert.equal((await confirm({ token: first.token, phrase: first.phrase.toLowerCase(), password: PASSWORD })).status, 400, 'the phrase must match exactly')
  assert.equal((await confirm({ token: 'made-up', phrase: first.phrase, password: PASSWORD })).status, 403)

  await new Promise(resolve => setTimeout(resolve, 10_500))
  const done = await confirm({ token: first.token, phrase: first.phrase, password: PASSWORD })
  assert.equal(done.status, 200)
  assert.ok((await done.json()).deleted.photos > 0)
  assert.equal((await confirm({ token: first.token, phrase: first.phrase, password: PASSWORD })).status, 403, 'a token works once')

  assert.equal((await (await adminFetch('/api/photos')).json()).photos.length, 0)
  assert.equal((await (await adminFetch('/api/devices')).json()).devices.length, 0)
  assert.equal((await (await adminFetch('/api/playlists')).json()).playlists.length, 0)
  assert.equal((await (await adminFetch('/api/tags')).json()).tags.length, 0)
  assert.equal((await fetch(`${BASE}/api/frame/config`, { headers: { cookie } })).status, 401, 'frames go back to pairing')
  const { readdirSync } = await import('node:fs')
  assert.deepEqual([...readdirSync(join(directory, 'orig')), ...readdirSync(join(directory, 'v'))], [], 'photo files are gone from disk')
  assert.equal((await adminFetch('/api/auth/session')).status, 200, 'the admin stays logged in')
})


const waitForDemo = async (base: string, cookie: string) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = await (await fetch(`${base}/api/demo`, { headers: { cookie } })).json()
    if (status.job.state !== 'loading') return status
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('The demo never finished loading')
}

test('demo mode: reloading replaces only a demo, the first upload goes live, and leftover demo photos can be removed', async () => {
  // Start over has just emptied everything, so the app is back in demo mode.
  assert.equal((await (await adminFetch('/api/demo')).json()).mode, 'demo')
  assert.equal((await adminJson('/api/demo/load', 'POST', {})).status, 400, 'needs a confirmation')
  assert.equal((await adminJson('/api/demo/load', 'POST', { confirm: true })).status, 200)
  const loaded = await waitForDemo(BASE, admin)
  assert.equal(loaded.job.state, 'done')
  assert.equal(loaded.demo_photos, 15)
  assert.equal(loaded.mode, 'demo')
  const { playlists } = await (await adminFetch('/api/playlists')).json()
  assert.deepEqual(playlists.map((p: { name: string }) => p.name).sort(), ['Kitchen', 'Living room'])
  const { photos } = await (await adminFetch('/api/photos?limit=200')).json()
  assert.ok(photos.some((p: { caption: string | null }) => p.caption), 'some demo photos have captions')
  assert.ok(photos.every((p: { tags: unknown[] }) => p.tags.length > 0), 'every demo photo is tagged')

  // Reloading in demo mode swaps in a fresh demo.
  await adminJson('/api/demo/load', 'POST', { confirm: true })
  assert.equal((await waitForDemo(BASE, admin)).demo_photos, 15)

  // One photo of the owner's makes it live, and the demo can no longer be reloaded over it.
  const { photo: mine } = await upload('#901010', 'mine.jpg')
  const live = await (await adminFetch('/api/demo')).json()
  assert.equal(live.mode, 'live')
  assert.equal((await adminJson('/api/demo/load', 'POST', { confirm: true })).status, 409)

  // Leftover demo photos come out with the typed count and the password, and the owner's photo stays.
  assert.equal((await adminJson('/api/demo/remove', 'POST', { phrase: 'delete 15 photos', password: PASSWORD })).status, 400)
  const removed = await adminJson('/api/demo/remove', 'POST', { phrase: 'delete 15 demo photos', password: PASSWORD })
  assert.equal(removed.status, 200)
  assert.equal((await removed.json()).removed, 15)
  const left = (await (await adminFetch('/api/photos?limit=200')).json()).photos.map((p: { id: string }) => p.id)
  assert.deepEqual(left, [mine.id])
  assert.equal((await (await adminFetch('/api/playlists')).json()).playlists.length, 0)
  assert.equal((await (await adminFetch('/api/demo')).json()).mode, 'live')
})

test('a brand-new install loads the demo by itself, once', async () => {
  const port = 3196
  const base = `http://127.0.0.1:${port}`
  const fresh = mkdtempSync(join(tmpdir(), 'pictures-fresh-'))
  const hash = await argon2.hash(PASSWORD)
  const start = () => spawn('node', ['.output/server/index.mjs'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NUXT_DB_PATH: join(fresh, 'test.db'), NUXT_PICTURES_DIR: fresh,
      NUXT_ADMIN_PASSWORD_HASH: hash, NUXT_DEMO_SOURCE_DIR: demoSource },
  })
  const up = async () => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await fetch(`${base}/api/health`).then(response => response.ok, () => false)) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  let instance = start()
  try {
    await up()
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: JSON_BODY, body: JSON.stringify({ password: PASSWORD }) })
    const cookie = cookieFrom(login)
    const status = await waitForDemo(base, cookie)
    assert.equal(status.mode, 'demo')
    assert.equal(status.demo_photos, 15, 'the demo loaded on first launch')

    // Emptied and restarted, it doesn't load the demo again on its own.
    instance.kill()
    await new Promise(resolve => setTimeout(resolve, 300))
    const { default: Database } = await import('better-sqlite3')
    const database = new Database(join(fresh, 'test.db'))
    database.exec(`DELETE FROM playlist_photos; DELETE FROM playlists; DELETE FROM photo_tags; DELETE FROM presets; DELETE FROM photos;`)
    database.close()
    instance = start()
    await up()
    const again = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: JSON_BODY, body: JSON.stringify({ password: PASSWORD }) })
    await new Promise(resolve => setTimeout(resolve, 500))
    const after = await (await fetch(`${base}/api/demo`, { headers: { cookie: cookieFrom(again) } })).json()
    assert.equal(after.job.state, 'idle')
    assert.equal(after.photos, 0)
  }
  finally {
    instance.kill()
    rmSync(fresh, { recursive: true, force: true })
  }
})

test('reloading the demo keeps paired frames, showing all photos', async () => {
  // The previous test made this live and removed the demo. Start over, with the demo, gets back to demo mode.
  const { cookie } = await pairDevice('Demo frame')
  const { token, phrase } = await (await adminJson('/api/nuke/start', 'POST', {})).json()
  await new Promise(resolve => setTimeout(resolve, 10_500))
  const nuked = await (await adminJson('/api/nuke/confirm', 'POST', { token, phrase, password: PASSWORD, then_demo: true })).json()
  assert.ok(nuked.job, 'Start over can load the demo afterwards')
  await waitForDemo(BASE, admin)
  assert.equal((await fetch(`${BASE}/api/frame/config`, { headers: { cookie } })).status, 401, 'Start over removes frames')

  const second = await pairDevice('Kept frame')
  assert.equal((await adminJson('/api/demo/load', 'POST', { confirm: true })).status, 200)
  await waitForDemo(BASE, admin)
  assert.equal((await fetch(`${BASE}/api/frame/config`, { headers: { cookie: second.cookie } })).status, 200, 'a demo reload keeps frames paired')
  const playlist = await (await fetch(`${BASE}/api/frame/playlist`, { headers: { cookie: second.cookie } })).json()
  assert.equal(playlist.photos.length, 15)
})

test('review: Start over during a demo load leaves an empty library, and nothing comes back', async () => {
  const { token, phrase } = await (await adminJson('/api/nuke/start', 'POST', {})).json()
  await new Promise(resolve => setTimeout(resolve, 10_500))
  // The library is in demo mode from the previous test, so a reload is allowed. Start over lands mid-load.
  assert.equal((await adminJson('/api/demo/load', 'POST', { confirm: true })).status, 200)
  await new Promise(resolve => setTimeout(resolve, 150))
  const nuked = await adminJson('/api/nuke/confirm', 'POST', { token, phrase, password: PASSWORD })
  assert.equal(nuked.status, 200)
  await new Promise(resolve => setTimeout(resolve, 3000))
  const status = await (await adminFetch('/api/demo')).json()
  assert.notEqual(status.job.state, 'loading')
  assert.equal(status.photos, 0, 'no demo photos reappear after Start over')
  assert.equal((await (await adminFetch('/api/playlists')).json()).playlists.length, 0)
})

test('review: a demo playlist the owner has made their own survives removing the demo', async () => {
  assert.equal((await adminJson('/api/demo/load', 'POST', { confirm: true })).status, 200)
  await waitForDemo(BASE, admin)
  const { photo: mine } = await upload('#a01080', 'kept-in-playlist.jpg')
  const { playlists } = await (await adminFetch('/api/playlists')).json()
  const kitchen = playlists.find((p: { name: string }) => p.name === 'Kitchen')
  const living = playlists.find((p: { name: string }) => p.name === 'Living room')
  await adminJson(`/api/playlists/${kitchen.id}`, 'PATCH', { name: 'Our kitchen' })
  await adminJson(`/api/playlists/${kitchen.id}/photos`, 'POST', { photo_ids: [mine.id] })

  const { demo_photos: count } = await (await adminFetch('/api/demo')).json()
  const removed = await adminJson('/api/demo/remove', 'POST', { phrase: `delete ${count} demo photos`, password: PASSWORD })
  assert.equal(removed.status, 200)
  const after = (await (await adminFetch('/api/playlists')).json()).playlists
  assert.deepEqual(after.map((p: { name: string, photos: number }) => [p.name, p.photos]), [['Our kitchen', 1]], 'the edited playlist stays, with the owner photo')
  assert.ok(!after.some((p: { id: string }) => p.id === living.id), 'the untouched demo playlist goes')
  assert.equal((await adminJson('/api/demo/load', 'POST', { confirm: true })).status, 409, 'owner photos mean no one-click demo reload')
})

test('new frames show each photo for a minute, and a tap shows safe details for the photo', async () => {
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#335577' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'FrameCam', Model: 'Z9' } })
    .toBuffer()
  const form = new FormData()
  form.append('tags', 'tapped')
  form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'tap.jpg')
  const { results } = await (await adminFetch('/api/photos', { method: 'POST', headers: CSRF, body: form })).json()
  const id = results[0].photo.id
  await adminJson(`/api/photos/${id}`, 'PATCH', { caption: 'On the porch' })

  const { cookie } = await pairDevice('Tap frame')
  assert.equal((await (await fetch(`${BASE}/api/frame/config`, { headers: { cookie } })).json()).interval_sec, 60)

  const details = await (await fetch(`${BASE}/api/frame/photo/${id}`, { headers: { cookie } })).json()
  assert.equal(details.caption, 'On the porch')
  assert.equal(details.camera.make, 'FrameCam')
  assert.deepEqual(details.tags, ['tapped'])
  assert.ok(!('location' in details) && !('filename' in details) && !('hash' in details), 'a frame gets no location, file name, or fingerprint')

  assert.equal((await fetch(`${BASE}/api/frame/photo/${id}`)).status, 401)
  assert.equal((await adminFetch(`/api/frame/photo/${id}`)).status, 200, 'the admin slideshow can show details too')
  await adminJson(`/api/photos/${id}`, 'PATCH', { hidden: true })
  assert.equal((await fetch(`${BASE}/api/frame/photo/${id}`, { headers: { cookie } })).status, 404, 'not for a hidden photo')
})

test('five wrong passwords lock that address out for five minutes, and only that address', async () => {
  const from = (ip: string, password: string) => fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { ...JSON_BODY, 'X-Real-IP': ip },
    body: JSON.stringify({ password }),
  })
  const messages = []
  for (let i = 0; i < 4; i++) {
    const response = await from('198.51.100.7', 'wrong-password')
    assert.equal(response.status, 401)
    messages.push((await response.json()).message ?? '')
  }
  assert.match(messages[0], /4 tries left/)
  assert.match(messages[3], /1 try left/)

  const fifth = await from('198.51.100.7', 'wrong-password')
  assert.equal(fifth.status, 429)
  assert.ok(Number(fifth.headers.get('retry-after')) > 290, 'locked for about five minutes')
  assert.equal((await from('198.51.100.7', PASSWORD)).status, 429, 'even the right password waits out the lockout')
  assert.equal((await from('198.51.100.8', PASSWORD)).status, 200, 'other addresses can still log in')
})

test('a frame reports playing or paused, and how long it has been online', async () => {
  const { photo } = await upload('#446688', 'state.jpg')
  const { cookie } = await pairDevice('State frame')
  const beat = (body: unknown) => fetch(`${BASE}/api/frame/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) })
  const state = async () => (await (await adminFetch('/api/devices')).json()).devices.find((d: { name: string }) => d.name === 'State frame')

  await beat({ photo_id: photo.id, paused: false })
  const playing = await state()
  assert.equal(playing.paused, false)
  assert.equal(playing.current_photo_id, photo.id)
  assert.ok(playing.online_since, 'online since is recorded')
  await beat({ photo_id: photo.id, paused: true })
  const paused = await state()
  assert.equal(paused.paused, true)
  assert.equal(paused.online_since, playing.online_since, 'a steady frame keeps its online-since time')
})

test('wrong passwords sent all at once still lock out after five', async () => {
  const attempts = await Promise.all(Array.from({ length: 12 }, () => fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { ...JSON_BODY, 'X-Real-IP': '198.51.100.20' },
    body: JSON.stringify({ password: 'wrong-password' }),
  }).then(response => response.status)))
  assert.ok(attempts.filter(status => status === 401).length <= 4, `at most four plain refusals, got ${attempts.join()}`)
  assert.ok(attempts.filter(status => status === 429).length >= 8)
})

// This leaves the server in a flood of wrong guesses, so it runs last.
test('a flood of wrong passwords from many addresses never locks out the right password', async () => {
  for (let i = 0; i < 20; i++) {
    await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': `203.0.113.${i + 1}` }, body: JSON.stringify({ password: 'wrong' }) })
  }
  const owner = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': '192.0.2.50' }, body: JSON.stringify({ password: PASSWORD }) })
  assert.equal(owner.status, 200, 'the right password works on the first try during a flood')
  const guess = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': '192.0.2.51' }, body: JSON.stringify({ password: 'wrong' }) })
  assert.equal(guess.status, 429, 'but a new address gets only one try')
  // Rotating through one neighbourhood gains nothing: after a wrong password from a /24, the rest of it waits.
  const neighbour = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': '192.0.2.99' }, body: JSON.stringify({ password: PASSWORD }) })
  assert.equal(neighbour.status, 429, 'the neighbourhood shares one try during a flood')

  // Past the flood ceiling, an unknown browser waits, but one that has logged in before gets straight in.
  for (let i = 0; i < 30; i++) {
    await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': `198.18.${i}.1` }, body: JSON.stringify({ password: 'wrong' }) })
  }
  const stranger = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': '198.19.0.1' }, body: JSON.stringify({ password: PASSWORD }) })
  assert.equal(stranger.status, 429, 'an unknown browser waits out the ceiling')
  const known = admin.split('; ').find(part => part.startsWith('known_browser='))
  assert.ok(known, 'logging in remembers the browser')
  const returning = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': '198.19.0.2', cookie: known! }, body: JSON.stringify({ password: PASSWORD }) })
  assert.equal(returning.status, 200, 'a remembered browser is never held up by the flood')

  assert.ok((await (await adminJson('/api/sessions/forget-browsers', 'POST', {})).json()).forgotten >= 1)
  const forgotten = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { ...JSON_BODY, 'X-Real-IP': '198.19.0.3', cookie: known! }, body: JSON.stringify({ password: PASSWORD }) })
  assert.equal(forgotten.status, 429, 'once forgotten, it faces the flood limits again')
})
