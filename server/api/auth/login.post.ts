// Role: public. Requires the X-Requested-With header.
import argon2 from 'argon2'

export default defineEventHandler(async (event) => {
  const { adminPasswordHash } = useRuntimeConfig(event)
  if (!adminPasswordHash) {
    console.error('[auth] NUXT_ADMIN_PASSWORD_HASH is not set')
    throw createError({ statusCode: 500, statusMessage: 'Login is not configured' })
  }

  const ip = clientIp(event)
  const wait = takeLoginAttempt(ip)
  if (wait > 0) {
    console.warn(`[auth] login rate limited ip=${ip}`)
    setResponseHeader(event, 'Retry-After', Math.ceil(wait / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }

  const body = await readBody<{ password?: unknown }>(event)
  const password = typeof body?.password === 'string' ? body.password : ''

  // Bounded so an oversized password can't be used to waste hashing time.
  const valid = password.length > 0 && password.length <= 1024
    && await argon2.verify(adminPasswordHash, password)

  if (!valid) {
    console.warn(`[auth] login failed ip=${ip}`)
    throw createError({ statusCode: 401, statusMessage: 'Invalid password' })
  }

  clearLoginAttempts(ip)
  createSession(event)
  console.log(`[auth] login succeeded ip=${ip}`)
  return { ok: true }
})
