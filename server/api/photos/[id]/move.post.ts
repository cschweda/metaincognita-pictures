// Role: admin. Places a photo directly after another one, or first when `after` is null.
import { db } from '../../../db'
import type { Photo } from '../../../types'

const MIN_GAP = 1e-6

function positionOf(id: string): number | undefined {
  return db.prepare<[string], Pick<Photo, 'position'>>(`SELECT position FROM photos WHERE id = ?`).get(id)?.position
}

// Positions are fractions, so a move updates one row. Repeated moves into one gap eventually
// run out of precision, and renumbering restores the space.
function renumber() {
  db.exec(`UPDATE photos SET position = (
    SELECT n FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, id ASC) AS n FROM photos) AS ranked
    WHERE ranked.id = photos.id
  )`)
}

function targetPosition(id: string, after: string | null): number {
  if (after === null) {
    const top = db.prepare<[string], { top: number | null }>(`SELECT MAX(position) AS top FROM photos WHERE id != ?`).get(id)
    return (top?.top ?? 0) + 1
  }

  const above = positionOf(after)
  if (above === undefined) throw createError({ statusCode: 400, statusMessage: 'Unknown photo in after' })

  const below = db.prepare<[number, string], { below: number | null }>(
    `SELECT MAX(position) AS below FROM photos WHERE position < ? AND id != ?`,
  ).get(above, id)?.below ?? null

  if (below === null) return above - 1
  if (above - below < MIN_GAP) {
    renumber()
    return targetPosition(id, after)
  }
  return (above + below) / 2
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ after?: unknown }>(event)
  const after = typeof body?.after === 'string' ? body.after : null

  if (after === id) throw createError({ statusCode: 400, statusMessage: 'A photo cannot follow itself' })
  if (positionOf(id) === undefined) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })

  const photo = db.transaction(() => {
    const position = targetPosition(id, after)
    return db.prepare<[number, string], Photo>(`UPDATE photos SET position = ? WHERE id = ? RETURNING *`).get(position, id)
  })()
  pushToAllFrames('playlist-changed')
  return { photo }
})
