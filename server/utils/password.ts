import argon2 from 'argon2'
import type { H3Event } from 'h3'
import { db } from '../db'

const KNOWN_COOKIE = 'known_browser'
const KNOWN_MAX_AGE = 400 * 24 * 60 * 60 // The longest a browser keeps a cookie.

/**
 * The stored form of a known-browser token. It's tied to the current password hash, so changing
 * the password forgets every remembered browser.
 */
function knownHash(event: H3Event, token: string): string {
  return sha256(`${token}:${useRuntimeConfig(event).adminPasswordHash}`)
}

/** This browser's known-browser key, when it carries a valid cookie from an earlier login. */
export function knownBrowserKey(event: H3Event): string | null {
  const token = getCookie(event, KNOWN_COOKIE)
  if (!token) return null
  const hash = knownHash(event, token)
  return db.prepare(`SELECT 1 FROM known_browsers WHERE hash = ?`).get(hash) ? `known:${hash}` : null
}

/** After a successful login, remembers this browser, or notes that it was used. Only a hash is stored. */
export function rememberBrowser(event: H3Event): void {
  const token = getCookie(event, KNOWN_COOKIE)
  if (token && db.prepare(`UPDATE known_browsers SET last_used = datetime('now') WHERE hash = ?`).run(knownHash(event, token)).changes) return
  const fresh = randomToken()
  db.prepare(`INSERT INTO known_browsers (hash) VALUES (?)`).run(knownHash(event, fresh))
  // Browsers not used for 400 days are forgotten.
  db.prepare(`DELETE FROM known_browsers WHERE last_used < datetime('now', '-400 days')`).run()
  setCookie(event, KNOWN_COOKIE, fresh, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: KNOWN_MAX_AGE })
}

/** Forgets every remembered browser. They face the flood limits again until their next login. */
export function forgetAllBrowsers(): number {
  return db.prepare(`DELETE FROM known_browsers`).run().changes
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
  // limits, so a flood of guesses from elsewhere can't keep the owner out. A known browser's
  // cookie has five tries of its own, wherever it's used from, so a leaked one can't multiply guesses.
  const known = knownBrowserKey(event)
  const trusted = Boolean(event.context.admin) || Boolean(known)

  const locked = Math.max(loginLockout(key, Date.now(), { prefix, trusted }), known ? loginLockout(known, Date.now(), { trusted: true }) : 0)
  if (locked > 0) {
    logEvent(event, 'warn', 'login', `Refused while locked out (${purpose})`)
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
  const tokenAttempt = known ? reserveLoginAttempt(known, { trusted: true }) : null

  // Bounded so an oversized password can't be used to waste hashing time.
  const text = typeof password === 'string' ? password : ''
  const valid = text.length > 0 && text.length <= 1024 && await argon2.verify(adminPasswordHash, text)
  if (valid) {
    clearLoginAttempts(key, attempt.at, prefix)
    if (known) clearLoginAttempts(known, tokenAttempt?.at)
    return
  }

  if (tokenAttempt && tokenAttempt.lockedMs > attempt.lockedMs) {
    attempt.lockedMs = tokenAttempt.lockedMs
    attempt.triesLeft = 0
  }
  if (attempt.lockedMs > 0) {
    logEvent(event, 'warn', 'login', `Locked out for 5 minutes after wrong passwords (${purpose})`)
    setResponseHeader(event, 'Retry-After', Math.ceil(attempt.lockedMs / 1000))
    throw createError({ statusCode: 429, statusMessage: lockoutMessage(attempt.lockedMs) })
  }
  logEvent(event, 'warn', 'login', `Wrong password (${purpose}), ${attempt.triesLeft} ${attempt.triesLeft === 1 ? 'try' : 'tries'} left`)
  throw createError({
    statusCode: 401,
    statusMessage: `Wrong password. ${attempt.triesLeft} ${attempt.triesLeft === 1 ? 'try' : 'tries'} left before a ${LOCKOUT_MS / 60_000}-minute lockout.`,
  })
}
