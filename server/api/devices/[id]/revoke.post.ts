// Role: admin. Retires a frame. It returns to the pairing screen on its next request.
import { db } from '../../../db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const result = db.prepare(`UPDATE devices SET revoked = 1 WHERE id = ? AND revoked = 0`).run(id)
  if (result.changes === 0) throw createError({ statusCode: 404, statusMessage: 'Frame not found' })

  closeFrameStreams(id)
  console.log(`[devices] revoked ${id} ip=${clientIp(event)}`)
  return { ok: true }
})
