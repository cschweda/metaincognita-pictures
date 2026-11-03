<script setup lang="ts">
// The frame. A device cookie shows the slideshow; anything else goes to pairing.
interface Config {
  preview: boolean
  interval_sec: number
  matte: string
  backdrop: string
  sleep_start: string | null
  sleep_end: string | null
  show_captions: boolean
  schedule: FrameSchedule | null
  variant: number
}
interface Entry {
  id: string
  caption: string | null
}
interface Slide {
  src: string
  backdrop: string
  caption: string | null
  id: string
}

const PAGE_LOW_WATER = 20
const RETRY_MS = 30_000
const HEARTBEAT_MS = 60_000
const PLAYLIST_DEBOUNCE_MS = 1500
const SKIP_MS = 250
const PREFETCH_COUNT = 20
const RELOAD_MS = 6 * 60 * 60 * 1000 // Chromium memory hygiene.

const config = ref<Config | null>(null)
const slides = reactive<[Slide, Slide]>([
  { src: '', backdrop: '', caption: null, id: '' },
  { src: '', backdrop: '', caption: null, id: '' },
])
const active = ref(0)
const empty = ref(false)
const sleeping = ref(false)
const offline = ref(false)

let entries: Entry[] = []
let cursor = 0
let nextPage: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let playlistTimer: ReturnType<typeof setTimeout> | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined
let events: EventSource | undefined
let wakeLock: WakeLockSentinel | null = null
let serviceWorker: ServiceWorker | null = null
let reloadTimer: ReturnType<typeof setTimeout> | undefined
let failures = 0
let paused = false
let scheduled = false

const url = (id: string, size = config.value?.variant) => `/v/${id}-${size}.webp`

/** Times are the frame's local time, and a window may cross midnight. */
function inSleepWindow() {
  const { sleep_start: start, sleep_end: end } = config.value ?? {}
  if (!start || !end || start === end) return false
  const now = new Date().toTimeString().slice(0, 5)
  return start < end ? now >= start && now < end : now >= start || now < end
}

const route = useRoute()
const previewSeed = String(Math.random())
let firstPhoto = route.query.photo // Only the first load opens on the clicked photo.

async function fetchPage(after?: string, useSchedule = scheduled) {
  const options = config.value?.preview
    ? { tag: route.query.tag, seed: previewSeed, first: firstPhoto }
    : { scheduled: useSchedule ? 1 : undefined }
  return $fetch<{ photos: Entry[], next: string | null }>('/api/frame/playlist', { query: { after, ...options } })
}

async function reloadPlaylist() {
  const useSchedule = inSchedule(config.value?.schedule, new Date())
  const page = await fetchPage(undefined, useSchedule)
  scheduled = useSchedule
  firstPhoto = undefined
  entries = page.photos
  nextPage = page.next
  cursor = 0
  empty.value = entries.length === 0
  if (entries.length) sendToWorker({ type: 'listed', urls: entries.map(entry => new URL(url(entry.id)!, location.origin).pathname) })
  warmNext()
}

async function loadMore() {
  if (!nextPage) return
  const page = await fetchPage(nextPage)
  entries.push(...page.photos)
  nextPage = page.next
}

function preload(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = reject
    image.src = src
  })
}

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(advance, ms)
}

async function display(entry: Entry) {
  const src = url(entry.id)
  const backdrop = config.value?.backdrop === 'blur' ? url(entry.id, 640) : ''
  await Promise.all([preload(src), backdrop ? preload(backdrop) : undefined])

  const hidden = 1 - active.value
  slides[hidden] = { src, backdrop, caption: entry.caption, id: entry.id }
  const firstSlide = !slides[1 - hidden]?.id
  active.value = hidden
  if (firstSlide) beat() // So the admin's thumbnail fills in right away.
  sendToWorker({ type: 'shown', url: src })
}

function sendToWorker(message: object) {
  serviceWorker?.postMessage(message)
}

