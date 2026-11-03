// Role: admin. The Activity log, newest first, 100 at a time. `level=warn` shows warnings only;
// `kind` picks one kind; `before` is the id to page back from.
import { db } from '../../db'

const KINDS = new Set(['login', 'session', 'pair', 'frame', 'delete', 'photo', 'demo'])

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const where: string[] = []
  const params: (string | number)[] = []
  if (query.level === 'warn') where.push(`level = 'warn'`)
  if (typeof query.kind === 'string' && KINDS.has(query.kind)) {
    where.push('kind = ?')
    params.push(query.kind)
  }
  const before = Number(query.before)
  if (Number.isInteger(before) && before > 0) {
    where.push('id < ?')
    params.push(before)
  }
  const rows = db.prepare<(string | number)[], { id: number, at: string, level: string, kind: string, message: string, ip: string | null, agent: string | null }>(
    `SELECT * FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 100`,
  ).all(...params)
  const warnings24h = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM events WHERE level = 'warn' AND at > datetime('now', '-1 day')`).get()?.n ?? 0
  return { events: rows, next: rows.length === 100 ? rows.at(-1)!.id : null, warnings_24h: warnings24h }
})
