// Role: admin. Lists login sessions. Raw session ids never leave the server.
import { db } from '../../db'
import type { Session } from '../../types'

export default defineEventHandler((event) => {
  const current = currentSessionRef(event)
  const rows = db.prepare<[], Session>(`SELECT * FROM sessions ORDER BY last_seen_at DESC`).all()
  return {
    sessions: rows.map(row => ({
      ref: sessionRef(row.id),
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      user_agent: row.user_agent,
      ip: row.ip,
      current: sessionRef(row.id) === current,
    })),
  }
})
