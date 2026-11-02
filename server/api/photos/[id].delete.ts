// Role: admin. Deletes the row, the original, and every variant.
export default defineEventHandler(async (event) => {
  const deleted = await deletePhoto(getRouterParam(event, 'id') ?? '')
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  return { ok: true }
})
