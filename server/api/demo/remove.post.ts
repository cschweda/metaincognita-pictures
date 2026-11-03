// Role: admin. In live mode, removes the demo's photos, playlists, preset, and unused tags, and
// keeps the owner's. It is a bulk delete, so it needs the count typed by hand and the password.
export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  const count = demoPhotoCount()
  if (count === 0) throw createError({ statusCode: 404, statusMessage: 'There are no demo photos' })

  const body = await readBody<{ phrase?: unknown, password?: unknown }>(event)
  const expected = `delete ${count} demo photos`
  if (body?.phrase !== expected) throw createError({ statusCode: 400, statusMessage: `Type "${expected}" exactly` })
  await verifyAdminPassword(event, body?.password, 'demo removal')
  const removed = await removeDemo()
  console.warn(`[demo] removed ${removed} demo photos ip=${ip}`)
  return { removed }
})
