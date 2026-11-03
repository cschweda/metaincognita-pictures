// Role: admin. Deletes two or more photos at once. Like the nuclear option, it needs a phrase typed
// by hand ("delete 12 photos", matching the count) and the admin password, so it can't happen by
// a stray click.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ photo_ids?: unknown, phrase?: unknown, password?: unknown }>(event)
  const ids = Array.isArray(body?.photo_ids) ? [...new Set(body.photo_ids.filter((id): id is string => typeof id === 'string'))] : []
  if (ids.length < 2 || ids.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'Send 2 to 1000 photo ids. One photo has its own delete' })
  }
  if (body?.phrase !== bulkDeletePhrase(ids.length)) {
    throw createError({ statusCode: 400, statusMessage: `Type "${bulkDeletePhrase(ids.length)}" exactly` })
  }
  // The same check and lockout as logging in.
  await verifyAdminPassword(event, body?.password, 'bulk delete')

  let deleted = 0
  for (const id of ids) if (await deletePhoto(id)) deleted++
  logEvent(event, 'warn', 'delete', `Deleted ${deleted} photos at once`)
  return { deleted }
})
