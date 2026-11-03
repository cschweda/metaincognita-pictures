<script setup lang="ts">
// Demo or live. A new install starts in demo mode with a few sample photos, so it can be tried at
// once. The owner's first upload makes it live. In live mode, leftover demo photos can be removed.
interface Status {
  mode: 'demo' | 'live'
  demo_photos: number
  photos: number
  demo_count: number
  job: { state: 'idle' | 'loading' | 'done' | 'failed', done: number, total: number, error: string | null }
}

const status = ref<Status | null>(null)
const demoIds = ref<string[]>([])
const confirmingReload = ref(false)
const removing = ref(false)
const error = ref('')
const libraryVersion = useLibraryVersion()
let timer: ReturnType<typeof setTimeout> | undefined

async function load() {
  clearTimeout(timer)
  const previous = status.value?.job.state
  try {
    status.value = await $fetch<Status>('/api/demo')
  }
  catch {
    return
  }
  // While the demo loads, check every second, and refresh the library as photos arrive.
  if (status.value.job.state === 'loading') {
    libraryVersion.value++
    timer = setTimeout(load, 1500)
  }
  else if (previous === 'loading') {
    libraryVersion.value++
  }
}
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
watch(libraryVersion, () => {
  if (status.value?.job.state !== 'loading') load()
})

async function reload() {
  error.value = ''
  confirmingReload.value = false
  try {
    await $fetch('/api/demo/load', { method: 'POST', headers: apiHeaders, body: { confirm: true } })
    await load()
  }
  catch (failure) {
    error.value = (failure as { statusMessage?: string }).statusMessage ?? 'Couldn\'t load the demo.'
  }
}

async function startRemoving() {
  const { photos } = await $fetch<{ photos: { id: string, demo: number }[] }>('/api/photos', { query: { limit: 200 } })
  demoIds.value = photos.filter(photo => photo.demo).map(photo => photo.id)
  removing.value = true
}

const loading = computed(() => status.value?.job.state === 'loading')
const percent = computed(() => {
  const job = status.value?.job
  return job && job.total ? Math.round((job.done / job.total) * 100) : 0
})
</script>

<template>
  <div v-if="status" class="flex flex-col gap-2">
    <section v-if="loading" class="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4" role="status">
      <p class="font-bold">Setting up the demo: {{ status.job.done }} of {{ status.job.total }} photos</p>
      <span class="block h-2 rounded bg-accented" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" aria-label="Demo photos loaded">
        <span class="block h-full rounded bg-primary transition-all" :style="{ width: `${percent}%` }" />
      </span>
      <p class="text-sm text-muted">Sample photos from Unsplash, through Lorem Picsum. This takes a minute.</p>
    </section>

    <section v-else-if="status.mode === 'demo' && status.photos > 0" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-4">
      <div class="flex min-w-0 flex-col gap-0.5">
        <p class="font-bold"><UIcon name="i-lucide-flask-conical" class="me-1 size-4 align-[-2px] text-primary" aria-hidden="true" />Demo mode</p>
        <p class="text-sm text-muted">
          These {{ status.demo_photos }} sample photos show how OpenMantel works. Try Start slideshow, open Frames or Playlists, or pair a frame.
          Add a photo of your own and the app goes live.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton variant="soft" color="neutral" icon="i-lucide-refresh-cw" @click="confirmingReload = true">New demo photos</UButton>
        <UButton to="/admin/start-over" variant="ghost" color="neutral">Clear everything</UButton>
      </div>
    </section>

    <section v-else-if="status.mode === 'demo'" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-4">
      <div class="flex min-w-0 flex-col gap-0.5">
        <p class="font-bold">Your library is empty</p>
        <p class="text-sm text-muted">Add your own photos below, or load {{ status.demo_count }} sample photos to see how it all works first.</p>
        <p v-if="status.job.state === 'failed' && status.job.error" role="alert" class="text-sm text-error">{{ status.job.error }}</p>
      </div>
      <UButton icon="i-lucide-flask-conical" @click="reload">Load demo photos</UButton>
    </section>

    <section v-else-if="status.demo_photos > 0" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-4">
      <p class="min-w-0 text-sm text-muted">
        You're live, with your own photos. {{ status.demo_photos }} demo {{ status.demo_photos === 1 ? 'photo is' : 'photos are' }} still in the library.
      </p>
      <UButton variant="soft" color="neutral" icon="i-lucide-trash-2" @click="startRemoving">Remove the demo photos</UButton>
    </section>

    <p v-if="error" role="alert" class="text-error">{{ error }}</p>

    <UModal v-model:open="confirmingReload" title="Load new demo photos?" description="This replaces everything in the library">
      <template #body>
        <p>The {{ status.demo_photos }} demo photos and their playlists, tags, and preset go, and {{ status.demo_count }} new sample photos load in their place. Paired frames stay paired, and switch to showing all photos. You're in demo mode, so none of your own photos are here.</p>
      </template>
      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="soft" class="justify-center" autofocus @click="confirmingReload = false">Keep these</UButton>
          <UButton icon="i-lucide-refresh-cw" class="justify-center" @click="reload">Load new demo photos</UButton>
        </div>
      </template>
    </UModal>

    <BulkDeleteDialog v-model:open="removing" demo :ids="demoIds" @deleted="() => { libraryVersion++; load() }" />
  </div>
</template>
