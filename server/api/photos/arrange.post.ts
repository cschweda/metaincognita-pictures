// Role: admin. Replaces the manual order with date taken, newest first. Undated photos go last.
import { db } from '../../db'

export default defineEventHandler(() => {
  db.exec(`UPDATE photos SET position = (
    SELECT n FROM (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY taken_at IS NOT NULL ASC, COALESCE(taken_at, uploaded_at) ASC, id ASC
      ) AS n FROM photos
    ) AS ranked WHERE ranked.id = photos.id
  )`)
  pushToAllFrames('playlist-changed')
  return { ok: true }
})
