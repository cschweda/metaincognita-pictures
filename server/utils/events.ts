// The Activity log. Everything security-relevant goes here, as well as to the server's console,
// so the owner can read it from their phone. Old rows are pruned, so a flood of wrong passwords
// can't fill the disk. Warnings and ordinary events are capped separately, and the same warning
// from the same address is recorded at most once a minute, so a flood of guesses can't push
// logins, pairings, and deletes out of the log.
import type { H3Event } from 'h3'
import { db } from '../db'

export type EventKind = 'login' | 'session' | 'pair' | 'frame' | 'delete' | 'photo' | 'demo' | 'security'
const KEEP_DAYS = 90
const KEEP_ROWS = { info: 10_000, warn: 10_000 }
const REPEAT_WINDOW_MS = 60_000
const recentWarnings = new Map<string, number>()
let sincePrune = 0

/** True when this exact warning from this address was already recorded in the last minute. */
function isRepeat(ip: string | null, kind: string, message: string, now: number): boolean {
  const key = `${ip}|${kind}|${message}`
  const last = recentWarnings.get(key)
  if (last !== undefined && now - last < REPEAT_WINDOW_MS) return true
  recentWarnings.set(key, now)
  if (recentWarnings.size > 5_000) {
    for (const [entry, at] of recentWarnings) if (now - at >= REPEAT_WINDOW_MS) recentWarnings.delete(entry)
    // Still full: thousands of distinct addresses in a minute. Start counting afresh.
    if (recentWarnings.size > 5_000) recentWarnings.clear()
  }
  return false
}

/** Records an event. Pass the request when there is one, for its IP address and browser. */
export function logEvent(event: H3Event | null, level: 'info' | 'warn', kind: EventKind, message: string): void {
  const ip = event ? clientIp(event) : null
  const agent = event ? (getHeader(event, 'user-agent') ?? '').slice(0, 200) || null : null
  ;(level === 'warn' ? console.warn : console.log)(`[${kind}] ${message}${ip ? ` ip=${ip}` : ''}`)
  if (level === 'warn' && isRepeat(ip, kind, message, Date.now())) return
  try {
    db.prepare(`INSERT INTO events (level, kind, message, ip, agent) VALUES (?, ?, ?, ?, ?)`).run(level, kind, message.slice(0, 500), ip, agent)
    if (++sincePrune >= 200) {
      sincePrune = 0
      db.prepare(`DELETE FROM events WHERE at < datetime('now', ?)`).run(`-${KEEP_DAYS} days`)
      for (const [which, keep] of Object.entries(KEEP_ROWS)) {
        db.prepare(`DELETE FROM events WHERE level = ? AND id <= (SELECT id FROM events WHERE level = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(which, which, keep)
      }
    }
  }
  catch (error) {
    console.error('[events] could not record', error)
  }
}
