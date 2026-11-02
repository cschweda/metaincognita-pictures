// Role: admin. Renames a tag. Filters store ids, so they keep working.
import { db } from '../../db'
import type { Tag } from '../../types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: unknown }>(event)
  const name = cleanTagName(body?.name)
  try {
    const tag = db.prepare<[string, string], Tag>(`UPDATE tags SET name = ? WHERE id = ? RETURNING *`)
      .get(name, getRouterParam(event, 'id') ?? '')
    if (!tag) throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
    return { tag }
  }
  catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw createError({ statusCode: 409, statusMessage: 'That tag already exists' })
    }
    throw error
  }
})
