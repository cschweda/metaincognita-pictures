// Role: admin or device, enforced by the auth middleware. Used in dev, and in production
// until nginx serves /v/ itself (Doc 06 §7).
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { db } from '../../db'

const VARIANT_FILE = /^[0-9A-HJKMNP-TV-Z]{26}-(640|1280|1920|2560)\.webp$/

export default defineEventHandler(async (event) => {
  const file = getRouterParam(event, 'file') ?? ''
  if (!VARIANT_FILE.test(file)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  // Hiding a photo takes it off frames, including any that already know its id. Admins still see it.
  if (event.context.device && !event.context.admin) {
    const id = file.slice(0, 26)
    if (!db.prepare(`SELECT 1 FROM photos WHERE id = ? AND hidden = 0`).get(id)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  const path = picturesPath('v', file)
  const info = await stat(path).catch(() => null)
  if (!info) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  setResponseHeaders(event, {
    'Content-Type': 'image/webp',
    'Content-Length': info.size,
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  return sendStream(event, createReadStream(path))
})