/** Keeps the next photos ready, so the first pass never shows a loading gap. */
function warmNext() {
  const upcoming = entries.slice(cursor, cursor + PREFETCH_COUNT).map(entry => url(entry.id))
  if (upcoming.length) sendToWorker({ type: 'prefetch', urls: upcoming })
}

async function advance() {
  sleeping.value = inSleepWindow()
  if (sleeping.value) return schedule(RETRY_MS)

  if (cursor >= entries.length) {
    try {
      await reloadPlaylist()
      if (empty.value) return schedule(RETRY_MS)
    }
    catch (error) {
      if (goToPairing(error)) return
      offline.value = true
      cursor = 0 // Keep cycling what is already here.
      if (entries.length === 0) return schedule(RETRY_MS)
    }
  }

  const entry = entries[cursor++]!
  if (entries.length - cursor < PAGE_LOW_WATER) await loadMore().catch(() => undefined)

  try {
    await display(entry)
  }
  catch {
    // Not cached and no network, or deleted. Move on quickly, and pause if nothing loads.
    failures++
    return schedule(failures < entries.length ? SKIP_MS : RETRY_MS)
  }

  failures = 0
  warmNext()
  if (!paused) schedule((config.value?.interval_sec ?? 30) * 1000)
}

/** The next slide can be 30 minutes away, so the frame checks for a change on its own. */
async function followSchedule() {
  if (inSchedule(config.value?.schedule, new Date()) === scheduled) return
  try {
    await reloadPlaylist()
    if (!paused && !empty.value) schedule(0) // Shown right away, or a long interval would hide the change.
  }
  catch {
    // Offline. The next heartbeat tries again.
  }
}

async function loadConfig() {
  config.value = await $fetch<Config>('/api/frame/config')
}

function goToPairing(error: unknown) {
  if ((error as { statusCode?: number }).statusCode !== 401) return false
  navigateTo('/pair')
  return true
}

async function start() {
  try {
    await loadConfig()
    schedule(0)
  }
  catch (error) {
    if (!goToPairing(error)) schedule(RETRY_MS)
  }
}

async function beat() {
  if (config.value?.preview) return
  try {
    await $fetch('/api/frame/heartbeat', { method: 'POST', body: { photo_id: slides[active.value]?.id || null } })
    offline.value = false
  }
  catch (error) {
    if (!goToPairing(error)) offline.value = true
  }
}

function listen() {
  events = new EventSource('/api/frame/events')
  events.addEventListener('playlist-changed', () => {
    clearTimeout(playlistTimer)
    playlistTimer = setTimeout(async () => {
      const wasEmpty = empty.value
      await reloadPlaylist().catch(() => undefined)
      if (wasEmpty && !empty.value) schedule(0)
    }, PLAYLIST_DEBOUNCE_MS)
  })
  events.addEventListener('config-changed', () => {
    loadConfig().then(() => {
      if (sleeping.value && !inSleepWindow()) schedule(0)
      else if (inSleepWindow()) sleeping.value = true
      return followSchedule()
    }).catch(() => undefined)
  })
  events.addEventListener('reload', () => location.reload())
  events.addEventListener('show', ({ data }) => {
    clearTimeout(timer)
    display(JSON.parse(data) as Entry).catch(() => undefined).finally(() => {
      beat()
      if (!paused) schedule((config.value?.interval_sec ?? 30) * 1000)
    })
  })
  events.addEventListener('control', ({ data }) => {
    if (data === 'next') step(1)
    else if (data === 'previous') step(-1)
    else if (data === 'pause') {
      paused = true
      clearTimeout(timer)
    }
    else if (data === 'resume') {
      paused = false
      schedule(0)
    }
  })
  // A closed stream can mean the frame was removed, and the heartbeat handles that.
  events.onerror = () => {
    if (events?.readyState === EventSource.CLOSED) beat()
  }
}

