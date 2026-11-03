// Role: device. Records that this frame is alive and what it is showing, and rotates its token every 30 days.
import { db } from '../../db'

const ROTATE_AFTER = '-30 days'
const PHOTO_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/

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
  const body = await readBody<{ photo_id?: unknown, paused?: unknown }>(event)
  // The admin's browser builds an image address from this, so only a real photo id is kept.
  const claimed = typeof body?.photo_id === 'string' && PHOTO_ID.test(body.photo_id) ? body.photo_id : null
  const photoId = claimed && db.prepare(`SELECT 1 FROM photos WHERE id = ?`).get(claimed) ? claimed : null

  // A frame beats at least once a minute. A gap of three minutes means it was off or out of reach,
  // so its "online for" starts again.
  db.prepare(
    `UPDATE devices SET
       online_since = CASE WHEN last_seen_at IS NULL OR last_seen_at < datetime('now', '-3 minutes') OR online_since IS NULL
         THEN datetime('now') ELSE online_since END,
       last_seen_at = datetime('now'),
       current_photo_id = ?,
       paused = ?
     WHERE id = ?`,
  ).run(photoId, body?.paused === true ? 1 : 0, deviceId)

  const token = rotateToken(deviceId)
  if (token) {
    setDeviceCookie(event, token)
    logEvent(event, 'info', 'frame', `Renewed the security token of the frame ${JSON.stringify(event.context.device!.name)}`)
  }
  return { ok: true }
})
