// Role: device. Records that this frame is alive and what it is showing, and rotates its token every 30 days.
import { db } from '../../db'

const ROTATE_AFTER = '-30 days'

function rotateToken(deviceId: string): string | null {
  const due = db.prepare<[string, string], { id: string }>(
    `SELECT id FROM devices WHERE id = ? AND (token_rotated_at IS NULL OR token_rotated_at <= datetime('now', ?))`,
  ).get(deviceId, ROTATE_AFTER)
  if (!due) return null

  const token = randomToken()
  db.prepare(
    `UPDATE devices SET
       prev_token_hash = token_hash,
       prev_token_expires_at = datetime('now', '+24 hours'),
       token_hash = ?,
       token_rotated_at = datetime('now')
     WHERE id = ?`,
  ).run(sha256(token), deviceId)
  return token
}

export default defineEventHandler(async (event) => {
  const deviceId = event.context.device!.id
  const body = await readBody<{ photo_id?: unknown }>(event)
  const photoId = typeof body?.photo_id === 'string' ? body.photo_id : null

  db.prepare(`UPDATE devices SET last_seen_at = datetime('now'), current_photo_id = ? WHERE id = ?`)
    .run(photoId, deviceId)

  const token = rotateToken(deviceId)
  if (token) {
    setDeviceCookie(event, token)
    console.log(`[devices] token rotated ${deviceId}`)
  }
  return { ok: true }
})
