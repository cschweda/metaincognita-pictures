<script setup lang="ts">
// Every frame, and what it is showing.
definePageMeta({ middleware: 'admin' })

const frames = ref<Frame[]>([])
const { tags, loadTags } = useTags()
const presets = ref<Preset[]>([])
const playlists = ref<Playlist[]>([])
const loading = ref(true)
let timer: ReturnType<typeof setInterval> | undefined

async function loadFrames() {
  frames.value = (await $fetch<{ devices: Frame[] }>('/api/devices')).devices
}
async function loadPlaylists() {
  playlists.value = (await $fetch<{ playlists: Playlist[] }>('/api/playlists')).playlists
}
async function loadPresets() {
  presets.value = (await $fetch<{ presets: Preset[] }>('/api/presets')).presets
}

onMounted(async () => {
  await Promise.all([loadFrames(), loadPresets(), loadPlaylists(), loadTags()])
  loading.value = false
  // Every 5 seconds while the page is in front of you, so the thumbnail, playing or paused, and
  // online status match the frames. Nothing is fetched while it's in the background.
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') loadFrames().catch(() => undefined)
  }, 5_000)
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
const notice = ref('')
function removed(id: string) {
  const name = frames.value.find(item => item.id === id)?.name ?? 'The frame'
  frames.value = frames.value.filter(item => item.id !== id)
  notice.value = `${name} is deactivated. To use it again, pair it from its screen with Pair a frame.`
}

</script>

<template>
  <AdminShell title="Your frames">
    <p role="status" class="text-lg" :class="{ 'sr-only': !notice }">{{ notice }}</p>
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
        :playlists="playlists"
        @updated="updated"
        @removed="removed"
        @presets-changed="loadFrames(); loadPresets()"
      />
    </ul>
  </AdminShell>
</template>
