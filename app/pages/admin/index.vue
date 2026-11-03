<script setup lang="ts">
import Sortable from 'sortablejs'

definePageMeta({ middleware: 'admin' })

interface Photo {
  id: string
  filename: string
  hidden: number
  position: number
  caption: string | null
  taken_at: string | null
  tags: Tag[]
  demo?: number
}
interface UploadResponse {
  results: { filename: string, status: 'added' | 'duplicate' | 'rejected', error?: string }[]
}

const headers = apiHeaders
const photos = ref<Photo[]>([])
const next = ref<number | null>(null)
const loading = ref(true)
const { tags: allTags, loadTags } = useTags()
const uploadTags = ref<string[]>([])
const bulkTags = ref<string[]>([])
const selected = ref<string[]>([])
const route = useRoute()
const tagFilter = useTagFilter()
if (typeof route.query.tag === 'string') tagFilter.value = route.query.tag
const busy = ref(false)
const search = ref('')
const uploadDone = ref(0)
const uploadTotal = ref(0)
const onlineFrames = ref<Frame[]>([])
const sentTo = ref('')
const bulkCaption = ref('')
const bulkDate = ref('')
const detailsFor = ref<string | null>(null)
const detailsOpen = ref(false)
const detailsPhoto = computed(() => photos.value.find(photo => photo.id === detailsFor.value) ?? null)
async function deleteFromDetails(photo: Photo) {
  const wasConfirming = confirming.value === photo.id
  await remove(photo)
  if (wasConfirming) detailsOpen.value = false
}
function showDetails(photo: Photo) {
  detailsFor.value = photo.id
  detailsOpen.value = true
}
const NEW_PLAYLIST = 'new'
const playlists = ref<Playlist[]>([])
const playlistTarget = ref<string>(NEW_PLAYLIST)
const newPlaylistName = ref('')
const playlistNotice = ref<{ text: string, id: string } | null>(null)
const playlistTargets = computed(() => [
  ...playlists.value.map(playlist => ({ label: playlist.name, value: playlist.id })),
  { label: 'A new playlist', value: NEW_PLAYLIST },
])
const confirmingArrange = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadPhotos(), 300)
})
const progress = ref('')
const problems = ref<string[]>([])
const announcement = ref('')
const confirming = ref<string | null>(null)
const grid = useTemplateRef<HTMLElement>('grid')
const arrangeGrid = useTemplateRef<HTMLElement>('arrangeGrid')
const arranging = ref(false)
const picked = ref<string | null>(null)
let arrangeSortable: Sortable | undefined

async function openInSlideshow(photo: Photo) {
  await document.documentElement.requestFullscreen?.().catch(() => undefined)
  await navigateTo({ path: '/', query: { photo: photo.id, ...(tagFilter.value ? { tag: tagFilter.value } : {}) } })
}

async function loadPhotos(before?: number) {
  loading.value = true
  const page = await $fetch<{ photos: Photo[], next: number | null }>('/api/photos', {
    query: { before, tag: tagFilter.value || undefined, q: search.value || undefined },
  })
  photos.value = before === undefined ? page.photos : [...photos.value, ...page.photos]
  next.value = page.next
  loading.value = false
}

async function loadFrames() {
  const { devices } = await $fetch<{ devices: Frame[] }>('/api/devices')
  onlineFrames.value = devices.filter(device => device.online)
}

async function sendToFrame(photo: Photo, frame: Frame) {
  await $fetch(`/api/devices/${frame.id}/control`, {
    method: 'POST',
    headers,
    body: { action: 'show', photo_id: photo.id },
  })
  sentTo.value = `${photo.filename} is on ${frame.name} now.`
}

const frameMenu = (photo: Photo) => onlineFrames.value.map(frame => ({
  label: frame.name,
  onSelect: () => sendToFrame(photo, frame),
}))

