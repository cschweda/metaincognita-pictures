<script setup lang="ts">
// The main action: a gold wall with the library's real photos in a dark matte. It starts a
// slideshow on all frames, one frame, or full screen in this browser.
const props = defineProps<{ photos: string[], count: number | null, tagName?: string, frames: Frame[] }>()
const emit = defineEmits<{ started: [] }>()
const tagFilter = useTagFilter()
const order = useSlideshowOrder()
const target = useSlideshowTarget()
const starting = ref(false)
const result = ref('')
const failed = ref(false)
const shown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => {
    if (props.photos.length > 1) shown.value = (shown.value + 1) % props.photos.length
  }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))

const detail = computed(() => {
  if (props.count === null) return 'Fills this screen'
  const memories = props.tagName === 'On this day'
  if (props.count === 0 && memories) return 'No photos from this date yet'
  if (props.count === 0) return props.tagName ? `No photos are tagged ${props.tagName}` : 'Add photos first'
  const photos = `${props.count} ${props.count === 1 ? 'photo' : 'photos'}`
  const playlist = tagFilter.value.startsWith('playlist:')
  const how = order.value === 'random' ? 'in random order' : playlist ? 'in playlist order' : 'in your order'
  const where = target.value === 'screen'
    ? ''
    : target.value === 'all' ? ', on all frames' : `, on ${props.frames[0]?.name ?? 'a frame'}`
  if (memories) return `${photos} from this date, ${how}${where}`
  if (playlist) return `${photos} from ${props.tagName}, ${how}${where}`
  return props.tagName ? `${photos} tagged ${props.tagName}, ${how}${where}` : `All ${photos} ${how}${where}`
})

const names = (list: string[]) => list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')}, and ${list.at(-1)}`

async function startOnFrames() {
  starting.value = true
  result.value = ''
  failed.value = false
  try {
    const { started, offline } = await $fetch<{ started: string[], offline: string[] }>('/api/slideshow/start', {
      method: 'POST',
      headers: apiHeaders,
      body: { frame: target.value, show: tagFilter.value, order: order.value },
    })
    result.value = [
      started.length ? `Started on ${names(started)}.` : '',
      offline.length ? `${names(offline)} ${offline.length === 1 ? 'is' : 'are'} offline, and will switch on reconnecting.` : '',
    ].filter(Boolean).join(' ')
    emit('started')
  }
  catch (error) {
    failed.value = true
    result.value = (error as { statusMessage?: string }).statusMessage ?? 'Couldn\'t start the slideshow.'
  }
  finally {
    starting.value = false
  }
}

async function start() {
  if (target.value !== 'screen') return startOnFrames()
  await document.documentElement.requestFullscreen?.().catch(() => undefined)
  await navigateTo({ path: '/', query: { tag: tagFilter.value || undefined, order: order.value } })
}
</script>

<template>
  <button type="button" class="start" :disabled="count === 0 || starting" @click="start">
    <span class="words">
      <span class="title">{{ starting ? 'Starting…' : 'Start slideshow' }}</span>
      <span class="detail">{{ detail }}</span>
    </span>
    <span class="print" aria-hidden="true">
      <img
        v-for="(id, index) in photos"
        :key="id"
        :src="`/v/${id}-1280.webp`"
        alt=""
        :class="{ on: index === shown }"
      >
    </span>
  </button>
  <p class="text-lg" :class="failed ? 'text-error' : 'text-default'" :role="failed ? 'alert' : 'status'">{{ result }}</p>
</template>

<style scoped>
.start {
  display: grid;
  grid-template-columns: 1fr minmax(0, 20%);
  align-items: center;
  gap: clamp(1rem, 4vw, 3rem);
  width: 100%;
  padding: clamp(1rem, 2.5vw, 1.75rem) clamp(1rem, 3vw, 2.5rem);
  border-radius: 0.5rem;
  background: var(--color-gold-400);
  color: #10181c;
  text-align: start;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.start:hover {
  background: var(--color-gold-300);
}
.start:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.start:focus-visible {
  outline-color: #f2efe6;
  outline-offset: 3px;
}
.words {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.title {
  font-size: clamp(2.5rem, 7.5vw, 5.75rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
}
.detail {
  font-size: clamp(1rem, 1.8vw, 1.3rem);
  font-weight: 500;
}
/* A framed print: a dark matte around the photo, with a thin inner edge. */
.print {
  position: relative;
  display: block;
  aspect-ratio: 3 / 2;
  border: clamp(0.4rem, 1vw, 0.7rem) solid #10181c;
  background: #10181c;
  box-shadow: 0 0 0 1px #10181c;
}
.print img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 1s ease;
}
.print img.on {
  opacity: 1;
}
@media (max-width: 640px) {
  .start {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .print img {
    transition: none;
  }
}
</style>
