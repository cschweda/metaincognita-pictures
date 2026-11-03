// Role: admin. Adds photos to a playlist: at the end, or starting at position `at` (0 is first).
// Photos already in it stay where they are.
import { db } from '../../../db'

export default defineEventHandler(async (event) => {
  const { id } = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const body = await readBody<{ photo_ids?: unknown, at?: unknown }>(event)
  const ids = photoIds(body?.photo_ids)
  if (body?.at !== undefined && (!Number.isInteger(body.at) || (body.at as number) < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'at must be a position from 0' })
  }

  const added = db.transaction(() => {
    const current = db.prepare<[string], { photo_id: string }>(
      `SELECT photo_id FROM playlist_photos WHERE playlist_id = ? ORDER BY position`,
    ).all(id).map(row => row.photo_id)
    const exists = db.prepare<[string], { id: string }>(`SELECT id FROM photos WHERE id = ?`)
    const fresh = ids.filter(photo => !current.includes(photo) && exists.get(photo))
    if (fresh.length === 0) return 0

    const insert = db.prepare(`INSERT INTO playlist_photos (playlist_id, photo_id, position) VALUES (?, ?, 0)`)
    for (const photo of fresh) insert.run(id, photo)
    const at = Math.min(typeof body?.at === 'number' ? body.at : current.length, current.length)
    renumberPlaylist(id, [...current.slice(0, at), ...fresh, ...current.slice(at)])
    return fresh.length
  })()

  if (added) pushToPlaylistFrames(id)
  return { added, playlist: listPlaylists().find(playlist => playlist.id === id) }
})