async function saveDate(photo: Photo, value: string) {
  try {
    const result = await $fetch<{ photo: Photo }>(`/api/photos/${photo.id}`, {
      method: 'PATCH',
      headers,
      body: { taken_at: value || null },
    })
    photo.taken_at = result.photo.taken_at
  }
  catch {
    problems.value.push(`${photo.filename}: could not save the date.`)
  }
}

function bulkPatch(body: object) {
  return bulk(() => Promise.all(selected.value.map(id =>
    $fetch(`/api/photos/${id}`, { method: 'PATCH', headers, body }),
  )))
}

async function loadPlaylists() {
  playlists.value = (await $fetch<{ playlists: Playlist[] }>('/api/playlists')).playlists
  if (playlistTarget.value === NEW_PLAYLIST && playlists.value[0]) playlistTarget.value = playlists.value[0].id
}

/** Adds the selection, in grid order, to the end of a playlist, or starts a new one with it. */
async function addToPlaylist() {
  const ids = photos.value.filter(photo => selected.value.includes(photo.id)).map(photo => photo.id)
  busy.value = true
  problems.value = []
  playlistNotice.value = null
  try {
    let playlist: Playlist | undefined
    let added = ids.length
    if (playlistTarget.value === NEW_PLAYLIST) {
      const name = newPlaylistName.value.trim()
      if (!name) {
        problems.value.push('Give the new playlist a name.')
        return
      }
      playlist = (await $fetch<{ playlist: Playlist }>('/api/playlists', { method: 'POST', headers, body: { name, photo_ids: ids } })).playlist
      newPlaylistName.value = ''
    }
    else {
      const result = await $fetch<{ added: number, playlist: Playlist }>(`/api/playlists/${playlistTarget.value}/photos`, {
        method: 'POST',
        headers,
        body: { photo_ids: ids },
      })
      playlist = result.playlist
      added = result.added
    }
    await loadPlaylists()
    if (playlist) {
      playlistTarget.value = playlist.id
      const already = ids.length - added
      playlistNotice.value = {
        id: playlist.id,
        text: `Added ${added} ${added === 1 ? 'photo' : 'photos'} to ${playlist.name}${already ? `. ${already} ${already === 1 ? 'was' : 'were'} already in it` : ''}.`,
      }
    }
  }
  catch (error) {
    problems.value.push((error as { statusMessage?: string }).statusMessage ?? 'Couldn\'t add to the playlist.')
  }
  finally {
    busy.value = false
  }
}

function arrangeByDate() {
  if (!confirmingArrange.value) {
    confirmingArrange.value = true
    return
  }
  confirmingArrange.value = false
  return bulk(() => $fetch('/api/photos/arrange', { method: 'POST', headers }))
}

onMounted(() => {
  loadPhotos()
  loadFrames()
  loadPlaylists()
  if (!grid.value) return
  Sortable.create(grid.value, {
    handle: '[data-drag-handle]',
    animation: 150,
    // Native drag and drop and pointer events are unreliable on iPhones, so use touch events.
    forceFallback: true,
    supportPointer: false,
    fallbackTolerance: 3,
    onEnd: finishDrag,
  } as Sortable.Options) // supportPointer is a real option that the type definitions leave out.
})

onBeforeUnmount(() => arrangeSortable?.destroy())

function finishDrag({ item, from, oldIndex, newIndex }: Sortable.SortableEvent) {
  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
  // Sortable moved the element itself. Put it back so Vue stays in charge of the list.
  from.insertBefore(item, from.children[oldIndex + (newIndex < oldIndex ? 1 : 0)] ?? null)
  movePhoto(oldIndex, newIndex)
}

// The full cards are too tall to drag between on a phone, so this view shows only thumbnails.
// Holding before a drag leaves a quick swipe free to scroll the page.
watch(arranging, async (on) => {
  picked.value = null
  arrangeSortable?.destroy()
  arrangeSortable = undefined
  if (!on) return
  await nextTick()
  if (!arrangeGrid.value) return
  arrangeSortable = Sortable.create(arrangeGrid.value, {
    animation: 150,
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    forceFallback: true,
    supportPointer: false,
    fallbackTolerance: 3,
    onEnd: finishDrag,
  } as Sortable.Options)
})

