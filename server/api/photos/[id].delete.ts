// Role: admin. Deletes one photo: the row, the original, and every variant. Many photos go through
// POST /api/photos/delete, which needs typed confirmation and the password. This route is limited,
// so it can't be looped to delete a library without those checks.
const SINGLE_DELETES_PER_MINUTE = 30

export default defineEventHandler(async (event) => {
  if (!allowRequest(`photo-delete:${currentSessionRef(event) ?? 'none'}`, SINGLE_DELETES_PER_MINUTE, 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Deleting many photos needs the bulk delete, with its confirmation' })
  }
  const deleted = await deletePhoto(getRouterParam(event, 'id') ?? '')
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  return { ok: true }
})
