// Role: admin. Shows what is about to be approved (Doc 06 §5).
import { db } from '../../db'

export default defineEventHandler((event) => {
  const session = currentSessionRef(event) ?? 'none'
  if (!allowRequest(`pair-lookup:${session}`, 20, 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }

  const pairing = findPendingPairing(String(getQuery(event).code ?? ''))
  if (!pairing) throw createError({ statusCode: 404, statusMessage: 'Code not found or expired' })

  const age = db.prepare<[string], { seconds: number }>(
    `SELECT CAST(strftime('%s', 'now') - strftime('%s', created_at) AS INTEGER) AS seconds
     FROM pairings WHERE id = ?`,
  ).get(pairing.id)

  return {
    code: formatCode(pairing.code),
    ip: pairing.ip,
    screen_w: pairing.screen_w,
    screen_h: pairing.screen_h,
    dpr: pairing.dpr,
    age_seconds: age?.seconds ?? 0,
  }
})
