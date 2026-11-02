// Role: admin. Works a frame like a remote: next, previous, pause, resume, or show one photo.
import { db } from '../../../db'
import type { Photo } from '../../../types'

const ACTIONS = ['next', 'previous', 'pause', 'resume', 'show']

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ action?: unknown, photo_id?: unknown }>(event)
  const action = typeof body?.action === 'string' ? body.action : ''

  if (!ACTIONS.includes(action)) throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  if (!isFrameConnected(id)) throw createError({ statusCode: 409, statusMessage: 'That frame is offline' })

  if (action === 'show') {
    const photo = db.prepare<[string], Pick<Photo, 'id' | 'caption'>>(`SELECT id, caption FROM photos WHERE id = ?`)
      .get(typeof body?.photo_id === 'string' ? body.photo_id : '')
    if (!photo) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    pushToFrame(id, 'show', JSON.stringify(photo))
    return { ok: true }
  }

  pushToFrame(id, 'control', action)
  return { ok: true }
})
