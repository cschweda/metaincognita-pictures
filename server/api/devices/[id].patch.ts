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
  for (const key of ['match_shape', 'memories_first', 'show_captions']) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') bad(`${key} must be true or false`)
      changes[key] = body[key] ? 1 : 0
    }
  }
  for (const key of ['sleep_start', 'sleep_end', 'schedule_start', 'schedule_end']) {
    if (key in body) {
      const value = body[key]
      if (value !== null && (typeof value !== 'string' || !TIME.test(value))) bad('Times must be HH:MM')
      changes[key] = value as string | null
    }
  }
  if ('schedule_preset_id' in body) {
    const preset = body.schedule_preset_id
    if (preset !== null && (typeof preset !== 'string' || !db.prepare(`SELECT 1 FROM presets WHERE id = ?`).get(preset))) bad('Preset not found')
    changes.schedule_preset_id = preset as string | null
  }
  if ('playlist_id' in body) {
    const playlist = body.playlist_id
    if (playlist !== null && (typeof playlist !== 'string' || !db.prepare(`SELECT 1 FROM playlists WHERE id = ?`).get(playlist))) bad('Playlist not found')
    changes.playlist_id = playlist as string | null
  }
  if ('schedule_days' in body) {
    const days = body.schedule_days
    if (!Array.isArray(days) || !days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) bad('Days must be 0 to 6')
    changes.schedule_days = JSON.stringify([...new Set(days as number[])].sort())
  }

  const columns = Object.keys(changes)
  if (columns.length === 0) bad('Nothing to change')

  // Column names come from the fixed checks above, never from the request.
  const assignments = columns.map(column => `${column} = ?`).join(', ')
  const device = db.prepare<unknown[], Device>(`UPDATE devices SET ${assignments} WHERE id = ? AND revoked = 0 RETURNING *`)
    .get(...Object.values(changes), id)
  if (!device) throw createError({ statusCode: 404, statusMessage: 'Frame not found' })

  const PLAYLIST_COLUMNS = ['filter', 'sort', 'match_shape', 'memories_first', 'playlist_id']
  if (columns.some(column => PLAYLIST_COLUMNS.includes(column))) pushToFrame(id, 'playlist-changed')
  if (columns.some(column => !PLAYLIST_COLUMNS.includes(column) && column !== 'name')) pushToFrame(id, 'config-changed')
  return { device: publicDevice(device) }
})
