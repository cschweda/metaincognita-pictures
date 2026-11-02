// Role: device. Visible photos for this frame, in order and paged.
// Tag filters arrive in Phase 3; for now every frame shows the whole library.
import { createHash } from 'node:crypto'
import { db } from '../../db'
import type { Device, Photo } from '../../types'

type Entry = Pick<Photo, 'id' | 'caption'>

const ORDER: Record<string, string> = {
  manual: 'position DESC',
  taken_at: 'COALESCE(taken_at, uploaded_at) DESC, id DESC',
  uploaded_at: 'id DESC',
  random: 'id',
}

// Seeded by the device, so paging stays stable and frames don't all show the same order.
function shuffled(entries: Entry[], device: Device): Entry[] {
  let state = createHash('sha256').update(device.id).digest().readUInt32LE(0)
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
  const device = event.context.device!
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 200)
  const sort = device.sort in ORDER ? device.sort : 'random'

  const rows = db.prepare<[], Entry>(`SELECT id, caption FROM photos WHERE hidden = 0 ORDER BY ${ORDER[sort]}`).all()
  const entries = sort === 'random' ? shuffled(rows, device) : rows

  const after = typeof query.after === 'string' ? entries.findIndex(entry => entry.id === query.after) : -1
  const photos = entries.slice(after + 1, after + 1 + limit)
  return { photos, next: after + 1 + limit < entries.length ? photos.at(-1)?.id ?? null : null }
})
