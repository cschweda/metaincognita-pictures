// Role: admin. In live mode, removes the demo's photos, playlists, preset, and unused tags, and
// keeps the owner's. It is a bulk delete, so it needs the count typed by hand and the password.
import argon2 from 'argon2'

export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  const wait = takeLoginAttempt(ipBucket(ip))
  if (wait > 0) {
    setResponseHeader(event, 'Retry-After', Math.ceil(wait / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }
  const count = demoPhotoCount()
  if (count === 0) throw createError({ statusCode: 404, statusMessage: 'There are no demo photos' })

  const body = await readBody<{ phrase?: unknown, password?: unknown }>(event)
  const expected = `delete ${count} demo photos`
  if (body?.phrase !== expected) throw createError({ statusCode: 400, statusMessage: `Type "${expected}" exactly` })
  const password = typeof body?.password === 'string' ? body.password : ''
  const { adminPasswordHash } = useRuntimeConfig(event)
  if (!(password.length > 0 && password.length <= 1024 && await argon2.verify(adminPasswordHash, password))) {
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }
  clearLoginAttempts(ipBucket(ip)) // A correct password counts like a login.
  const removed = await removeDemo()
  console.warn(`[demo] removed ${removed} demo photos ip=${ip}`)
  return { removed }
})
