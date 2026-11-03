import argon2 from 'argon2'
import type { H3Event } from 'h3'
import { db } from '../db'

const KNOWN_COOKIE = 'known_browser'
const KNOWN_MAX_AGE = 400 * 24 * 60 * 60 // The longest a browser keeps a cookie.

/** True when this browser carries the cookie from an earlier successful login. */
export function isKnownBrowser(event: H3Event): boolean {
  const token = getCookie(event, KNOWN_COOKIE)
  if (!token) return false
  const hash = sha256(token)
  const found = db.prepare(`UPDATE known_browsers SET last_used = datetime('now') WHERE hash = ?`).run(hash).changes > 0
  return found
}

/** After a successful login, remembers this browser. Only the hash is stored. */
export function rememberBrowser(event: H3Event): void {
  if (isKnownBrowser(event)) return
  const token = randomToken()
  db.prepare(`INSERT INTO known_browsers (hash) VALUES (?)`).run(sha256(token))
  // Browsers not used for a year are forgotten.
  db.prepare(`DELETE FROM known_browsers WHERE last_used < datetime('now', '-400 days')`).run()
  setCookie(event, KNOWN_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: KNOWN_MAX_AGE })
}

/**
 * Checks the admin password for login and for the guarded deletes. While this address is locked
 * out it refuses without checking. A wrong password counts toward the lockout and says how many
 * tries are left; a right one resets the count.
 */
export async function verifyAdminPassword(event: H3Event, password: unknown, purpose = 'login'): Promise<void> {
  const ip = clientIp(event)
  const key = ipBucket(ip)
  const prefix = prefixBucket(ip)
  // Someone already logged in, or on a browser that has logged in before, isn't held to the flood
  // limits, so a flood of guesses from elsewhere can't keep the owner out.
  const trusted = Boolean(event.context.admin) || isKnownBrowser(event)

  const locked = loginLockout(key, Date.now(), { prefix, trusted })
  if (locked > 0) {
    setResponseHeader(event, 'Retry-After', Math.ceil(locked / 1000))
    throw createError({ statusCode: 429, statusMessage: lockoutMessage(locked) })
  }

  const { adminPasswordHash } = useRuntimeConfig(event)
  if (!adminPasswordHash) {
    console.error('[auth] NUXT_ADMIN_PASSWORD_HASH is not set')
    throw createError({ statusCode: 500, statusMessage: 'Login is not configured' })
  }

  // Counted before checking, and refunded if right.
  const attempt = reserveLoginAttempt(key, { trusted, prefix })

  // Bounded so an oversized password can't be used to waste hashing time.
  const text = typeof password === 'string' ? password : ''
  const valid = text.length > 0 && text.length <= 1024 && await argon2.verify(adminPasswordHash, text)
  if (valid) {
    clearLoginAttempts(key, attempt.at, prefix)
    return
  }

  if (attempt.lockedMs > 0) {
    console.warn(`[auth] ${purpose} locked out after wrong passwords ip=${ip}`)
    setResponseHeader(event, 'Retry-After', Math.ceil(attempt.lockedMs / 1000))
    throw createError({ statusCode: 429, statusMessage: lockoutMessage(attempt.lockedMs) })
  }
  console.warn(`[auth] ${purpose} wrong password ip=${ip}`)
  throw createError({
    statusCode: 401,
    statusMessage: `Wrong password. ${attempt.triesLeft} ${attempt.triesLeft === 1 ? 'try' : 'tries'} left before a ${LOCKOUT_MS / 60_000}-minute lockout.`,
  })
}
