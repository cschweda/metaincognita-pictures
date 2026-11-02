<script setup lang="ts">
// The frame. A device cookie shows the slideshow; anything else goes to pairing.
interface Config {
  preview: boolean
  interval_sec: number
  matte: string
  backdrop: string
  sleep_start: string | null
  sleep_end: string | null
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

const config = ref<Config | null>(null)
const slides = reactive<[Slide, Slide]>([
  { src: '', backdrop: '', caption: null, id: '' },
  { src: '', backdrop: '', caption: null, id: '' },
])
const active = ref(0)
const empty = ref(false)
const sleeping = ref(false)

let entries: Entry[] = []
let cursor = 0
let nextPage: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let playlistTimer: ReturnType<typeof setTimeout> | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined
let events: EventSource | undefined
let wakeLock: WakeLockSentinel | null = null

const url = (id: string, size = config.value?.variant) => `/v/${id}-${size}.webp`

// A dark matte gets light text, and a light matte gets dark text.
const captionColor = computed(() => {
  const hex = /^#([0-9a-f]{6})$/i.exec(config.value?.matte ?? '')?.[1]
  if (!hex || config.value?.backdrop === 'blur') return 'rgb(255 255 255 / 0.75)'
  const [r, g, b] = [0, 2, 4].map(start => Number.parseInt(hex.slice(start, start + 2), 16))
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? 'rgb(0 0 0 / 0.65)' : 'rgb(255 255 255 / 0.7)'
})

/** Times are the frame's local time, and a window may cross midnight. */
function inSleepWindow() {
  const { sleep_start: start, sleep_end: end } = config.value ?? {}
  if (!start || !end || start === end) return false
  const now = new Date().toTimeString().slice(0, 5)
  return start < end ? now >= start && now < end : now >= start || now < end
}

const route = useRoute()
const previewSeed = String(Math.random())

async function fetchPage(after?: string) {
  const preview = config.value?.preview ? { tag: route.query.tag, seed: previewSeed } : {}
  return $fetch<{ photos: Entry[], next: string | null }>('/api/frame/playlist', { query: { after, ...preview } })
}

async function reloadPlaylist() {
  const page = await fetchPage()
  entries = page.photos
  nextPage = page.next
  cursor = 0
  empty.value = entries.length === 0
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

async function advance() {
  try {
    sleeping.value = inSleepWindow()
    if (sleeping.value) return schedule(RETRY_MS)

    if (cursor >= entries.length) {
      await reloadPlaylist()
      if (empty.value) return schedule(RETRY_MS)
    }

    const entry = entries[cursor++]!
    if (entries.length - cursor < PAGE_LOW_WATER) await loadMore()

    const src = url(entry.id)
    const backdrop = config.value?.backdrop === 'blur' ? url(entry.id, 640) : ''
    await Promise.all([preload(src), backdrop ? preload(backdrop) : undefined])

    const hidden = 1 - active.value
    slides[hidden] = { src, backdrop, caption: entry.caption, id: entry.id }
    active.value = hidden
    schedule((config.value?.interval_sec ?? 30) * 1000)
  }
  catch {
    await start()
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
    await $fetch('/api/frame/heartbeat', { method: 'POST', body: { photo_id: slides[active.value].id || null } })
  }
  catch (error) {
    goToPairing(error)
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
    }).catch(() => undefined)
  })
  events.addEventListener('reload', () => location.reload())
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

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') exitPreview()
}

onMounted(async () => {
  await start()
  if (config.value?.preview) window.addEventListener('keydown', onKey)
  else listen()
  heartbeat = setInterval(beat, HEARTBEAT_MS)
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
  clearInterval(heartbeat)
  events?.close()
  window.removeEventListener('keydown', onKey)
  wakeLock?.release()
})
</script>

<template>
  <main class="frame" :style="{ backgroundColor: config?.matte ?? '#000000' }" @click="exitPreview">
    <template v-for="(slide, index) in slides" :key="index">
      <div class="slide" :class="{ visible: active === index && slide.src }">
        <img v-if="slide.backdrop" :src="slide.backdrop" alt="" class="backdrop">
        <img v-if="slide.src" :src="slide.src" alt="" class="photo">
        <p v-if="slide.caption" class="caption" :style="{ color: captionColor }">{{ slide.caption }}</p>
      </div>
    </template>
    <p v-if="empty" class="caption" :style="{ color: captionColor }">No photos to show</p>
    <div v-if="sleeping" class="sleep" />
    <p v-if="config?.preview" class="hint">Click or press Esc to exit</p>
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
.caption {
  position: absolute;
  inset-inline: 0;
  bottom: 0.8vh;
  padding-inline: 2vw;
  text-align: center;
  font-size: clamp(13px, 1.5vmin, 22px);
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
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
