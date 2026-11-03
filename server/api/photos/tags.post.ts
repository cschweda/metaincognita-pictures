// Role: admin. Adds and removes tags on many photos at once.
import { db } from '../../db'

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ photo_ids?: unknown, add?: unknown, remove?: unknown }>(event)
  const photoIds = strings(body?.photo_ids)
  const add = strings(body?.add)
  const remove = strings(body?.remove)
  if (photoIds.length === 0 || photoIds.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'Send between 1 and 1000 photo_ids' })
  }
  // Each pair is a database write in one transaction, which blocks the server while it runs.
  if (add.length > 100 || remove.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Add or remove at most 100 tags at a time' })
  }

  const link = db.prepare(`INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)`)
  const unlink = db.prepare(`DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?`)
  try {
    db.transaction(() => {
      for (const photoId of photoIds) {
        for (const tagId of add) link.run(photoId, tagId)
        for (const tagId of remove) unlink.run(photoId, tagId)
      }
    })()
  }
  catch (error) {
    if (String((error as { code?: string }).code).startsWith('SQLITE_CONSTRAINT')) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown photo or tag' })
    }
    throw error
  }

  pushToAllFrames('playlist-changed')
  return { ok: true }
})
