// Role: device, or admin for a slideshow in their own browser. Visible photos, in order and paged.
import { createHash } from 'node:crypto'
import { db } from '../../db'
import type { Photo } from '../../types'

type Entry = Pick<Photo, 'id' | 'caption'>

const ORDER: Record<string, string> = {
  manual: 'position DESC',
  taken_at: 'COALESCE(taken_at, uploaded_at) DESC, id DESC',
  uploaded_at: 'id DESC',
  random: 'id',
}

// Seeded by the device, so paging stays stable and frames don't all show the same order.
// An admin's slideshow sends a new seed for each start.
function shuffled(entries: Entry[], seed: string): Entry[] {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0)
  const next = () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const result = [...entries]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

export default defineEventHandler((event) => {
  const device = event.context.device
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 200)
  // In an admin's browser, a chosen tag plays in the arranged order, and no tag plays everything at random.
  const tag = !device && typeof query.tag === 'string' && query.tag ? query.tag : null
  const sort = !device ? (tag ? 'manual' : 'random') : device.sort in ORDER ? device.sort : 'random'

  const clause = filterClause(device ? parseFilter(device.filter) : { tags: tag ? [tag] : [], mode: 'any' })

  const rows = db.prepare<string[], Entry>(
    `SELECT id, caption FROM photos WHERE hidden = 0 AND ${clause.sql} ORDER BY ${ORDER[sort]}`,
  ).all(...clause.params)
  const entries: Entry[] = sort === 'random' ? shuffled(rows, device?.id ?? String(query.seed ?? 'admin')) : rows

  // Clicking a photo in the admin opens the slideshow on that photo, even if it's turned off.
  if (!device && typeof query.first === 'string') {
    const first = db.prepare<[string], Entry>(`SELECT id, caption FROM photos WHERE id = ?`).get(query.first)
    if (first) entries.splice(0, entries.length, first, ...entries.filter(entry => entry.id !== first.id))
  }

  const after = typeof query.after === 'string' ? entries.findIndex(entry => entry.id === query.after) : -1
  const photos = entries.slice(after + 1, after + 1 + limit)
  return { photos, next: after + 1 + limit < entries.length ? photos.at(-1)?.id ?? null : null }
})
