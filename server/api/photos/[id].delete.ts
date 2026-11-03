// Role: admin. Deletes one photo: the row, the original, and every variant. Many photos go through
// POST /api/photos/delete, which needs typed confirmation and the password. This route is limited,
// so it can't be looped to delete a library without those checks.
import { db } from '../../db'

const SINGLE_DELETES_PER_MINUTE = 30

export default defineEventHandler(async (event) => {
  if (!allowRequest(`photo-delete:${currentSessionRef(event) ?? 'none'}`, SINGLE_DELETES_PER_MINUTE, 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Deleting many photos needs the bulk delete, with its confirmation' })
  }
  const id = getRouterParam(event, 'id') ?? ''
  const name = db.prepare<[string], { filename: string }>(`SELECT filename FROM photos WHERE id = ?`).get(id)?.filename
  const deleted = await deletePhoto(id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  logEvent(event, 'info', 'delete', `Deleted the photo ${JSON.stringify(name ?? id)}`)
  return { ok: true }
})
