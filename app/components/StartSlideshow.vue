<script setup lang="ts">
// The main action: a gold wall with the library's real photos in a dark matte.
const props = defineProps<{ photos: string[], count: number | null, tagName?: string }>()
const tagFilter = useTagFilter()
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
  if (props.count === 0) return props.tagName ? `No photos are tagged ${props.tagName}` : 'Add photos first'
  const photos = `${props.count} ${props.count === 1 ? 'photo' : 'photos'}`
  return props.tagName ? `${photos} tagged ${props.tagName}` : `All ${photos} in random order`
})

async function start() {
  await document.documentElement.requestFullscreen?.().catch(() => undefined)
  await navigateTo({ path: '/', query: tagFilter.value ? { tag: tagFilter.value } : {} })
}
</script>

<template>
  <button type="button" class="start" :disabled="count === 0" @click="start">
    <span class="words">
      <span class="title">Start slideshow</span>
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
</template>

<style scoped>
.start {
  display: grid;
  grid-template-columns: 1fr minmax(0, 38%);
  align-items: center;
  gap: clamp(1rem, 4vw, 3rem);
  width: 100%;
  padding: clamp(1.25rem, 4vw, 3rem);
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
  gap: 0.75rem;
}
.title {
  font-size: clamp(3rem, 9.5vw, 6.75rem);
  font-weight: 800;
  line-height: 0.92;
  letter-spacing: -0.03em;
}
.detail {
  font-size: clamp(1.05rem, 2.2vw, 1.5rem);
  font-weight: 500;
}
/* A framed print: a dark matte around the photo, with a thin inner edge. */
.print {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  border: clamp(0.5rem, 1.6vw, 1.1rem) solid #10181c;
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
