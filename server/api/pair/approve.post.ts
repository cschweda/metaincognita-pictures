// Role: admin. Marks a pairing approved. The token is created on the frame's next poll.
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const session = currentSessionRef(event) ?? 'none'
  if (!allowRequest(`pair-approve:${session}`, 5, 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }

  const body = await readBody<{ code?: unknown, name?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 60) {
    throw createError({ statusCode: 400, statusMessage: 'Give the frame a name of up to 60 characters' })
  }

  const pairing = findPendingPairing(typeof body?.code === 'string' ? body.code : '')
  if (!pairing) throw createError({ statusCode: 404, statusMessage: 'Code not found or expired' })

  db.prepare(
    `UPDATE pairings SET status = 'approved', name = ?, expires_at = datetime('now', '+10 minutes')
     WHERE id = ? AND status = 'pending'`,
  ).run(name, pairing.id)

  logEvent(event, 'info', 'pair', `Approved a frame named ${JSON.stringify(name)}, from ${pairing.ip ?? 'an unknown address'}`)
  return { ok: true, name }
})
