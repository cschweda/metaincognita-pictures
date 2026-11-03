import { db } from '../db'

/** Every playlist with its size, a cover photo, and the frames showing it. */
export function listPlaylists() {
  const rows = db.prepare<[], { id: string, name: string, photos: number, cover: string | null }>(
    `SELECT p.id, p.name,
       (SELECT COUNT(*) FROM playlist_photos pp WHERE pp.playlist_id = p.id) AS photos,
       (SELECT pp.photo_id FROM playlist_photos pp WHERE pp.playlist_id = p.id ORDER BY pp.position LIMIT 1) AS cover
     FROM playlists p ORDER BY p.name COLLATE NOCASE`,
  ).all()
  const frames = db.prepare<[], { playlist_id: string, name: string }>(
    `SELECT playlist_id, name FROM devices WHERE revoked = 0 AND playlist_id IS NOT NULL ORDER BY name`,
  ).all()
  return rows.map(row => ({ ...row, frames: frames.filter(frame => frame.playlist_id === row.id).map(frame => frame.name) }))
}

export function requirePlaylist(id: string): { id: string, name: string } {
  const playlist = db.prepare<[string], { id: string, name: string }>(`SELECT id, name FROM playlists WHERE id = ?`).get(id)
  if (!playlist) throw createError({ statusCode: 404, statusMessage: 'Playlist not found' })
  return playlist
}

export function validPlaylistName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60) throw createError({ statusCode: 400, statusMessage: 'Give the playlist a name of up to 60 characters' })
  return name
}

export function photoIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5000 || !value.every(id => typeof id === 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'photo_ids must be a list of photo ids' })
  }
  return [...new Set(value as string[])]
}

/** An owner's edit makes a demo playlist theirs, so removing the demo leaves it alone. */
export function claimPlaylist(playlistId: string): void {
  db.prepare(`UPDATE playlists SET demo = 0 WHERE id = ? AND demo = 1`).run(playlistId)
}

/** Frames showing a playlist refetch it when its photos change. */
export function pushToPlaylistFrames(playlistId: string): void {
  const frames = db.prepare<[string], { id: string }>(`SELECT id FROM devices WHERE playlist_id = ? AND revoked = 0`).all(playlistId)
  for (const frame of frames) pushToFrame(frame.id, 'playlist-changed')
}

/** Renumbers a playlist 1, 2, 3, ... after photos are removed or reordered. */
export function renumberPlaylist(playlistId: string, order?: string[]): void {
  const current = db.prepare<[string], { photo_id: string }>(
    `SELECT photo_id FROM playlist_photos WHERE playlist_id = ? ORDER BY position`,
  ).all(playlistId).map(row => row.photo_id)
  const ids = order ?? current
  const update = db.prepare(`UPDATE playlist_photos SET position = ? WHERE playlist_id = ? AND photo_id = ?`)
  ids.forEach((id, index) => update.run(index + 1, playlistId, id))
}
