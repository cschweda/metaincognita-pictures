// Role: admin. Creates a tag, or returns the one that already has this name.
import { ulid } from 'ulid'
import { db } from '../../db'
import type { Tag } from '../../types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: unknown }>(event)
  const name = cleanTagName(body?.name)
  db.prepare(`INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)`).run(ulid(), name)
  return { tag: db.prepare<[string], Tag>(`SELECT * FROM tags WHERE name = ?`).get(name) }
})
