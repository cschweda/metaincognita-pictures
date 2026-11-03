import { db } from '../db'

/** Deletes tags and takes them out of every frame filter and preset. Call inside a transaction. */
export function deleteTagsAndFilters(ids: string[]): number {
  if (ids.length === 0) return 0
  const remove = db.prepare(`DELETE FROM tags WHERE id = ?`)
  const deleted = ids.reduce((sum, id) => sum + remove.run(id).changes, 0)
  const gone = new Set(ids)
  for (const table of ['devices', 'presets']) {
    const rows = db.prepare<[], { id: string, filter: string }>(`SELECT id, filter FROM ${table}`).all()
    const update = db.prepare(`UPDATE ${table} SET filter = ? WHERE id = ?`)
    for (const row of rows) {
      const filter = parseFilter(row.filter)
      if (!filter.tags.some(tag => gone.has(tag))) continue
      update.run(JSON.stringify({ ...filter, tags: filter.tags.filter(tag => !gone.has(tag)) }), row.id)
    }
  }
  return deleted
}
