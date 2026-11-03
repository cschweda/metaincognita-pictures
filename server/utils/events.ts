// The Activity log. Everything security-relevant goes here, as well as to the server's console,
// so the owner can read it from their phone. Old rows are pruned, so a flood of wrong passwords
// can't fill the disk.
import type { H3Event } from 'h3'
import { db } from '../db'

export type EventKind = 'login' | 'session' | 'pair' | 'frame' | 'delete' | 'photo' | 'demo'
const KEEP_DAYS = 90
const KEEP_ROWS = 20_000
let sincePrune = 0

/** Records an event. Pass the request when there is one, for its IP address and browser. */
export function logEvent(event: H3Event | null, level: 'info' | 'warn', kind: EventKind, message: string): void {
  const ip = event ? clientIp(event) : null
  const agent = event ? (getHeader(event, 'user-agent') ?? '').slice(0, 200) || null : null
  ;(level === 'warn' ? console.warn : console.log)(`[${kind}] ${message}${ip ? ` ip=${ip}` : ''}`)
  try {
    db.prepare(`INSERT INTO events (level, kind, message, ip, agent) VALUES (?, ?, ?, ?, ?)`).run(level, kind, message.slice(0, 500), ip, agent)
    if (++sincePrune >= 200) {
      sincePrune = 0
      db.prepare(`DELETE FROM events WHERE at < datetime('now', ?)`).run(`-${KEEP_DAYS} days`)
      db.prepare(`DELETE FROM events WHERE id <= (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(KEEP_ROWS)
    }
  }
  catch (error) {
    console.error('[events] could not record', error)
  }
}
