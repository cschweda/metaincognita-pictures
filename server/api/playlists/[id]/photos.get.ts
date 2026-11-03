// Role: admin. A playlist's photos, in its order.
import { db } from '../../../db'
import type { Photo } from '../../../types'

export default defineEventHandler((event) => {
  const playlist = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const photos = db.prepare<[string], Photo>(
    `SELECT photos.* FROM playlist_photos pp JOIN photos ON photos.id = pp.photo_id
     WHERE pp.playlist_id = ? ORDER BY pp.position`,
  ).all(playlist.id)
  return { playlist, photos }
})
