// The only place route scope is checked (Doc 06 §6). Any /api route not listed here
// requires an admin session, so a new route is denied by default.
import type { H3Event } from 'h3'
import { db, migrated } from '../db'
import type { Device } from '../types'

const PUBLIC_ROUTES = new Set([
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/session',
  'GET /api/auth/image',
  'GET /api/health',
  'POST /api/pair/start',
  'GET /api/pair/poll',
])
const PUBLIC_ICON_PREFIX = 'GET /api/_nuxt_icon/'
const DEVICE_PREFIXES = ['/api/frame/']
// A logged-in admin can run the slideshow in their own browser, with no pairing.
const ADMIN_SLIDESHOW_ROUTES = new Set(['GET /api/frame/config', 'GET /api/frame/playlist'])
// Tapping a photo in that slideshow shows its details, the same as on a frame.
const ADMIN_SLIDESHOW_PREFIX = 'GET /api/frame/photo/'

// Public routes that use a browser session, so they need the CSRF header too.
const CSRF_PUBLIC_ROUTES = new Set(['POST /api/auth/login', 'POST /api/auth/logout'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function readDevice(event: H3Event): Device | undefined {
  const token = getCookie(event, 'device_token')
  if (!token) return undefined

  const hash = sha256(token)
  return db.prepare<[string, string], Device>(
    `SELECT * FROM devices
     WHERE revoked = 0
       AND (token_hash = ?
         OR (prev_token_hash = ? AND prev_token_expires_at > datetime('now')))`,
  ).get(hash, hash)
}

function requireCsrfHeader(event: H3Event) {
  if (getHeader(event, 'x-requested-with') !== 'fetch') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

export default defineEventHandler(async (event) => {
  await migrated

  event.context.admin = readSession(event)
  event.context.device = readDevice(event)

  // Leading slashes collapse so that //api/... can't skip the checks below.
  const path = (event.path.split('?')[0] ?? '').replace(/^\/+/, '/')

  // Images need a session or a device, so a copied URL alone shows nothing.
  if (/^\/v(\/|$)/i.test(path)) {
    if (!event.context.admin && !event.context.device) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    return
  }

  if (!/^\/api(\/|$)/i.test(path)) return

  const route = `${event.method} ${path}`

  if (PUBLIC_ROUTES.has(route) || route.startsWith(PUBLIC_ICON_PREFIX)) {
    if (CSRF_PUBLIC_ROUTES.has(route)) requireCsrfHeader(event)
    return
  }

  if (DEVICE_PREFIXES.some(prefix => path.startsWith(prefix))) {
    const allowed = event.context.device
      || (event.context.admin && (ADMIN_SLIDESHOW_ROUTES.has(route) || route.startsWith(ADMIN_SLIDESHOW_PREFIX)))
    if (!allowed) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    return
  }

  if (event.context.admin) {
    if (!SAFE_METHODS.has(event.method)) requireCsrfHeader(event)
    return
  }
  if (event.context.device) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
})
