// Role: admin. Saves a filter under a name.
import { ulid } from 'ulid'
import { db } from '../../db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: unknown, filter?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 60) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const filter = validateFilter(body?.filter)
  const id = ulid()
  db.prepare(`INSERT INTO presets (id, name, filter) VALUES (?, ?, ?)`).run(id, name, JSON.stringify(filter))
  return { preset: { id, name, filter } }
})