/** Tap a photo, then tap where it goes. This needs no drag gesture at all. */
function tapToMove(photo: Photo, index: number) {
  const from = photos.value.findIndex(item => item.id === picked.value)
  if (from === -1) {
    picked.value = photo.id
    return
  }
  picked.value = null
  if (from !== index) movePhoto(from, index)
}

const tagNames = computed(() => allTags.value.map(tag => tag.name))
// Showing a playlist's photos here lists them in library order, so its own order is arranged on its page.
const shownPlaylist = computed(() => tagFilter.value.startsWith('playlist:')
  ? playlists.value.find(playlist => `playlist:${playlist.id}` === tagFilter.value)
  : undefined)
watch(shownPlaylist, (playlist) => {
  if (playlist) arranging.value = false
})

watch(tagFilter, () => {
  selected.value = []
  loadPhotos()
})
// A demo load, or the demo being removed, changes the library from outside this page.
const libraryVersion = useLibraryVersion()
watch(libraryVersion, () => {
  loadPhotos()
  loadTags()
  loadPlaylists()
})

function toggleSelected(id: string, checked: boolean) {
  selected.value = checked ? [...selected.value, id] : selected.value.filter(item => item !== id)
}

async function bulk(task: () => Promise<unknown>) {
  busy.value = true
  problems.value = []
  try {
    await task()
    await Promise.all([loadPhotos(), loadTags()])
  }
  catch {
    problems.value.push('That change could not be saved.')
  }
  busy.value = false
}

function applyTags(action: 'add' | 'remove') {
  return bulk(async () => {
    const ids = await ensureTags(bulkTags.value)
    await $fetch('/api/photos/tags', {
      method: 'POST',
      headers,
      body: { photo_ids: selected.value, [action]: ids },
    })
    bulkTags.value = []
  })
}

function bulkShown(shown: boolean) {
  return bulk(() => Promise.all(selected.value.map(id =>
    $fetch(`/api/photos/${id}`, { method: 'PATCH', headers, body: { hidden: !shown } }),
  )))
}

const confirmingBulkDelete = ref(false)
/** One photo keeps its single confirmation. Two or more go through the typed bulk delete. */
const bulkDeleting = ref(false)
function bulkDelete() {
  if (selected.value.length > 1) {
    bulkDeleting.value = true
    return
  }
  if (!confirmingBulkDelete.value) {
    confirmingBulkDelete.value = true
    return
  }
  confirmingBulkDelete.value = false
  return bulk(async () => {
    await Promise.all(selected.value.map(id => $fetch(`/api/photos/${id}`, { method: 'DELETE', headers })))
    selected.value = []
  })
}
function afterBulkDelete() {
  selected.value = []
  libraryVersion.value++ // Refetches the grid, and updates the banner's demo photo count.
}

async function movePhoto(from: number, to: number) {
  const [photo] = photos.value.splice(from, 1)
  if (!photo) return
  photos.value.splice(to, 0, photo)
  const after = to === 0 ? null : photos.value[to - 1]?.id ?? null
  announcement.value = `${photo.filename} moved to position ${to + 1} of ${photos.value.length}.`
  try {
    const result = await $fetch<{ photo: Photo }>(`/api/photos/${photo.id}/move`, {
      method: 'POST',
      headers,
      body: { after },
    })
    photo.position = result.photo.position
  }
  catch {
    problems.value.push(`${photo.filename}: could not save the new order.`)
    await loadPhotos()
  }
}

function moveWithKeyboard(event: KeyboardEvent, index: number) {
  const to = index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)
  if (to >= 0 && to < photos.value.length) movePhoto(index, to)
}

