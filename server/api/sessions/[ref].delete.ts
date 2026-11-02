// Role: admin. Signs out one session, for the stolen-phone case.
import { db } from '../../db'
import type { Session } from '../../types'

export default defineEventHandler((event) => {
  const ref = getRouterParam(event, 'ref')
  const rows = db.prepare<[], Pick<Session, 'id'>>(`SELECT id FROM sessions`).all()
  const match = rows.find(row => sessionRef(row.id) === ref)
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(match.id)
  console.log(`[auth] session revoked ip=${clientIp(event)}`)
  return { ok: true }
})
