// Role: admin. Adds photos to the end of a playlist. Photos already in it stay where they are.
import { db } from '../../../db'

export default defineEventHandler(async (event) => {
  const { id } = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const ids = photoIds((await readBody<{ photo_ids?: unknown }>(event))?.photo_ids)

  const added = db.transaction(() => {
    let next = (db.prepare<[string], { top: number | null }>(
      `SELECT MAX(position) AS top FROM playlist_photos WHERE playlist_id = ?`,
    ).get(id)?.top ?? 0) + 1
    const insert = db.prepare(
      `INSERT OR IGNORE INTO playlist_photos (playlist_id, photo_id, position) SELECT ?, id, ? FROM photos WHERE id = ?`,
    )
    let count = 0
    for (const photo of ids) {
      if (insert.run(id, next, photo).changes) {
        count++
        next++
      }
    }
    return count
  })()

  if (added) pushToPlaylistFrames(id)
  return { added, playlist: listPlaylists().find(playlist => playlist.id === id) }
})
