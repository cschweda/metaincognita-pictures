// Role: admin. Deletes a playlist. Its photos stay in the library, and frames showing it go back to their tags.
import { db } from '../../db'

export default defineEventHandler((event) => {
  const { id } = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const frames = db.prepare<[string], { id: string }>(`SELECT id FROM devices WHERE playlist_id = ? AND revoked = 0`).all(id)
  db.prepare(`DELETE FROM playlists WHERE id = ?`).run(id) // devices.playlist_id is set to NULL by the schema.
  for (const frame of frames) pushToFrame(frame.id, 'playlist-changed')
  return { ok: true }
})
