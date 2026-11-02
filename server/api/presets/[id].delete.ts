// Role: admin. Deletes a preset. Frames using its filter keep that filter.
import { db } from '../../db'

export default defineEventHandler((event) => {
  const result = db.prepare(`DELETE FROM presets WHERE id = ?`).run(getRouterParam(event, 'id') ?? '')
  if (result.changes === 0) throw createError({ statusCode: 404, statusMessage: 'Preset not found' })
  return { ok: true }
})
