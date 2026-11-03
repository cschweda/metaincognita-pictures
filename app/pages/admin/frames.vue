<script setup lang="ts">
// Every frame, and what it is showing.
definePageMeta({ middleware: 'admin' })

const frames = ref<Frame[]>([])
const { tags, loadTags } = useTags()
const presets = ref<Preset[]>([])
const loading = ref(true)
let timer: ReturnType<typeof setInterval> | undefined

async function loadFrames() {
  frames.value = (await $fetch<{ devices: Frame[] }>('/api/devices')).devices
}
async function loadPresets() {
  presets.value = (await $fetch<{ presets: Preset[] }>('/api/presets')).presets
}

onMounted(async () => {
  await Promise.all([loadFrames(), loadPresets(), loadTags()])
  loading.value = false
  timer = setInterval(loadFrames, 30_000) // Keeps "showing now" fresh.
})
onBeforeUnmount(() => clearInterval(timer))

// Online frames first, each group in the order the server gives.
const framesOnlineFirst = computed(() => [
  ...frames.value.filter(frame => frame.online),
  ...frames.value.filter(frame => !frame.online),
])
const onlineCount = computed(() => frames.value.filter(frame => frame.online).length)

function updated(frame: Frame) {
  frames.value = frames.value.map(item => (item.id === frame.id ? frame : item))
}
function removed(id: string) {
  frames.value = frames.value.filter(item => item.id !== id)
}

</script>

<template>
  <AdminShell title="Your frames">
    <p v-if="!loading && frames.length === 0" class="text-xl text-muted">
      No frames yet. Open this site on a frame's screen, then choose Pair a frame.
    </p>

    <p v-if="frames.length" class="text-xl font-bold tracking-tight" aria-live="polite">
      {{ onlineCount }} of {{ frames.length }} {{ frames.length === 1 ? 'frame' : 'frames' }} online
    </p>

    <ul class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <FrameCard
        v-for="frame in framesOnlineFirst"
        :key="frame.id"
        :frame="frame"
        :tags="tags"
        :presets="presets"
        @updated="updated"
        @removed="removed"
        @presets-changed="loadFrames(); loadPresets()"
      />
    </ul>
  </AdminShell>
</template>
