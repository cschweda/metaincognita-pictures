// Role: public, so nginx auth_request gets a plain 204 or 401. Allows an admin or a device.
import { db } from '../../db'
// nginx passes the original image path in X-Original-URI. A device gets a hidden photo refused,
// the same as from /v/ itself.
const VARIANT_PATH = /\/v\/([0-9A-HJKMNP-TV-Z]{26})-(640|1280|1920|2560)\.webp$/

export default defineEventHandler((event) => {
  if (!event.context.admin && !event.context.device) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!event.context.admin) {
    const id = VARIANT_PATH.exec(getHeader(event, 'x-original-uri') ?? '')?.[1]
    if (!id || !db.prepare(`SELECT 1 FROM photos WHERE id = ? AND hidden = 0`).get(id)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }
  setResponseStatus(event, 204)
  return null
})
