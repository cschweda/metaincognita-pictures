// Demo mode: a fresh install shows how OpenMantel works with a random handful of royalty-free
// photos from Lorem Picsum (which sources them from Unsplash), tagged, with playlists and a preset.
// This is the only place the server fetches anything from outside, and only from picsum.photos.
import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ulid } from 'ulid'
import { db } from '../db'

export const DEMO_COUNT = 15
const PICSUM = 'https://picsum.photos'
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000

const LANDSCAPE = [2400, 1600] as const
const PORTRAIT = [1600, 2400] as const
const SQUARE = [2000, 2000] as const
const PANORAMIC = [3000, 1000] as const

/** Picsum photo ids, a shape to request, and tags for what each one shows. */
/** Captions on about half, so frames show the caption band right away. */
const POOL: { id: number, size: readonly [number, number], tags: string[], caption?: string }[] = [
  { id: 10, size: LANDSCAPE, tags: ['landscape', 'water', 'nature'], caption: 'Pines above the bay' },
  { id: 11, size: LANDSCAPE, tags: ['landscape', 'nature', 'water'], caption: 'Morning mist in the valley' },
  { id: 12, size: LANDSCAPE, tags: ['beach', 'water'], caption: 'Low tide on the rocks' },
  { id: 15, size: PORTRAIT, tags: ['nature', 'water', 'mountains'], caption: 'The falls after a week of rain' },
  { id: 16, size: LANDSCAPE, tags: ['beach', 'water', 'landscape'] },
  { id: 20, size: LANDSCAPE, tags: ['work', 'still-life'] },
  { id: 22, size: PORTRAIT, tags: ['city', 'people'], caption: 'Late for the train' },
  { id: 24, size: LANDSCAPE, tags: ['still-life'], caption: 'One more chapter' },
  { id: 26, size: LANDSCAPE, tags: ['still-life', 'work'] },
  { id: 27, size: LANDSCAPE, tags: ['water', 'sunset', 'beach'], caption: 'Golden hour from the cliff' },
  { id: 28, size: PORTRAIT, tags: ['nature', 'spring'] },
  { id: 29, size: PANORAMIC, tags: ['mountains', 'landscape', 'winter'], caption: 'The pass, still snowed in' },
  { id: 30, size: SQUARE, tags: ['still-life', 'food'], caption: 'First coffee of the day' },
  { id: 37, size: LANDSCAPE, tags: ['water', 'landscape', 'summer'], caption: 'Where the path ends' },
  { id: 42, size: LANDSCAPE, tags: ['food', 'city'], caption: 'Our corner café' },
  { id: 48, size: LANDSCAPE, tags: ['work'] },
  { id: 49, size: SQUARE, tags: ['travel', 'city', 'architecture'], caption: 'A white village above the sea' },
  { id: 54, size: LANDSCAPE, tags: ['landscape', 'summer'], caption: 'Clouds rolling over the summit' },
  { id: 58, size: PORTRAIT, tags: ['architecture', 'water'], caption: 'The lighthouse at the point' },
  { id: 60, size: LANDSCAPE, tags: ['work', 'still-life'] },
  { id: 64, size: PORTRAIT, tags: ['people', 'summer', 'flowers'], caption: 'Daisies by the lake' },
  { id: 65, size: PORTRAIT, tags: ['people', 'sunset'] },
  { id: 76, size: PORTRAIT, tags: ['city', 'still-life'], caption: 'Parked for the afternoon' },
  { id: 83, size: PORTRAIT, tags: ['nature'] },
  { id: 96, size: LANDSCAPE, tags: ['cars', 'night'] },
  { id: 100, size: LANDSCAPE, tags: ['beach', 'travel', 'landscape'], caption: 'The long beach at dawn' },
  { id: 101, size: SQUARE, tags: ['architecture', 'city'] },
  { id: 102, size: PORTRAIT, tags: ['food', 'summer'] },
  { id: 103, size: LANDSCAPE, tags: ['fall', 'landscape', 'travel'], caption: 'Leaves turning on the hill road' },
  { id: 104, size: PORTRAIT, tags: ['still-life'] },
  { id: 106, size: PORTRAIT, tags: ['flowers', 'spring'] },
  { id: 107, size: PORTRAIT, tags: ['nature', 'summer'] },
  { id: 108, size: PORTRAIT, tags: ['beach', 'travel', 'summer'], caption: 'Last swim of the summer' },
  { id: 109, size: PORTRAIT, tags: ['nature', 'summer'] },
  { id: 110, size: LANDSCAPE, tags: ['sunset', 'landscape', 'fall'], caption: 'Sunset on the way home' },
  { id: 111, size: PORTRAIT, tags: ['cars', 'city'] },
  { id: 112, size: PANORAMIC, tags: ['nature', 'fall'] },
  { id: 113, size: PORTRAIT, tags: ['food', 'still-life'] },
  { id: 116, size: LANDSCAPE, tags: ['landscape', 'travel', 'summer'], caption: 'Hills as far as you can see' },
  { id: 117, size: SQUARE, tags: ['music', 'night'] },
  { id: 118, size: LANDSCAPE, tags: ['landscape', 'flowers', 'travel'] },
  { id: 119, size: SQUARE, tags: ['still-life', 'work'] },
  { id: 120, size: PORTRAIT, tags: ['night', 'landscape'] },
  { id: 121, size: PANORAMIC, tags: ['mountains', 'landscape'] },
  { id: 122, size: LANDSCAPE, tags: ['night', 'city', 'travel'], caption: 'Downtown after dark' },
  { id: 124, size: LANDSCAPE, tags: ['water', 'summer', 'travel'] },
  { id: 125, size: PANORAMIC, tags: ['water', 'landscape', 'fall'], caption: 'Fall on the reservoir' },
  { id: 126, size: SQUARE, tags: ['water', 'nature'] },
  { id: 127, size: PORTRAIT, tags: ['nature', 'spring'] },
  { id: 128, size: LANDSCAPE, tags: ['mountains', 'water', 'travel'], caption: 'Lake under the peaks' },
]

