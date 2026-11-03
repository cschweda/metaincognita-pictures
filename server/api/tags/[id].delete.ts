// Role: admin. Deletes a tag and takes it out of every frame filter and preset.
import { db } from '../../db'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const removed = db.transaction(() => deleteTagsAndFilters([id]))()
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  pushToAllFrames('playlist-changed')
  return { ok: true }
})