// One file per request, so a large batch can't become one huge upload.
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  problems.value = []

  let added = 0
  let duplicates = 0
  uploadDone.value = 0
  uploadTotal.value = files.length
  for (const [index, file] of files.entries()) {
    progress.value = `Uploading ${index + 1} of ${files.length}: ${file.name}`
    const form = new FormData()
    form.append('tags', uploadTags.value.join(','))
    form.append('photo', file)
    try {
      const { results } = await $fetch<UploadResponse>('/api/photos', { method: 'POST', headers, body: form })
      for (const result of results) {
        if (result.status === 'added') added++
        else if (result.status === 'duplicate') duplicates++
        else problems.value.push(`${result.filename}: ${result.error}`)
      }
    }
    catch {
      problems.value.push(`${file.name}: upload failed.`)
    }
    uploadDone.value = index + 1
  }
  uploadTotal.value = 0

  input.value = ''
  progress.value = `${added} added, ${duplicates} already in the library.`
  // Refetches the grid, tags, and playlists, and lets the banner show that the first upload made the app live.
  libraryVersion.value++
}

async function setShown(photo: Photo, shown: boolean) {
  const result = await $fetch<{ photo: Photo }>(`/api/photos/${photo.id}`, {
    method: 'PATCH',
    headers,
    body: { hidden: !shown },
  })
  photo.hidden = result.photo.hidden
}

async function saveCaption(photo: Photo, value: string) {
  const caption = value.trim() || null
  if (caption === photo.caption) return
  try {
    const result = await $fetch<{ photo: Photo }>(`/api/photos/${photo.id}`, {
      method: 'PATCH',
      headers,
      body: { caption },
    })
    photo.caption = result.photo.caption
  }
  catch {
    problems.value.push(`${photo.filename}: could not save the caption.`)
  }
}

async function remove(photo: Photo) {
  if (confirming.value !== photo.id) {
    confirming.value = photo.id
    return
  }
  await $fetch(`/api/photos/${photo.id}`, { method: 'DELETE', headers })
  photos.value = photos.value.filter(item => item.id !== photo.id)
  confirming.value = null
  if (photo.demo) libraryVersion.value++ // The banner's demo photo count.
}

</script>

