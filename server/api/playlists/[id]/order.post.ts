// Role: admin. Sets a playlist's whole order. The list must hold exactly the playlist's photos.
import { db } from '../../../db'

export default defineEventHandler(async (event) => {
  const { id } = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const ids = photoIds((await readBody<{ photo_ids?: unknown }>(event))?.photo_ids)

  const current = db.prepare<[string], { photo_id: string }>(`SELECT photo_id FROM playlist_photos WHERE playlist_id = ?`)
    .all(id).map(row => row.photo_id)
  if (ids.length !== current.length || !current.every(photo => ids.includes(photo))) {
    throw createError({ statusCode: 409, statusMessage: 'The playlist changed. Reload it and try again.' })
  }

  db.transaction(() => renumberPlaylist(id, ids))()
  claimPlaylist(id)
  pushToPlaylistFrames(id)
  return { ok: true }
})
