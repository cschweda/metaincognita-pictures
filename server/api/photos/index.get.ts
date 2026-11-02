// Role: admin. In display order; pass `next` back as `before` for the following page.
import { db } from '../../db'
import type { Photo } from '../../types'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 200)
  const before = query.before === undefined ? Number.MAX_VALUE : Number(query.before)
  if (Number.isNaN(before)) throw createError({ statusCode: 400, statusMessage: 'Invalid before' })

  const tag = typeof query.tag === 'string' ? query.tag : null
  const clause = tag === 'memories'
    ? { sql: `strftime('%m-%d', taken_at) = strftime('%m-%d', 'now')`, params: [] }
    : filterClause({ tags: tag ? [tag] : [], mode: 'any' })
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  // LIKE wildcards in the search text are matched literally.
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
  const searchSql = search ? `AND (filename LIKE ? ESCAPE '\\' OR caption LIKE ? ESCAPE '\\')` : ''

  const photos = db.prepare<unknown[], Photo>(
    `SELECT * FROM photos WHERE position < ? AND ${clause.sql} ${searchSql} ORDER BY position DESC LIMIT ?`,
  ).all(before, ...clause.params, ...(search ? [pattern, pattern] : []), limit)

  const tagRows = photos.length === 0
    ? []
    : db.prepare<string[], { photo_id: string, id: string, name: string }>(
        `SELECT pt.photo_id, t.id, t.name FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
         WHERE pt.photo_id IN (${photos.map(() => '?').join(', ')}) ORDER BY t.name COLLATE NOCASE`,
      ).all(...photos.map(photo => photo.id))

  return {
    photos: photos.map(photo => ({
      ...photo,
      tags: tagRows.filter(row => row.photo_id === photo.id).map(({ id, name }) => ({ id, name })),
    })),
    next: photos.length === limit ? photos.at(-1)?.position ?? null : null,
  }
})
