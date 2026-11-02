// Role: admin. In display order; pass `next` back as `before` for the following page.
import { db } from '../../db'
import type { Photo } from '../../types'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 200)
  const before = query.before === undefined ? Number.MAX_VALUE : Number(query.before)
  if (Number.isNaN(before)) throw createError({ statusCode: 400, statusMessage: 'Invalid before' })

  const photos = db.prepare<[number, number], Photo>(
    `SELECT * FROM photos WHERE position < ? ORDER BY position DESC LIMIT ?`,
  ).all(before, limit)

  return { photos, next: photos.length === limit ? photos.at(-1)?.position ?? null : null }
})
