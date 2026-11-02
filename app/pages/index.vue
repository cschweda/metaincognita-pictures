<script setup lang="ts">
// The frame. A device cookie shows the slideshow; anything else goes to pairing.
interface Config {
  interval_sec: number
  matte: string
  variant: number
}
interface Entry {
  id: string
  caption: string | null
}
interface Slide {
  src: string
  caption: string | null
}

const PAGE_LOW_WATER = 20
const RETRY_MS = 30_000

const config = ref<Config | null>(null)
const slides = reactive<[Slide, Slide]>([{ src: '', caption: null }, { src: '', caption: null }])
const active = ref(0)
const empty = ref(false)

let entries: Entry[] = []
let cursor = 0
let nextPage: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let wakeLock: WakeLockSentinel | null = null

const url = (id: string) => `/v/${id}-${config.value?.variant}.webp`

// A dark matte gets light text, and a light matte gets dark text.
const captionColor = computed(() => {
  const hex = /^#([0-9a-f]{6})$/i.exec(config.value?.matte ?? '')?.[1]
  if (!hex) return 'rgb(255 255 255 / 0.7)'
  const [r, g, b] = [0, 2, 4].map(start => Number.parseInt(hex.slice(start, start + 2), 16))
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? 'rgb(0 0 0 / 0.65)' : 'rgb(255 255 255 / 0.7)'
})

async function fetchPage(after?: string) {
  return $fetch<{ photos: Entry[], next: string | null }>('/api/frame/playlist', { query: { after } })
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

// Each pass re-reads the playlist, so changes appear without a reload until SSE arrives in Phase 3.
async function advance() {
  try {
    if (cursor >= entries.length) {
      const page = await fetchPage()
      entries = page.photos
      nextPage = page.next
      cursor = 0
      empty.value = entries.length === 0
      if (empty.value) return schedule(RETRY_MS)
    }

    const entry = entries[cursor++]!
    if (entries.length - cursor < PAGE_LOW_WATER) await loadMore()

    const src = url(entry.id)
    await preload(src)
    const hidden = 1 - active.value
    slides[hidden] = { src, caption: entry.caption }
    active.value = hidden
    schedule((config.value?.interval_sec ?? 30) * 1000)
  }
  catch {
    await start()
  }
}

async function start() {
  try {
    config.value = await $fetch<Config>('/api/frame/config')
    schedule(0)
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode === 401) await navigateTo('/pair')
    else schedule(RETRY_MS)
  }
}

onMounted(async () => {
  start()
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  }
  catch {
    // Refused wake locks are harmless.
  }
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  wakeLock?.release()
})
</script>

<template>
  <main class="frame" :style="{ backgroundColor: config?.matte ?? '#000000' }">
    <template v-for="(slide, index) in slides" :key="index">
      <div class="slide" :class="{ visible: active === index && slide.src }">
        <img v-if="slide.src" :src="slide.src" alt="">
        <p v-if="slide.caption" class="caption" :style="{ color: captionColor }">{{ slide.caption }}</p>
      </div>
    </template>
    <p v-if="empty" class="caption" :style="{ color: captionColor }">No photos yet</p>
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
.slide img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
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
@media (prefers-reduced-motion: reduce) {
  .slide {
    transition: none;
  }
}
</style>
