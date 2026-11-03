// Role: admin. Renames a playlist.
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const { id } = requirePlaylist(getRouterParam(event, 'id') ?? '')
  const name = validPlaylistName((await readBody<{ name?: unknown }>(event))?.name)
  try {
    db.prepare(`UPDATE playlists SET name = ?, demo = 0 WHERE id = ?`).run(name, id)
  }
  catch {
    throw createError({ statusCode: 409, statusMessage: 'A playlist with that name already exists' })
  }
  return { playlist: listPlaylists().find(playlist => playlist.id === id) }
})
