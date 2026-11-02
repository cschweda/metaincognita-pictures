// Role: admin. Deletes a tag and takes it out of every frame filter and preset.
import { db } from '../../db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const removed = db.transaction(() => {
    const result = db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
    if (result.changes === 0) return false

    for (const table of ['devices', 'presets']) {
      const rows = db.prepare<[], { id: string, filter: string }>(`SELECT id, filter FROM ${table}`).all()
      const update = db.prepare(`UPDATE ${table} SET filter = ? WHERE id = ?`)
      for (const row of rows) {
        const filter = parseFilter(row.filter)
        if (!filter.tags.includes(id)) continue
        update.run(JSON.stringify({ ...filter, tags: filter.tags.filter(tag => tag !== id) }), row.id)
      }
    }
    return true
  })()

  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  pushToAllFrames('playlist-changed')
  return { ok: true }
})
