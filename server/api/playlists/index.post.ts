// Role: admin. Creates an empty playlist, or one holding the given photos in order.
import { ulid } from 'ulid'
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: unknown, photo_ids?: unknown }>(event)
  const name = validPlaylistName(body?.name)
  const ids = body?.photo_ids === undefined ? [] : photoIds(body.photo_ids)
  const id = ulid()

  db.transaction(() => {
    try {
      db.prepare(`INSERT INTO playlists (id, name) VALUES (?, ?)`).run(id, name)
    }
    catch {
      throw createError({ statusCode: 409, statusMessage: 'A playlist with that name already exists' })
    }
    const insert = db.prepare(
      `INSERT OR IGNORE INTO playlist_photos (playlist_id, photo_id, position)
       SELECT ?, id, ? FROM photos WHERE id = ?`,
    )
    ids.forEach((photo, index) => insert.run(id, index + 1, photo))
  })()
  return { playlist: listPlaylists().find(playlist => playlist.id === id) }
})