export type AppMode = 'demo' | 'live'

export function appMode(): AppMode {
  return db.prepare<[], { value: string }>(`SELECT value FROM settings WHERE key = 'mode'`).get()?.value === 'live' ? 'live' : 'demo'
}

export function setting(key: string): string | undefined {
  return db.prepare<[string], { value: string }>(`SELECT value FROM settings WHERE key = ?`).get(key)?.value
}

export function setSetting(key: string, value: string | null): void {
  if (value === null) db.prepare(`DELETE FROM settings WHERE key = ?`).run(key)
  else db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(key, value)
}

export function demoPhotoCount(): number {
  return db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM photos WHERE demo = 1`).get()?.n ?? 0
}

export interface DemoJob {
  state: 'idle' | 'loading' | 'done' | 'failed'
  done: number
  total: number
  error: string | null
}
let job: DemoJob = { state: 'idle', done: 0, total: 0, error: null }
export const demoJob = () => job

/** A random pick that always includes a few shapes, so frames show what "never crops" means. */
function pick(count: number) {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5)
  const chosen = [
    shuffled.find(item => item.size === PANORAMIC),
    shuffled.find(item => item.size === PORTRAIT),
    shuffled.find(item => item.size === SQUARE),
  ].filter(item => item !== undefined)
  for (const item of shuffled) {
    if (chosen.length >= count) break
    if (!chosen.includes(item)) chosen.push(item)
  }
  return chosen.sort(() => Math.random() - 0.5)
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_DOWNLOAD_BYTES) throw new Error('Too large')
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length > MAX_DOWNLOAD_BYTES) throw new Error('Too large')
  return body
}

/** One photo's bytes: from NUXT_DEMO_SOURCE_DIR in tests, otherwise from Lorem Picsum. */
async function photoBytes(id: number, size: readonly [number, number]): Promise<Buffer> {
  const { demoSourceDir } = useRuntimeConfig()
  if (demoSourceDir) return readFile(join(demoSourceDir, `${id}.jpg`))
  return download(`${PICSUM}/id/${id}/${size[0]}/${size[1]}.jpg`)
}

function demoPlaylist(name: string, ids: string[]) {
  const id = ulid()
  db.prepare(`INSERT INTO playlists (id, name, demo) VALUES (?, ?, 1) ON CONFLICT (name) DO NOTHING`).run(id, name)
  const insert = db.prepare(`INSERT OR IGNORE INTO playlist_photos (playlist_id, photo_id, position) VALUES (?, ?, ?)`)
  ids.forEach((photo, index) => insert.run(id, photo, index + 1))
}

/**
 * Loads the demo in the background. The caller has already emptied the library: loading the demo
 * always starts from nothing. Progress is in demoJob().
 */
export function startDemoLoad(): DemoJob {
  if (job.state === 'loading') return job
  const chosen = pick(DEMO_COUNT)
  job = { state: 'loading', done: 0, total: chosen.length, error: null }
  setSetting('mode', 'demo')

  ;(async () => {
    await ensurePhotoDirs()
    const added: { id: string, tags: string[] }[] = []
    let failures = 0
    for (const item of chosen) {
      const path = picturesPath('tmp', randomUUID())
      try {
        await writeFile(path, await photoBytes(item.id, item.size), { mode: 0o600 })
        const result = await ingestPhoto(path, `demo-${item.id}.jpg`, item.tags, { demo: true, caption: item.caption ?? null })
        if (result.status === 'added') added.push({ id: result.photo.id, tags: item.tags })
      }
      catch (error) {
        failures++
        console.warn(`[demo] photo ${item.id} failed`, (error as Error).message)
      }
      finally {
        await rm(path, { force: true }).catch(() => undefined)
        job.done++
      }
    }

    if (added.length === 0) {
      job.state = 'failed'
      job.error = 'Couldn\'t download the demo photos. Check that the server can reach picsum.photos, then try again.'
      return
    }

    // Two playlists and a preset, so every part of the admin has something to show.
    db.transaction(() => {
      demoPlaylist('Kitchen', added.slice(0, Math.ceil(added.length / 2)).map(photo => photo.id))
      demoPlaylist('Living room', added.slice(Math.ceil(added.length / 2)).map(photo => photo.id))
      const counts = new Map<string, number>()
      for (const photo of added) for (const tag of photo.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      const tag = top ? db.prepare<[string], { id: string }>(`SELECT id FROM tags WHERE name = ?`).get(top) : undefined
      if (top && tag) {
        db.prepare(`INSERT INTO presets (id, name, filter, demo) VALUES (?, ?, ?, 1)`)
          .run(ulid(), top[0]!.toUpperCase() + top.slice(1), JSON.stringify({ tags: [tag.id], mode: 'any' }))
      }
    })()

    job.state = 'done'
    job.error = failures ? `${failures} of ${chosen.length} photos couldn't be downloaded.` : null
    pushToAllFrames('playlist-changed')
    console.log(`[demo] loaded ${added.length} photos`)
  })().catch((error) => {
    job.state = 'failed'
    job.error = 'The demo couldn\'t be loaded.'
    console.error('[demo] load failed', error)
  })
  return job
}

/** In live mode, removes what the demo added and leaves the owner's photos alone. */
export async function removeDemo(): Promise<number> {
  const photos = db.prepare<[], { id: string }>(`SELECT id FROM photos WHERE demo = 1`).all()
  for (const photo of photos) await deletePhoto(photo.id)
  db.transaction(() => {
    db.prepare(`DELETE FROM playlists WHERE demo = 1`).run()
    db.prepare(`DELETE FROM presets WHERE demo = 1`).run()
    db.prepare(`DELETE FROM tags WHERE demo = 1 AND NOT EXISTS (SELECT 1 FROM photo_tags WHERE tag_id = tags.id)`).run()
  })()
  pushToAllFrames('playlist-changed')
  return photos.length
}
