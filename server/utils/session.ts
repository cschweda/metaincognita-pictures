import type { H3Event } from 'h3'
import { db } from '../db'
import type { Session } from '../types'
import { randomToken, sha256 } from './tokens'

const COOKIE = 'admin_session'
const MAX_AGE_SECONDS = 1_209_600 // 14 days

function setSessionCookie(event: H3Event, id: string) {
  setCookie(event, COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/** The client IP. Nginx overwrites X-Real-IP; the socket address is the dev fallback. */
export function clientIp(event: H3Event): string {
  return getHeader(event, 'x-real-ip') || event.node.req.socket.remoteAddress || 'unknown'
}

export function createSession(event: H3Event): void {
  const id = randomToken()
  // Only the hash is stored, so a database backup can't be used to log in.
  db.prepare(`INSERT INTO sessions (id, user_agent, ip) VALUES (?, ?, ?)`)
    .run(sha256(id), getHeader(event, 'user-agent') ?? null, clientIp(event))
  setSessionCookie(event, id)
}

/** Returns true for a live session, and slides its 14-day expiry at most once a minute. */
export function readSession(event: H3Event): boolean {
  const cookie = getCookie(event, COOKIE)
  if (!cookie) return false

  const id = sha256(cookie)
  const session = db.prepare<[string, string], Session>(
    `SELECT * FROM sessions WHERE id = ? AND last_seen_at > datetime('now', ?)`,
  ).get(id, `-${MAX_AGE_SECONDS} seconds`)

  if (!session) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
    deleteCookie(event, COOKIE, { path: '/' })
    return false
  }

  const bumped = db.prepare(
    `UPDATE sessions SET last_seen_at = datetime('now')
     WHERE id = ? AND last_seen_at < datetime('now', '-1 minute')`,
  ).run(id)
  if (bumped.changes > 0) setSessionCookie(event, cookie)
  return true
}

/** A short reference to a stored session, for the admin UI. */
export function sessionRef(storedId: string): string {
  return storedId.slice(0, 32)
}

export function currentSessionRef(event: H3Event): string | null {
  const cookie = getCookie(event, COOKIE)
  return cookie ? sessionRef(sha256(cookie)) : null
}

export function destroySession(event: H3Event): void {
  const cookie = getCookie(event, COOKIE)
  if (cookie) db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sha256(cookie))
  deleteCookie(event, COOKIE, { path: '/' })
}
