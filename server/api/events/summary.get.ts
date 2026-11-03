// Role: admin. How many warnings the Activity log has from the last 24 hours, for the admin bar.
import { db } from '../../db'

export default defineEventHandler(() => ({
  warnings_24h: db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM events WHERE level = 'warn' AND at > datetime('now', '-1 day')`).get()?.n ?? 0,
}))
