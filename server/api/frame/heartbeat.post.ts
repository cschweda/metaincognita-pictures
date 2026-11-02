// Role: device. Records that this frame is alive and which photo it is showing.
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ photo_id?: unknown }>(event)
  const photoId = typeof body?.photo_id === 'string' ? body.photo_id : null
  db.prepare(`UPDATE devices SET last_seen_at = datetime('now'), current_photo_id = ? WHERE id = ?`)
    .run(photoId, event.context.device!.id)
  return { ok: true }
})
