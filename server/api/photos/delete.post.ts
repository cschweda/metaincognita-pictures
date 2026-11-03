// Role: admin. Deletes two or more photos at once. Like the nuclear option, it needs a phrase typed
// by hand ("delete 12 photos", matching the count) and the admin password, so it can't happen by
// a stray click.
import argon2 from 'argon2'

export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  const wait = takeLoginAttempt(ipBucket(ip)) // It checks the password, so it shares login's limit.
  if (wait > 0) {
    setResponseHeader(event, 'Retry-After', Math.ceil(wait / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }

  const body = await readBody<{ photo_ids?: unknown, phrase?: unknown, password?: unknown }>(event)
  const ids = Array.isArray(body?.photo_ids) ? [...new Set(body.photo_ids.filter((id): id is string => typeof id === 'string'))] : []
  if (ids.length < 2 || ids.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'Send 2 to 1000 photo ids. One photo has its own delete' })
  }
  if (body?.phrase !== bulkDeletePhrase(ids.length)) {
    throw createError({ statusCode: 400, statusMessage: `Type "${bulkDeletePhrase(ids.length)}" exactly` })
  }
  const password = typeof body?.password === 'string' ? body.password : ''
  const { adminPasswordHash } = useRuntimeConfig(event)
  if (!(password.length > 0 && password.length <= 1024 && await argon2.verify(adminPasswordHash, password))) {
    console.warn(`[photos] bulk delete wrong password ip=${ip}`)
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }

  let deleted = 0
  for (const id of ids) if (await deletePhoto(id)) deleted++
  console.warn(`[photos] bulk deleted ${deleted} of ${ids.length} ip=${ip}`)
  return { deleted }
})
