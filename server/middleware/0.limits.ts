// Runs before every other middleware (file names sort first). Two guards from the 2026-11 audit:
// request bodies are capped, so nobody can run the server out of memory by sending a huge one
// before any login check, and paths with dot segments are refused before route scoping sees them.

/** JSON and form bodies are small. Only the photo upload streams large bodies, with its own limits. */
const MAX_BODY_BYTES = 64 * 1024
// A playlist's order is sent whole: 5,000 photo ids is about 145 KB.
const MAX_PLAYLIST_BODY_BYTES = 256 * 1024
const UPLOAD_ROUTE = 'POST /api/photos'
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$)|%2e|%2f|%5c|\\/i

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0] ?? ''
  if (DOT_SEGMENT.test(path)) throw createError({ statusCode: 400, statusMessage: 'Bad path' })

  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
  const route = path.replace(/\/{2,}/g, '/')
  if (`${method} ${route}` === UPLOAD_ROUTE) return
  const limit = route.startsWith('/api/playlists') ? MAX_PLAYLIST_BODY_BYTES : MAX_BODY_BYTES

  // Browsers always send Content-Length for these requests. A chunked body has no declared size,
  // and reading it would mean buffering an unknown amount, so it's refused.
  const length = getHeader(event, 'content-length')
  if (length === undefined) {
    if (getHeader(event, 'transfer-encoding')) throw createError({ statusCode: 411, statusMessage: 'Length required' })
    return
  }
  if (!/^\d+$/.test(length) || Number(length) > limit) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }
})
