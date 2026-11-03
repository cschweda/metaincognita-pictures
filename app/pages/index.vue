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

interface PhotoInfo {
  caption: string | null
  taken_at: string | null
  width: number
  height: number
  tags: string[]
  camera: { make: string | null, model: string | null, lens: string | null, exposure: string | null, aperture: string | null, iso: number | null, focal_length: string | null } | null
}

const config = ref<Config | null>(null)
// Tapping or clicking the photo opens its details, and holds the slideshow on it until closed.
const INFO_TIMEOUT_MS = 2 * 60 * 1000
const infoOpen = ref(false)
const info = ref<PhotoInfo | null>(null)
let infoTimer: ReturnType<typeof setTimeout> | undefined
let heldForInfo = false
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
let lap = 0 // Each time the playlist starts again. A random order is reshuffled every lap.
const upNext = new Set<string>() // New photos waiting to be shown next.
// Bumped when the admin starts a slideshow here, so a photo still loading from before is dropped.
let epoch = 0
let streamBroken = false
class Superseded extends Error {}

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
    ? { tag: route.query.tag, playlist: route.query.playlist, order: route.query.order, seed: previewSeed, first: firstPhoto }
    : { scheduled: useSchedule ? 1 : undefined }
  return $fetch<{ photos: Entry[], next: string | null }>('/api/frame/playlist', { query: { after, lap, ...options } })
}

/**
 * Fetches the playlist again. With `keepPlace`, used when photos or settings change mid-lap, the
 * frame carries on after the photo on screen instead of going back to the first one.
 */