function exitPreview() {
  if (!config.value?.preview) return
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
  navigateTo('/admin')
}

/** Moves one photo forward or back, right away. */
function step(direction: 1 | -1) {
  if (entries.length === 0 || sleeping.value) return
  // The cursor already points past the photo on screen, so going back skips over it.
  if (direction === -1) cursor = (cursor - 2 + entries.length) % entries.length
  schedule(0)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') exitPreview()
  else if (event.key === 'ArrowRight') step(1)
  else if (event.key === 'ArrowLeft') step(-1)
}

// In full screen the browser keeps Esc for itself, so leaving full screen is the signal.
function onFullscreenChange() {
  if (!document.fullscreenElement) exitPreview()
}

async function startCache() {
  if (!('serviceWorker' in navigator)) return
  await navigator.serviceWorker.register('/sw.js')
  serviceWorker = (await navigator.serviceWorker.ready).active
  await navigator.storage?.persist?.()
  warmNext()
}

onMounted(async () => {
  await start()
  window.addEventListener('keydown', onKey)
  if (config.value?.preview) {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return
  }
  listen()
  startCache().catch(() => undefined)
  beat()
  heartbeat = setInterval(() => {
    beat()
    followSchedule()
  }, HEARTBEAT_MS)
  reloadTimer = setTimeout(() => location.reload(), RELOAD_MS)
  window.addEventListener('offline', beat)
  window.addEventListener('online', beat)
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  }
  catch {
    // Refused wake locks are harmless.
  }
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(playlistTimer)
  clearTimeout(reloadTimer)
  clearInterval(heartbeat)
  window.removeEventListener('offline', beat)
  window.removeEventListener('online', beat)
  events?.close()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  wakeLock?.release()
})
</script>

<template>
  <main class="frame" :style="{ backgroundColor: config?.matte ?? '#000000' }" @click="exitPreview">
    <template v-for="(slide, index) in slides" :key="index">
      <div class="slide" :class="{ visible: active === index && slide.src }">
        <img v-if="slide.backdrop" :src="slide.backdrop" alt="" class="backdrop">
        <img v-if="slide.src" :src="slide.src" alt="" class="photo">
        <p v-if="slide.caption && config?.show_captions !== false" class="caption">{{ slide.caption }}</p>
      </div>
    </template>
    <p v-if="empty" class="caption">No photos to show</p>
    <span v-if="offline && !sleeping" class="offline" role="status" aria-label="Offline" />
    <div v-if="sleeping" class="sleep" />
    <p v-if="config?.preview" class="hint">Left and right arrows change photos. Esc returns to the admin.</p>
  </main>
</template>

<style scoped>
.frame {
  position: fixed;
  inset: 0;
  overflow: hidden;
  cursor: none;
}
.slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 1s ease;
}
.slide.visible {
  opacity: 1;
}
.photo,
.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.photo {
  object-fit: contain;
  object-position: center;
}
.backdrop {
  object-fit: cover;
  filter: blur(40px) brightness(0.7);
  transform: scale(1.15);
}
/* An edge-to-edge band keeps white text readable on any photo or matte. */
.caption {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  padding: 0.6vmin 2vw;
  background: rgb(0 0 0 / 0.6);
  color: #fff;
  text-align: center;
  font-size: clamp(14px, 1.8vmin, 24px);
}
.offline {
  position: absolute;
  right: 1vmin;
  bottom: 1vmin;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.3);
}
.hint {
  position: absolute;
  top: 2vh;
  inset-inline: 0;
  text-align: center;
  color: #fff;
  font-size: 16px;
  text-shadow: 0 1px 3px #000;
  animation: hint 4s forwards;
  pointer-events: none;
}
@keyframes hint {
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
.sleep {
  position: absolute;
  inset: 0;
  background: #000;
}
@media (prefers-reduced-motion: reduce) {
  .slide {
    transition: none;
  }
}
</style>
