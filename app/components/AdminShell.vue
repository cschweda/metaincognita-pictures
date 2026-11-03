<script setup lang="ts">
// Navigation for every admin page. Pages with `hero` lead with Start slideshow.
const props = defineProps<{ hero?: boolean, title?: string }>()
const route = useRoute()

const LINKS = [
  { label: 'Photos', to: '/admin' },
  { label: 'Frames', to: '/admin/frames' },
  { label: 'Playlists', to: '/admin/playlists' },
  { label: 'Tags', to: '/admin/tags' },
  { label: 'Stats', to: '/admin/stats' },
  { label: 'Pair a frame', to: '/admin/pair' },
  { label: 'Sessions', to: '/admin/sessions' },
  { label: 'Technical details', to: '/admin/technical' },
]
const { repository } = useAppConfig()

const heroPhotos = ref<string[]>([])
const count = ref<number | null>(null)

const tagFilter = useTagFilter()
const order = useSlideshowOrder()
const playlistChoice = useSlideshowPlaylist()
const show = useSlideshowShow()
const ORDERS = computed(() => [
  { label: 'Random', value: 'random' },
  { label: playlistChoice.value ? 'Sequential, in playlist order' : 'Sequential, in my order', value: 'sequential' },
])
const { tags, loadTags } = useTags()
const target = useSlideshowTarget()
const frames = ref<Frame[]>([])
const playlists = ref<Playlist[]>([])
const remoteError = ref('')

const tagName = computed(() => {
  if (playlistChoice.value) {
    const playlist = playlists.value.find(item => item.id === playlistChoice.value)
    if (!playlist) return undefined
    return /playlist$/i.test(playlist.name) ? playlist.name : `the ${playlist.name} playlist`
  }
  if (tagFilter.value === 'memories') return 'On this day'
  return tags.value.find(tag => tag.id === tagFilter.value)?.name
})
const playlistItems = computed(() => [
  { label: 'All photos', value: 'none' },
  ...playlists.value.map(playlist => ({ label: `${playlist.name} (${playlist.photos})`, value: playlist.id })),
])
const tagItems = computed(() => [
  { label: 'No tag: all photos', value: 'all' },
  { label: 'On this day', value: 'memories' },
  ...tags.value.map(tag => ({ label: `${tag.name} (${tag.photos ?? 0})`, value: tag.id })),
])
const targetItems = computed(() => [
  ...(frames.value.length ? [{ label: `All frames (${frames.value.length})`, value: 'all' }] : []),
  ...frames.value.map(frame => ({ label: `${frame.name}${frame.online ? '' : ' (offline)'}`, value: frame.id })),
  { label: 'This screen', value: 'screen' },
])
const targetFrames = computed(() => target.value === 'all'
  ? frames.value
  : frames.value.filter(frame => frame.id === target.value))
const remoteFrames = computed(() => targetFrames.value.filter(frame => frame.online))
// Starting on frames saves what they show, so say exactly whose setup it replaces.
const playOnHelp = computed(() => {
  if (target.value === 'screen') return 'Full screen, in this browser'
  if (target.value === 'all') return 'Replaces what every frame shows'
  return `Replaces what ${targetFrames.value[0]?.name ?? 'this frame'} shows. Other frames carry on`
})
const targetsLoaded = ref(false)
let targetTimer: ReturnType<typeof setInterval> | undefined

async function loadTargets() {
  const [deviceList, playlistList] = await Promise.all([
    $fetch<{ devices: Frame[] }>('/api/devices'),
    $fetch<{ playlists: Playlist[] }>('/api/playlists'),
  ]).finally(() => { targetsLoaded.value = true })
  frames.value = deviceList.devices
  playlists.value = playlistList.playlists
  // A playlist deleted elsewhere falls back to all photos.
  if (playlistChoice.value && !playlists.value.some(playlist => playlist.id === playlistChoice.value)) playlistChoice.value = ''
  // With no frames, or a frame that has gone, play on this screen.
  if (target.value === 'all' ? frames.value.length === 0 : target.value !== 'screen' && !frames.value.some(frame => frame.id === target.value)) {
    target.value = frames.value.length ? 'all' : 'screen'
  }
}

/** The remote, for the frame or frames Start slideshow is pointed at. */
async function control(action: 'previous' | 'pause' | 'resume' | 'next') {
  remoteError.value = ''
  const results = await Promise.allSettled(remoteFrames.value.map(frame =>
    $fetch(`/api/devices/${frame.id}/control`, { method: 'POST', headers: apiHeaders, body: { action } }),
  ))
  if (results.some(result => result.status === 'rejected')) remoteError.value = 'Some frames didn\'t respond. They may have just gone offline.'
}

