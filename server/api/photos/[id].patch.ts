// Role: admin. Turns a photo on or off, and sets or clears its caption.
import { db } from '../../db'
import type { Photo } from '../../types'

const MAX_CAPTION = 200

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ hidden?: unknown, caption?: unknown }>(event)

  const hasHidden = body?.hidden !== undefined
  const hasCaption = body?.caption !== undefined
  if ((!hasHidden && !hasCaption)
    || (hasHidden && typeof body.hidden !== 'boolean')
    || (hasCaption && typeof body.caption !== 'string' && body.caption !== null)) {
    throw createError({ statusCode: 400, statusMessage: 'Send hidden (boolean) or caption (string or null)' })
  }

  const caption = typeof body.caption === 'string' ? body.caption.trim() || null : null
  if (caption && caption.length > MAX_CAPTION) {
    throw createError({ statusCode: 400, statusMessage: `Captions can be up to ${MAX_CAPTION} characters` })
  }

  const photo = db.transaction(() => {
    if (hasHidden) db.prepare(`UPDATE photos SET hidden = ? WHERE id = ?`).run(body.hidden ? 1 : 0, id)
    if (hasCaption) db.prepare(`UPDATE photos SET caption = ? WHERE id = ?`).run(caption, id)
    return db.prepare<[string], Photo>(`SELECT * FROM photos WHERE id = ?`).get(id)
  })()

  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  pushToAllFrames('playlist-changed')
  return { photo }
})
