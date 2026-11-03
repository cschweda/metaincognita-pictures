// Role: admin. Takes photos out of a playlist. They stay in the library.
import { db } from '../../../db'

export default defineEventHandler(async (event) => {
  const { id } = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const ids = photoIds((await readBody<{ photo_ids?: unknown }>(event))?.photo_ids)

  const removed = db.transaction(() => {
    const remove = db.prepare(`DELETE FROM playlist_photos WHERE playlist_id = ? AND photo_id = ?`)
    const count = ids.reduce((sum, photo) => sum + remove.run(id, photo).changes, 0)
    renumberPlaylist(id)
    return count
  })()

  if (removed) pushToPlaylistFrames(id)
  return { removed, playlist: listPlaylists().find(playlist => playlist.id === id) }
})
