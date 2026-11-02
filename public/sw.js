// Frame library cache (Doc 00 §8). Each frame downloads each photo once.
const IMAGES = 'images-v1'
const SHELL = 'shell-v1'
const DATA = 'data-v1'
const META_URL = '/__sw/meta'

const BUDGET = 0.8 // Start evicting at this share of the storage quota.
const EVICT_SHARE = 0.05 // Evict this share of entries each time.
const UNLISTED_MS = 30 * 24 * 60 * 60 * 1000 // Drop photos gone from playlists for this long.
const CLEANUP_MS = 24 * 60 * 60 * 1000

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

async function readMeta() {
  const response = await (await caches.open(DATA)).match(META_URL)
  return response ? response.json() : { photos: {}, cleaned: 0 }
}

async function writeMeta(meta) {
  await (await caches.open(DATA)).put(META_URL, new Response(JSON.stringify(meta)))
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone()) // A 401 is never cached.
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  }
  catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return

  if (url.pathname.startsWith('/v/')) {
    event.respondWith(cacheFirst(request, IMAGES))
  }
  else if (url.pathname.startsWith('/_nuxt/') && !url.pathname.startsWith('/_nuxt/builds/')) {
    event.respondWith(cacheFirst(request, SHELL))
  }
  else if (url.pathname === '/' && request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL))
  }
  else if (url.pathname === '/api/frame/config' || url.pathname === '/api/frame/playlist') {
    event.respondWith(networkFirst(request, DATA))
  }
})

async function prefetch(urls) {
  const cache = await caches.open(IMAGES)
  for (const url of urls) {
    if (await cache.match(url)) continue
    try {
      const response = await fetch(url)
      if (response.ok) await cache.put(url, response)
    }
    catch {
      return // Offline. The next message tries again.
    }
  }
  await trim()
}

/** Least recently shown photos go first when storage runs short. */
async function trim() {
  const { usage = 0, quota = Infinity } = await navigator.storage.estimate()
  if (usage < quota * BUDGET) return

  const cache = await caches.open(IMAGES)
  const meta = await readMeta()
  const keys = await cache.keys()
  const shownAt = key => meta.photos[new URL(key.url).pathname]?.shown ?? 0
  const oldest = keys.sort((a, b) => shownAt(a) - shownAt(b)).slice(0, Math.ceil(keys.length * EVICT_SHARE))
  await Promise.all(oldest.map(key => cache.delete(key)))
}

async function noteShown(url) {
  const meta = await readMeta()
  meta.photos[url] = { ...meta.photos[url], shown: Date.now() }
  await writeMeta(meta)
}

async function noteListed(urls) {
  const meta = await readMeta()
  const now = Date.now()
  for (const url of urls) meta.photos[url] = { ...meta.photos[url], listed: now }

  if (now - meta.cleaned > CLEANUP_MS) {
    meta.cleaned = now
    const cache = await caches.open(IMAGES)
    for (const key of await cache.keys()) {
      const path = new URL(key.url).pathname
      const listed = meta.photos[path]?.listed
      if (listed && now - listed > UNLISTED_MS) {
        await cache.delete(key)
        delete meta.photos[path]
      }
    }
  }
  await writeMeta(meta)
}

self.addEventListener('message', (event) => {
  const { type, url, urls } = event.data ?? {}
  if (type === 'prefetch') event.waitUntil(prefetch(urls))
  else if (type === 'shown') event.waitUntil(noteShown(url))
  else if (type === 'listed') event.waitUntil(noteListed(urls))
})
