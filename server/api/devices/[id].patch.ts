// Role: admin. Changes a frame's name, filter, order, or display settings, and tells it right away.
import { db } from '../../db'
import type { Device } from '../../types'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR = /^#[0-9a-f]{6}$/i

function bad(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<Record<string, unknown>>(event) ?? {}
  const changes: Record<string, string | number | null> = {}

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 60) bad('Name must be 1 to 60 characters')
    changes.name = name
  }
  if ('filter' in body) changes.filter = JSON.stringify(validateFilter(body.filter))
  if ('sort' in body) {
    if (!['random', 'manual', 'taken_at', 'uploaded_at'].includes(body.sort as string)) bad('Invalid sort')
    changes.sort = body.sort as string
  }
  if ('interval_sec' in body) {
    const seconds = body.interval_sec
    if (!Number.isInteger(seconds) || (seconds as number) < 5 || (seconds as number) > 86400) bad('Invalid interval')
    changes.interval_sec = seconds as number
  }
  if ('matte' in body) {
    if (typeof body.matte !== 'string' || !COLOR.test(body.matte)) bad('Matte must be a #rrggbb color')
    changes.matte = body.matte
  }
  if ('backdrop' in body) {
    if (body.backdrop !== 'solid' && body.backdrop !== 'blur') bad('Invalid backdrop')
    changes.backdrop = body.backdrop
  }
  for (const key of ['sleep_start', 'sleep_end']) {
    if (key in body) {
      const value = body[key]
      if (value !== null && (typeof value !== 'string' || !TIME.test(value))) bad('Sleep times must be HH:MM')
      changes[key] = value as string | null
    }
  }

  const columns = Object.keys(changes)
  if (columns.length === 0) bad('Nothing to change')

  // Column names come from the fixed checks above, never from the request.
  const assignments = columns.map(column => `${column} = ?`).join(', ')
  const device = db.prepare<unknown[], Device>(`UPDATE devices SET ${assignments} WHERE id = ? AND revoked = 0 RETURNING *`)
    .get(...Object.values(changes), id)
  if (!device) throw createError({ statusCode: 404, statusMessage: 'Frame not found' })

  if ('filter' in changes || 'sort' in changes) pushToFrame(id, 'playlist-changed')
  if (columns.some(column => column !== 'filter' && column !== 'sort' && column !== 'name')) pushToFrame(id, 'config-changed')
  return { device: publicDevice(device) }
})
