import type { H3Event } from 'h3'
import { db } from '../db'
import type { Session } from '../types'
import { randomToken } from './tokens'

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
  db.prepare(`INSERT INTO sessions (id, user_agent, ip) VALUES (?, ?, ?)`)
    .run(id, getHeader(event, 'user-agent') ?? null, clientIp(event))
  setSessionCookie(event, id)
}

/** Returns true for a live session, and slides its 14-day expiry at most once a minute. */
export function readSession(event: H3Event): boolean {
  const id = getCookie(event, COOKIE)
  if (!id) return false

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
  if (bumped.changes > 0) setSessionCookie(event, id)
  return true
}

export function destroySession(event: H3Event): void {
  const id = getCookie(event, COOKIE)
  if (id) db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
  deleteCookie(event, COOKIE, { path: '/' })
}
