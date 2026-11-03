// Role: admin. Starts a slideshow on one frame or all of them: saves what to show and in what
// order as the frame's settings, then tells each one to begin again from the first photo.
import { db } from '../../db'
import type { Device } from '../../types'
import { MEMORIES_FILTER, PLAYLIST_PREFIX } from '../../utils/filters'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ frame?: unknown, show?: unknown, order?: unknown }>(event)
  const show = typeof body?.show === 'string' ? body.show : ''
  if (body?.order !== 'random' && body?.order !== 'sequential') {
    throw createError({ statusCode: 400, statusMessage: 'Order must be random or sequential' })
  }

  // What to show becomes a frame's tag filter or playlist. "On this day" can't be a frame's whole
  // filter, so the frame shows everything with today's memories first.
  const changes = { filter: JSON.stringify({ tags: [] as string[], mode: 'any' }), playlist_id: null as string | null, memories_first: 0 }
  if (show.startsWith(PLAYLIST_PREFIX)) {
    changes.playlist_id = requirePlaylist(show.slice(PLAYLIST_PREFIX.length)).id
  }
  else if (show === MEMORIES_FILTER) {
    changes.memories_first = 1
  }
  else if (show) {
    if (!db.prepare(`SELECT 1 FROM tags WHERE id = ?`).get(show)) throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
    changes.filter = JSON.stringify({ tags: [show], mode: 'any' })
  }
  const sort = body.order === 'sequential' ? 'manual' : 'random'

  const frames = body?.frame === 'all'
    ? db.prepare<[], Device>(`SELECT * FROM devices WHERE revoked = 0 ORDER BY name`).all()
    : db.prepare<[string], Device>(`SELECT * FROM devices WHERE id = ? AND revoked = 0`).all(typeof body?.frame === 'string' ? body.frame : '')
  if (frames.length === 0) {
    throw createError({ statusCode: body?.frame === 'all' ? 409 : 404, statusMessage: body?.frame === 'all' ? 'No frames are paired yet' : 'Frame not found' })
  }

  const update = db.prepare(
    `UPDATE devices SET filter = ?, playlist_id = ?, memories_first = ?, sort = ? WHERE id = ?`,
  )
  db.transaction(() => {
    for (const frame of frames) update.run(changes.filter, changes.playlist_id, changes.memories_first, sort, frame.id)
  })()

  // An offline frame picks up its new settings when it next reaches the server.
  for (const frame of frames) pushToFrame(frame.id, 'control', 'restart')
  return {
    started: frames.filter(frame => isFrameConnected(frame.id)).map(frame => frame.name),
    offline: frames.filter(frame => !isFrameConnected(frame.id)).map(frame => frame.name),
  }
})
