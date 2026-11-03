// The nuclear option: delete every photo, frame, playlist, tag, and preset. It is deliberately
// hard to reach. A token comes from a first request, must wait before it can be used, expires,
// works once, and has to arrive with the exact phrase and the admin password.
import { readdir, rm } from 'node:fs/promises'
import { db } from '../db'

export const NUKE_PHRASE = 'I want to nuke everything and start from scratch'
export const NUKE_MIN_WAIT_MS = 10_000

/** What has to be typed to delete several photos at once. */
export function bulkDeletePhrase(count: number) {
  return `delete ${count} photos`
}
const NUKE_MAX_AGE_MS = 10 * 60_000

// One admin, one process, so a single pending token in memory is enough. It is never written down.
let pending: { hash: string, session: string, at: number } | null = null

export function nukeCounts() {
  const count = (table: string) => db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0
  return {
    photos: count('photos'),
    frames: db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM devices WHERE revoked = 0`).get()?.n ?? 0,
    playlists: count('playlists'),
    tags: count('tags'),
    presets: count('presets'),
  }
}

/** Starts a nuke and returns its one-time token. Any earlier token stops working. */
export function startNuke(session: string): string {
  const token = randomToken()
  pending = { hash: sha256(token), session, at: Date.now() }
  return token
}

/** Throws unless the token is this session's, old enough, and not too old. Then uses it up. */
export function takeNukeToken(token: string, session: string, now = Date.now()): void {
  const valid = pending && pending.session === session && pending.hash === sha256(token)
  if (!valid) throw createError({ statusCode: 403, statusMessage: 'Start again from the first step' })
  const age = now - pending!.at
  if (age < NUKE_MIN_WAIT_MS) throw createError({ statusCode: 425, statusMessage: 'Too fast. Take a moment, then try again' })
  if (age > NUKE_MAX_AGE_MS) {
    pending = null
    throw createError({ statusCode: 403, statusMessage: 'That took too long. Start again from the first step' })
  }
  pending = null
}

async function emptyFolder(path: string) {
  const files = await readdir(path).catch(() => [] as string[])
  await Promise.all(files.map(file => rm(`${path}/${file}`, { recursive: true, force: true })))
}

/** Deletes everything except admin sessions and backups. Frames fall back to their pairing screen. */
export async function nukeEverything(): Promise<ReturnType<typeof nukeCounts>> {
  const before = nukeCounts()
  const devices = db.prepare<[], { id: string }>(`SELECT id FROM devices`).all()
  db.transaction(() => {
    db.exec(`
      DELETE FROM pairings;
      DELETE FROM devices;
      DELETE FROM playlist_photos;
      DELETE FROM playlists;
      DELETE FROM photo_tags;
      DELETE FROM tags;
      DELETE FROM presets;
      DELETE FROM photos;
    `)
  })()
  for (const device of devices) closeFrameStreams(device.id)
  // Only the app's own photo folders. Database backups are left alone, so a restore can undo this.
  await Promise.all(['orig', 'v', 'tmp'].map(folder => emptyFolder(picturesPath(folder))))
  return before
}
