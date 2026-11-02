// Role: admin. Turns a photo on or off, and sets or clears its caption and date.
import { db } from '../../db'
import type { Photo } from '../../types'

const MAX_CAPTION = 200
const DATE = /^\d{4}-\d{2}-\d{2}$/

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ hidden?: unknown, caption?: unknown, taken_at?: unknown }>(event)

  const hasHidden = body?.hidden !== undefined
  const hasCaption = body?.caption !== undefined
  const hasDate = body?.taken_at !== undefined
  if (!hasHidden && !hasCaption && !hasDate) bad('Send hidden, caption, or taken_at')
  if (hasHidden && typeof body.hidden !== 'boolean') bad('hidden must be true or false')
  if (hasCaption && typeof body.caption !== 'string' && body.caption !== null) bad('caption must be text or null')

  const caption = typeof body.caption === 'string' ? body.caption.trim() || null : null
  if (caption && caption.length > MAX_CAPTION) bad(`Captions can be up to ${MAX_CAPTION} characters`)

  let takenAt: string | null = null
  if (hasDate && body.taken_at !== null) {
    const value = body.taken_at
    if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(value))) bad('taken_at must be YYYY-MM-DD')
    takenAt = `${value}T12:00:00.000Z` // Midday keeps the date stable across time zones.
  }

  const photo = db.transaction(() => {
    if (hasHidden) db.prepare(`UPDATE photos SET hidden = ? WHERE id = ?`).run(body.hidden ? 1 : 0, id)
    if (hasCaption) db.prepare(`UPDATE photos SET caption = ? WHERE id = ?`).run(caption, id)
    if (hasDate) db.prepare(`UPDATE photos SET taken_at = ? WHERE id = ?`).run(takenAt, id)
    return db.prepare<[string], Photo>(`SELECT * FROM photos WHERE id = ?`).get(id)
  })()

  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  pushToAllFrames('playlist-changed')
  return { photo }
})