async function loadHero() {
  const { photos } = await $fetch<{ photos: { id: string, hidden: number }[] }>('/api/photos', {
    query: { limit: 200, tag: show.value || undefined },
  })
  const visible = photos.filter(photo => !photo.hidden)
  heroPhotos.value = visible.slice(0, 8).map(photo => photo.id)
  count.value = show.value ? visible.length : (await $fetch<{ showing: number }>('/api/stats')).showing
}

onMounted(() => {
  if (!props.hero) return
  loadTags()
  loadHero()
  loadTargets()
  targetTimer = setInterval(() => loadTargets().catch(() => undefined), 30_000) // Keeps online status and the remote current.
})
onBeforeUnmount(() => clearInterval(targetTimer))
watch([show, tags], () => {
  if (props.hero) loadHero()
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST', headers: apiHeaders })
  await navigateTo('/login')
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6 flex flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <NuxtLink to="/admin" class="text-2xl font-extrabold tracking-tight">OpenMantel</NuxtLink>
      <nav aria-label="Admin" class="flex flex-wrap items-center gap-1">
        <NuxtLink
          v-for="link in LINKS"
          :key="link.to"
          :to="link.to"
          class="rounded px-3 py-2 font-medium text-muted hover:text-default"
          :class="{ 'text-primary hover:text-primary': route.path === link.to }"
          :aria-current="route.path === link.to ? 'page' : undefined"
        >
          {{ link.label }}
        </NuxtLink>
        <a
          :href="repository"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded px-3 py-2 font-medium text-muted hover:text-default"
        >
          GitHub
          <UIcon name="i-lucide-external-link" class="size-4" aria-hidden="true" />
          <span class="sr-only">(opens in a new tab)</span>
        </a>
        <button type="button" class="rounded px-3 py-2 font-medium text-muted hover:text-default" @click="logout">
          Log out
        </button>
      </nav>
    </header>

    <section v-if="hero" aria-label="Slideshow" class="flex flex-col gap-2">
      <StartSlideshow :photos="heroPhotos" :count="count" :tag-name="tagName" :frames="targetFrames" :ready="targetsLoaded" @started="loadTargets" />
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Playlist" :help="playlists.length ? undefined : 'Make one on the Playlists page'">
          <USelect
            :model-value="playlistChoice || 'none'"
            :items="playlistItems"
            size="lg"
            class="w-full"
            @update:model-value="playlistChoice = $event === 'none' ? '' : String($event)"
          />
        </UFormField>
        <UFormField label="Show" :help="playlistChoice ? 'Not used with a playlist' : undefined">
          <USelect
            :disabled="Boolean(playlistChoice)"
            :model-value="tagFilter || 'all'"
            :items="tagItems"
            size="lg"
            class="w-full"
            @update:model-value="tagFilter = $event === 'all' ? '' : String($event)"
          />
        </UFormField>
        <UFormField label="Order" help="Starts again after the last photo">
          <USelect
            v-model="order"
            :items="ORDERS"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Play on" :help="playOnHelp">
          <USelect
            v-model="target"
            :items="targetItems"
            size="lg"
            class="w-full"
          />
        </UFormField>
      </div>
      <div v-if="target !== 'screen' && targetFrames.length" class="flex flex-wrap items-center gap-2">
        <template v-if="remoteFrames.length">
          <span class="text-muted">
            Remote for {{ target === 'all' ? `all ${remoteFrames.length} online ${remoteFrames.length === 1 ? 'frame' : 'frames'}` : targetFrames[0]?.name }}
          </span>
          <div class="flex gap-2" role="group" aria-label="Remote control">
            <UButton size="lg" variant="soft" color="neutral" icon="i-lucide-skip-back" aria-label="Previous photo" @click="control('previous')" />
            <UButton size="lg" variant="soft" color="neutral" icon="i-lucide-pause" aria-label="Pause" @click="control('pause')" />
            <UButton size="lg" variant="soft" color="neutral" icon="i-lucide-play" aria-label="Resume" @click="control('resume')" />
            <UButton size="lg" variant="soft" color="neutral" icon="i-lucide-skip-forward" aria-label="Next photo" @click="control('next')" />
          </div>
        </template>
        <span v-else class="text-muted">
          {{ target === 'all' ? 'No frames are online right now.' : `${targetFrames[0]?.name} is offline right now.` }}
          A slideshow started now plays when {{ target === 'all' ? 'they reconnect' : 'it reconnects' }}.
        </span>
        <p v-if="remoteError" role="alert" class="w-full text-error">{{ remoteError }}</p>
      </div>
    </section>

    <main class="flex flex-col gap-5">
      <h1 v-if="title" class="text-4xl sm:text-5xl font-extrabold tracking-tight">{{ title }}</h1>
      <slot />
    </main>
  </div>
</template>
