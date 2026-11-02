<script setup lang="ts">
import type { Stats } from '~/components/LibraryStats.vue'

// The phone-first home: every frame, and what it is showing.
definePageMeta({ middleware: 'admin' })

const frames = ref<Frame[]>([])
const { tags } = useTags()
const presets = ref<Preset[]>([])
const stats = ref<Stats | null>(null)
const loading = ref(true)
let timer: ReturnType<typeof setInterval> | undefined

async function loadFrames() {
  frames.value = (await $fetch<{ devices: Frame[] }>('/api/devices')).devices
}
async function loadStats() {
  stats.value = await $fetch<Stats>('/api/stats')
}
async function loadPresets() {
  presets.value = (await $fetch<{ presets: Preset[] }>('/api/presets')).presets
}

onMounted(async () => {
  await Promise.all([loadFrames(), loadPresets(), loadStats()])
  loading.value = false
  timer = setInterval(() => Promise.all([loadFrames(), loadStats()]), 30_000) // Keeps "showing now" fresh.
})
onBeforeUnmount(() => clearInterval(timer))

function updated(frame: Frame) {
  frames.value = frames.value.map(item => (item.id === frame.id ? frame : item))
}
function removed(id: string) {
  frames.value = frames.value.filter(item => item.id !== id)
}

</script>

<template>
  <AdminShell hero title="Your library">
    <LibraryStats :stats="stats" :tags="tags" />

    <h2 class="text-4xl sm:text-5xl font-extrabold tracking-tight">Your frames</h2>

    <p v-if="!loading && frames.length === 0" class="text-xl text-muted">
      No frames yet. Open this site on a frame's screen, then choose Pair a frame.
    </p>

    <ul class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <FrameCard
        v-for="frame in frames"
        :key="frame.id"
        :frame="frame"
        :tags="tags"
        :presets="presets"
        @updated="updated"
        @removed="removed"
        @presets-changed="loadPresets"
      />
    </ul>
  </AdminShell>
</template>
