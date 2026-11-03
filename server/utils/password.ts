import argon2 from 'argon2'
import type { H3Event } from 'h3'

/**
 * Checks the admin password for login and for the guarded deletes. While this address is locked
 * out it refuses without checking. A wrong password counts toward the lockout and says how many
 * tries are left; a right one resets the count.
 */
export async function verifyAdminPassword(event: H3Event, password: unknown, purpose = 'login'): Promise<void> {
  const ip = clientIp(event)
  const key = ipBucket(ip)

  const locked = loginLockout(key)
  if (locked > 0) {
    setResponseHeader(event, 'Retry-After', Math.ceil(locked / 1000))
    throw createError({ statusCode: 429, statusMessage: lockoutMessage(locked) })
  }

  const { adminPasswordHash } = useRuntimeConfig(event)
  if (!adminPasswordHash) {
    console.error('[auth] NUXT_ADMIN_PASSWORD_HASH is not set')
    throw createError({ statusCode: 500, statusMessage: 'Login is not configured' })
  }

  // Bounded so an oversized password can't be used to waste hashing time.
  const text = typeof password === 'string' ? password : ''
  const valid = text.length > 0 && text.length <= 1024 && await argon2.verify(adminPasswordHash, text)
  if (valid) {
    clearLoginAttempts(key)
    return
  }

  const { triesLeft, lockedMs } = recordLoginFailure(key)
  if (lockedMs > 0) {
    console.warn(`[auth] ${purpose} locked out after wrong passwords ip=${ip}`)
    setResponseHeader(event, 'Retry-After', Math.ceil(lockedMs / 1000))
    throw createError({ statusCode: 429, statusMessage: lockoutMessage(lockedMs) })
  }
  console.warn(`[auth] ${purpose} wrong password ip=${ip}`)
  throw createError({
    statusCode: 401,
    statusMessage: `Wrong password. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left before a ${LOCKOUT_MS / 60_000}-minute lockout.`,
  })
}