async function reloadPlaylist({ keepPlace = false } = {}): Promise<{ onScreenGone: boolean }> {
  const useSchedule = inSchedule(config.value?.schedule, new Date())
  const page = await fetchPage(undefined, useSchedule)
  scheduled = useSchedule
  firstPhoto = undefined
  const known = new Set(entries.map(entry => entry.id))
  entries = page.photos
  nextPage = page.next
  const onScreen = slides[active.value]?.id
  const place = keepPlace && onScreen ? entries.findIndex(entry => entry.id === onScreen) : -1
  cursor = place + 1
  // Photos that just arrived, such as a new upload, play next rather than waiting for their turn.
  // They stay queued across later refetches until they've been shown.
  if (keepPlace && known.size > 0) {
    for (const entry of entries) if (!known.has(entry.id)) upNext.add(entry.id)
  }
  for (const id of upNext) if (!entries.some(entry => entry.id === id)) upNext.delete(id)
  if (keepPlace && upNext.size && upNext.size < entries.length) {
    const queued = entries.filter(entry => upNext.has(entry.id))
    const rest = entries.filter(entry => !upNext.has(entry.id))
    const at = Math.max(0, rest.findIndex(entry => entry.id === onScreen) + 1)
    entries = [...rest.slice(0, at), ...queued, ...rest.slice(at)]
    cursor = at
  }
  // A new lap must not open on the photo that ended the last one.
  if (place === -1 && entries.length > 1 && entries[0]!.id === onScreen) {
    ;[entries[0], entries[1]] = [entries[1]!, entries[0]!]
  }
  empty.value = entries.length === 0
  if (entries.length) sendToWorker({ type: 'listed', urls: entries.map(entry => new URL(url(entry.id)!, location.origin).pathname) })
  warmNext()
  // The photo on screen was deleted, hidden, or is no longer in what this frame shows.
  return { onScreenGone: Boolean(onScreen) && place === -1 && entries.length > 0 }
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

async function display(entry: Entry, since = epoch) {
  const src = url(entry.id)
  const backdrop = config.value?.backdrop === 'blur' ? url(entry.id, 640) : ''
  await Promise.all([preload(src), backdrop ? preload(backdrop) : undefined])
  if (since !== epoch) throw new Superseded()

  const hidden = 1 - active.value
  // A new photo closes the details of the last one. Whatever changed the photo schedules the next.
  if (infoOpen.value) {
    infoOpen.value = false
    heldForInfo = false
    clearTimeout(infoTimer)
  }
  slides[hidden] = { src, backdrop, caption: entry.caption, id: entry.id }
  upNext.delete(entry.id)
  active.value = hidden
  beat() // So the admin's thumbnail always matches the photo on screen.
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
  const since = epoch
  sleeping.value = inSleepWindow()
  if (sleeping.value) return schedule(RETRY_MS)

  // The slideshow never ends: after the last photo it starts again, in a new random order or the same sequence.
  if (cursor >= entries.length) {
    lap++
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
    await display(entry, since)
  }
  catch (error) {
    if (error instanceof Superseded) return // A newer start already took over.
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

let leaving = false
function goToPairing(error: unknown) {
  if ((error as { statusCode?: number }).statusCode !== 401) return false
  leaving = true
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
    // Held for its details counts as paused: the photo isn't changing.
    await $fetch('/api/frame/heartbeat', { method: 'POST', body: { photo_id: slides[active.value]?.id || null, paused: paused || heldForInfo } })
    offline.value = false
  }
  catch (error) {
    if (!goToPairing(error)) offline.value = true
  }
}

function listen() {
  events = new EventSource('/api/frame/events')
  events.addEventListener('playlist-changed', () => {
    // At most one refetch every 1.5 seconds. A burst of changes, such as a demo loading a photo a
    // second, must not keep putting it off.
    if (playlistTimer) return
    playlistTimer = setTimeout(async () => {
      playlistTimer = undefined
      const wasEmpty = empty.value
      const result = await reloadPlaylist({ keepPlace: true }).catch(() => null)
      // Move on at once when the photo on screen has gone, or photos arrived in an empty frame.
      if ((wasEmpty && !empty.value) || (result?.onScreenGone && !paused && !heldForInfo)) schedule(0)
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
      beat() // The admin's remote shows it paused.
    }
    else if (data === 'resume') {
      paused = false
      schedule(0)
      beat()
    }
    // Started from the admin: new settings, so fetch the playlist now and begin at its first photo.
    else if (data === 'restart') {
      paused = false
      epoch++
      lap++
      clearTimeout(timer)
      reloadPlaylist().then(() => schedule(empty.value ? RETRY_MS : 0)).catch(() => schedule(RETRY_MS))
    }
  })
  // A closed stream can mean the frame was removed, and the heartbeat handles that.
  // Changes made while the stream was down, such as a slideshow started from the admin, were
  // never received, so catch up as soon as it reconnects.
  events.addEventListener('open', () => {
    if (!streamBroken) return
    streamBroken = false
    loadConfig().catch(() => undefined)
    reloadPlaylist({ keepPlace: true }).catch(() => undefined)
  })
  events.onerror = () => {
    streamBroken = true
    if (events?.readyState === EventSource.CLOSED) beat()
  }
}

async function toggleInfo() {
  if (infoOpen.value) return closeInfo()
  const id = slides[active.value]?.id
  if (!id || sleeping.value) return
  infoOpen.value = true
  info.value = null
  if (!paused) {
    clearTimeout(timer)
    heldForInfo = true
    beat()
  }
  clearTimeout(infoTimer)
  infoTimer = setTimeout(closeInfo, INFO_TIMEOUT_MS) // Nobody's reading it any more, so carry on.
  try {
    info.value = await $fetch<PhotoInfo>(`/api/frame/photo/${id}`)
  }
  catch {
    // Offline or removed: the panel shows what the frame already knows.
  }
}

function closeInfo() {
  clearTimeout(infoTimer)
  infoOpen.value = false
  if (heldForInfo) {
    heldForInfo = false
    beat()
    if (!paused) schedule((config.value?.interval_sec ?? 60) * 1000)
  }
}

const infoRows = computed(() => {
  const i = info.value
  if (!i) return []
  const c = i.camera
  const taken = i.taken_at ? new Date(i.taken_at.includes('T') ? i.taken_at : `${i.taken_at.replace(' ', 'T')}Z`) : null
  return [
    { label: 'Taken', value: taken && !Number.isNaN(taken.getTime()) ? taken.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null },
    { label: 'Camera', value: c ? [c.make, c.model].filter(Boolean).join(' ') || null : null },
    { label: 'Lens', value: c?.lens ?? null },
    { label: 'Settings', value: c ? [c.exposure, c.aperture, c.iso ? `ISO ${c.iso}` : null, c.focal_length].filter(Boolean).join(' · ') || null : null },
    { label: 'Size', value: `${i.width} × ${i.height}, ${((i.width * i.height) / 1_000_000).toFixed(1)} MP` },
    { label: 'Tags', value: i.tags.join(', ') || null },
  ].filter(row => row.value)
})

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
  if (event.key === 'Escape' && infoOpen.value) closeInfo()
  else if (event.key === 'Escape') exitPreview()
  else if (event.key === 'i' || event.key === 'Enter' || event.key === ' ') toggleInfo()
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
  // An unpaired screen goes straight to pairing, before asking for settings it would be refused.
  const who = await $fetch<{ admin: boolean, device: boolean }>('/api/auth/session').catch(() => null)
  if (who && !who.admin && !who.device) return navigateTo('/pair')
  await start()
  if (leaving) return // Revoked or never paired: off to the pairing screen.
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
  clearTimeout(infoTimer)
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
  <main class="frame" :class="{ preview: config?.preview }" :style="{ backgroundColor: config?.matte ?? '#000000' }" @click="toggleInfo">
    <template v-for="(slide, index) in slides" :key="index">
      <div class="slide" :class="{ visible: active === index && slide.src }">
        <img v-if="slide.backdrop" :src="slide.backdrop" alt="" class="backdrop">
        <img v-if="slide.src" :src="slide.src" alt="" class="photo">
        <p v-if="slide.caption && config?.show_captions !== false && !infoOpen" class="caption">{{ slide.caption }}</p>
      </div>
    </template>
    <p v-if="empty" class="caption">No photos to show</p>
    <span v-if="offline && !sleeping" class="offline" role="status" aria-label="Offline" />
    <div v-if="sleeping" class="sleep" />
    <section v-if="infoOpen" class="info" role="dialog" aria-label="About this photo">
      <p v-if="slides[active]?.caption" class="info-caption">{{ slides[active]?.caption }}</p>
      <dl v-if="infoRows.length" class="info-rows">
        <template v-for="row in infoRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
      <p v-else-if="!info" class="info-hint">Loading details…</p>
      <p class="info-hint">Tap again to close. The slideshow carries on after two minutes.</p>
      <button v-if="config?.preview" type="button" class="info-exit" @click.stop="exitPreview">Exit slideshow</button>
    </section>
    <p v-if="config?.preview && !infoOpen" class="hint">Tap a photo for its details. Arrows change photos. Esc returns to the admin.</p>
  </main>
</template>

<style scoped>
.frame {
  /* A Helvetica-like sans-serif, from fonts the system already has, so a frame downloads none. */
  --frame-font: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", "Nimbus Sans", "Nimbus Sans L", sans-serif;
  position: fixed;
  inset: 0;
  overflow: hidden;
  cursor: none;
}
.frame.preview {
  cursor: pointer;
}
/* Details for the photo on screen, readable from a few steps away. */
.info {
  position: absolute;
  left: 3vmin;
  bottom: 3vmin;
  max-width: min(70vw, 60rem);
  padding: 2.4vmin 3vmin;
  border-radius: 1.2vmin;
  background: rgb(0 0 0 / 0.72);
  backdrop-filter: blur(12px);
  color: #fff;
  font-family: var(--frame-font);
  font-size: clamp(15px, 2.1vmin, 44px);
  line-height: 1.35;
  cursor: default;
}
.info-caption {
  font-size: 1.35em;
  font-weight: 600;
  margin-bottom: 0.6em;
}
.info-rows {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3em 1.2em;
}
.info-rows dt {
  color: rgb(255 255 255 / 0.65);
}
.info-hint {
  margin-top: 0.8em;
  font-size: 0.75em;
  color: rgb(255 255 255 / 0.6);
}
.info-exit {
  margin-top: 1em;
  padding: 0.5em 1em;
  border-radius: 0.4em;
  background: #f2b134;
  color: #10181c;
  font-weight: 700;
  cursor: pointer;
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
  padding: 1.2vmin 3vw;
  background: rgb(0 0 0 / 0.6);
  color: #fff;
  text-align: center;
  /* Read from across a room: about 2.6% of the screen's short side, roughly 28px on 1080p and 56px on 4K. */
  font-family: var(--frame-font);
  font-size: clamp(16px, 2.6vmin, 60px);
  font-weight: 500;
  line-height: 1.25;
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
