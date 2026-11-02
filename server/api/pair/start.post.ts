// Role: public. A frame asks for a pairing code.
import { db } from '../../db'
import type { Pairing } from '../../types'

const MAX_PENDING = 100

function dimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 20000 ? value : null
}

export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  if (!allowRequest(`pair-start:${ip}`, 12, 60 * 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many pairing requests' })
  }

  const pending = db.prepare<[], { count: number }>(
    `SELECT COUNT(*) AS count FROM pairings WHERE status = 'pending' AND expires_at > datetime('now')`,
  ).get()
  if ((pending?.count ?? 0) >= MAX_PENDING) {
    throw createError({ statusCode: 429, statusMessage: 'Too many pairing requests' })
  }

  const body = await readBody<{ screen_w?: unknown, screen_h?: unknown, dpr?: unknown }>(event)
  const insert = db.prepare<[string, string, string, number | null, number | null, number | null], Pairing>(
    `INSERT INTO pairings (id, code, ip, screen_w, screen_h, dpr, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+10 minutes'))
     ON CONFLICT (code) DO NOTHING
     RETURNING *`,
  )

  for (let attempt = 0; attempt < 5; attempt++) {
    const pairing = insert.get(
      randomToken(), // Polling uses this long id, so seeing the code doesn't allow polling.
      newPairingCode(),
      ip,
      dimension(body?.screen_w),
      dimension(body?.screen_h),
      dimension(body?.dpr),
    )
    if (pairing) {
      console.log(`[pair] start ip=${ip}`)
      return { pairing_id: pairing.id, code: formatCode(pairing.code), expires_at: pairing.expires_at }
    }
  }
  throw createError({ statusCode: 503, statusMessage: 'Could not create a code' })
})