<template>
  <AdminShell hero>
    <section class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end" aria-label="Add photos">
      <label class="drop">
        <span class="text-xl font-bold tracking-tight">Add photos</span>
        <span class="text-xs text-muted">Drop them here or choose files. JPEG, PNG, WebP, TIFF, AVIF, or HEIC.</span>
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp,image/avif,image/tiff,image/heic,image/heif,.heic,.heif"
          multiple
          class="absolute inset-0 cursor-pointer opacity-0"
          @change="upload"
        >
      </label>
      <TagPicker v-model="uploadTags" label="Tags for these photos" :options="tagNames" />
    </section>

    <div aria-live="polite">
      <p v-if="progress">{{ progress }}</p>
      <UProgress v-if="uploadTotal" :model-value="uploadDone" :max="uploadTotal" class="max-w-xl" />
      <p v-if="sentTo">{{ sentTo }}</p>
      <p class="sr-only">{{ announcement }}</p>
      <ul v-if="problems.length" class="text-error">
        <li v-for="problem in problems" :key="problem">{{ problem }}</li>
      </ul>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Search file names and captions" class="grow max-w-md">
        <UInput v-model="search" name="search" type="search" class="w-full" />
      </UFormField>
      <UButton
        variant="soft"
        color="neutral"
        @click="selected = selected.length ? [] : photos.map(photo => photo.id)"
      >
        {{ selected.length ? 'Clear selection' : 'Select all shown' }}
      </UButton>
      <template v-if="!shownPlaylist">
        <UButton variant="soft" color="neutral" :disabled="busy" @click="arrangeByDate">
          {{ confirmingArrange ? 'Replace my order with dates?' : 'Arrange by date' }}
        </UButton>
        <UButton variant="soft" color="neutral" :aria-pressed="arranging" @click="arranging = !arranging">
          Rearrange
        </UButton>
      </template>
    </div>
    <p v-if="shownPlaylist" class="text-muted">
      These are the photos in {{ shownPlaylist.name }}, in library order. To change the playlist's order,
      <NuxtLink :to="`/admin/playlists/${shownPlaylist.id}`" class="text-primary underline underline-offset-2">open the playlist</NuxtLink>.
    </p>

    <section
      v-if="selected.length"
      class="sticky top-2 z-10 flex flex-col gap-2 rounded-lg border border-default bg-default p-3"
      aria-label="Change selected photos"
    >
      <p class="text-xl font-bold">{{ selected.length }} selected</p>
      <TagPicker v-model="bulkTags" label="Tags" :options="tagNames" />
      <div class="grid gap-3 sm:grid-cols-2">
        <form class="flex items-end gap-2" @submit.prevent="bulkPatch({ caption: bulkCaption })">
          <UFormField label="Caption for all selected" class="grow">
            <UInput v-model="bulkCaption" name="bulk-caption" maxlength="200" class="w-full" />
          </UFormField>
          <UButton type="submit" size="sm" variant="soft" :disabled="busy">Set</UButton>
        </form>
        <form class="flex items-end gap-2" @submit.prevent="bulkPatch({ taken_at: bulkDate || null })">
          <UFormField label="Date for all selected" class="grow">
            <UInput v-model="bulkDate" name="bulk-date" type="date" class="w-full" />
          </UFormField>
          <UButton type="submit" size="sm" variant="soft" :disabled="busy">Set</UButton>
        </form>
      </div>
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="addToPlaylist">
        <UFormField label="Add to playlist" class="min-w-48 grow sm:grow-0">
          <USelect v-model="playlistTarget" :items="playlistTargets" class="w-full" />
        </UFormField>
        <UFormField v-if="playlistTarget === NEW_PLAYLIST" label="New playlist name" class="min-w-48 grow">
          <UInput v-model="newPlaylistName" name="new-playlist" maxlength="60" placeholder="Living room" class="w-full" />
        </UFormField>
        <UButton type="submit" size="sm" :disabled="busy">Add {{ selected.length }}</UButton>
      </form>
      <p v-if="playlistNotice" role="status" class="text-sm">
        {{ playlistNotice.text }}
        <NuxtLink :to="`/admin/playlists/${playlistNotice.id}`" class="text-primary underline underline-offset-2">Open the playlist</NuxtLink>
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" :disabled="!bulkTags.length || busy" @click="applyTags('add')">Add tags</UButton>
        <UButton size="sm" variant="soft" :disabled="!bulkTags.length || busy" @click="applyTags('remove')">Remove tags</UButton>
        <UButton size="sm" variant="soft" color="neutral" :disabled="busy" @click="bulkShown(true)">Show on frames</UButton>
        <UButton size="sm" variant="soft" color="neutral" :disabled="busy" @click="bulkShown(false)">Hide from frames</UButton>
        <UButton size="sm" variant="soft" color="error" :disabled="busy" @click="bulkDelete">
          {{ selected.length > 1 ? `Delete ${selected.length}…` : confirmingBulkDelete ? 'Really delete?' : 'Delete' }}
        </UButton>
      </div>
    </section>

    <p v-if="!loading && photos.length === 0" class="text-xl text-muted">No photos here. Add some above.</p>

    <section v-if="arranging" class="flex flex-col gap-3" aria-label="Rearrange photos">
      <div class="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-lg border border-default bg-default p-3">
        <p class="text-sm">
          {{ picked ? 'Now tap where it goes.' : 'Tap a photo, then tap where it goes. Or hold one and drag it.' }}
        </p>
        <UButton @click="arranging = false">Done</UButton>
      </div>
      <ul ref="arrangeGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
        <li v-for="(photo, index) in photos" :key="photo.id">
          <button
            type="button"
            class="block w-full cursor-grab rounded select-none [-webkit-touch-callout:none]"
            :class="{ 'ring-4 ring-primary': picked === photo.id }"
            :aria-label="picked ? `Move to the place of ${photo.filename}` : `Pick up ${photo.filename}`"
            :aria-pressed="picked === photo.id"
            @click="tapToMove(photo, index)"
          >
            <img
              :src="`/v/${photo.id}-640.webp`"
              alt=""
              draggable="false"
              class="pointer-events-none aspect-square w-full object-cover rounded bg-elevated"
              :class="{ 'opacity-40': photo.hidden }"
            >
          </button>
        </li>
      </ul>
    </section>

    <ul v-show="!arranging" ref="grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-5">
      <li v-for="(photo, index) in photos" :key="photo.id" class="flex min-w-0 flex-col gap-1.5">
        <div class="group relative overflow-hidden rounded-lg bg-elevated" :class="{ 'ring-3 ring-primary': selected.includes(photo.id) }">
          <button
            type="button"
            class="block w-full cursor-zoom-in"
            :aria-label="`See ${photo.filename} in the slideshow`"
            title="See in the slideshow"
            @click="openInSlideshow(photo)"
          >
            <img
              :src="`/v/${photo.id}-640.webp`"
              :alt="photo.filename"
              loading="lazy"
              class="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              :class="{ 'opacity-40 grayscale': photo.hidden }"
            >
          </button>
          <div class="absolute left-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
            <UCheckbox
              :model-value="selected.includes(photo.id)"
              :name="`select-${photo.id}`"
              :aria-label="`Select ${photo.filename}`"
              @update:model-value="toggleSelected(photo.id, $event === true)"
            />
          </div>
          <span v-if="photo.hidden" class="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
            <UIcon name="i-lucide-eye-off" class="size-3.5" aria-hidden="true" />
            Hidden
          </span>
          <button
            type="button"
            data-drag-handle
            :aria-label="`Move ${photo.filename}. Use the arrow keys.`"
            title="Drag to rearrange"
            class="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden cursor-grab active:cursor-grabbing touch-none select-none [-webkit-touch-callout:none]"
            @keydown.left.prevent="moveWithKeyboard($event, index)"
            @keydown.up.prevent="moveWithKeyboard($event, index)"
            @keydown.right.prevent="moveWithKeyboard($event, index)"
            @keydown.down.prevent="moveWithKeyboard($event, index)"
          >
            <UIcon name="i-lucide-grip" class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            :aria-label="`Edit and see details for ${photo.filename}`"
            title="Edit and details"
            class="absolute bottom-2 right-2 grid size-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
            @click="showDetails(photo)"
          >
            <UIcon name="i-lucide-ellipsis-vertical" class="size-5" aria-hidden="true" />
          </button>
        </div>
        <p class="truncate text-sm font-medium" :class="photo.caption ? 'text-default' : 'text-muted'">{{ photo.caption || photo.filename }}</p>
        <p v-if="photo.tags.length" class="-mt-1 truncate text-xs text-muted">{{ photo.tags.map(tag => tag.name).join(' · ') }}</p>
      </li>
    </ul>

    <UButton v-if="next" block variant="soft" :loading="loading" @click="next !== null && loadPhotos(next)">
      Load more
    </UButton>
    <BulkDeleteDialog v-model:open="bulkDeleting" :ids="selected" @deleted="afterBulkDelete" />
    <PhotoDetails
      v-model:open="detailsOpen"
      :photo="detailsPhoto"
      :frames="onlineFrames"
      :confirming-delete="confirming === detailsFor"
      @caption="(_, value) => detailsPhoto && saveCaption(detailsPhoto, value)"
      @date="(_, value) => detailsPhoto && saveDate(detailsPhoto, value)"
      @shown="(_, value) => detailsPhoto && setShown(detailsPhoto, value)"
      @send="(_, frame) => detailsPhoto && sendToFrame(detailsPhoto, frame)"
      @delete="() => detailsPhoto && deleteFromDetails(detailsPhoto)"
    />
  </AdminShell>
</template>

<style scoped>
.drop {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem 1rem;
  border: 2px dashed var(--ui-border-accented);
  border-radius: 0.5rem;
}
.drop:hover,
.drop:focus-within {
  border-color: var(--ui-primary);
}
</style>
