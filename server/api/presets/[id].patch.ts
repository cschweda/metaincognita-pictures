// Role: admin. Renames a preset or replaces its filter.
import { db } from '../../db'
import type { Preset } from '../../types'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ name?: unknown, filter?: unknown }>(event)

  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 60) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
    db.prepare(`UPDATE presets SET name = ?, demo = 0 WHERE id = ?`).run(name, id) // Edited, so it's the owner's now.
  }
  if (body?.filter !== undefined) {
    db.prepare(`UPDATE presets SET filter = ?, demo = 0 WHERE id = ?`).run(JSON.stringify(validateFilter(body.filter)), id)
  }

  const preset = db.prepare<[string], Preset>(`SELECT * FROM presets WHERE id = ?`).get(id)
  if (!preset) throw createError({ statusCode: 404, statusMessage: 'Preset not found' })
  return { preset: { ...preset, filter: parseFilter(preset.filter) } }
})
