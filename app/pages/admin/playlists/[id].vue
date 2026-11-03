<script setup lang="ts">
// One playlist beside the library. Drag photos in from the library, drag to reorder, and drag one
// back to the library to take it out. On a phone, tap Add, tap to move, and tap Take out instead.
import Sortable from 'sortablejs'

definePageMeta({ middleware: 'admin' })

interface Photo {
  id: string
  filename: string
  hidden: number
  caption: string | null
}

const route = useRoute()
const id = String(route.params.id)

const playlist = ref<Playlist | null>(null)
const photos = ref<Photo[]>([])
const loading = ref(true)
const missing = ref(false)
const picked = ref<string | null>(null)
const error = ref('')
const announcement = ref('')
const confirmingDelete = ref(false)
const deleting = ref(false)
const order = useSlideshowOrder()

const library = ref<Photo[]>([])
const libraryNext = ref<number | null>(null)
const libraryTag = ref('all')
const librarySearch = ref('')
const { tags, loadTags } = useTags()
const libraryTagItems = computed(() => [
  { label: 'All photos', value: 'all' },
  ...tags.value.map(tag => ({ label: `${tag.name} (${tag.photos ?? 0})`, value: tag.id })),
])
const inPlaylist = computed(() => new Set(photos.value.map(photo => photo.id)))

const playlistList = ref<HTMLElement | null>(null)
const libraryList = ref<HTMLElement | null>(null)
let playlistSortable: Sortable | undefined
let librarySortable: Sortable | undefined

const problem = (failure: unknown, fallback: string) => (failure as { statusMessage?: string }).statusMessage ?? fallback

// Edits run one at a time, so a quick second drag can't race the first. If one fails, the page
// reloads the playlist from the server rather than guessing what it holds.
let queue: Promise<unknown> = Promise.resolve()
function enqueue(task: () => Promise<void>, fallback: string) {
  queue = queue.then(task).catch(async (failure) => {
    error.value = problem(failure, fallback)
    await load()
  })
  return queue
}

// A mouse drag can end with a click on the photo, which would pick it up. Ignore that click.
let justDragged = false
function dragged() {
  justDragged = true
  setTimeout(() => { justDragged = false }, 100)
}

async function load() {
  try {
    const [list, detail] = await Promise.all([
      $fetch<{ playlists: Playlist[] }>('/api/playlists'),
      $fetch<{ photos: Photo[] }>(`/api/playlists/${id}/photos`),
    ])
    playlist.value = list.playlists.find(item => item.id === id) ?? null
    photos.value = detail.photos
    missing.value = !playlist.value
  }
  catch {
    missing.value = true
  }
  loading.value = false
}

async function loadLibrary(more = false) {
  const page = await $fetch<{ photos: Photo[], next: number | null }>('/api/photos', {
    query: {
      limit: 120,
      before: more ? libraryNext.value ?? undefined : undefined,
      tag: libraryTag.value === 'all' ? undefined : libraryTag.value,
      q: librarySearch.value.trim() || undefined,
    },
  })
  library.value = more ? [...library.value, ...page.photos] : page.photos
  libraryNext.value = page.next
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(libraryTag, () => loadLibrary())
watch(librarySearch, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadLibrary(), 250)
})

onMounted(async () => {
  await Promise.all([load(), loadLibrary(), loadTags()])
})
onBeforeUnmount(() => {
  playlistSortable?.destroy()
  librarySortable?.destroy()
  clearTimeout(searchTimer)
})

// Sortable moves elements itself. Each handler puts the DOM back as it was, then changes the
// data, so Vue stays in charge of both lists.
const SHARED = {
  animation: 150,
  delay: 200, // On touch screens a short hold starts a drag, so the page still scrolls.
  delayOnTouchOnly: true,
  touchStartThreshold: 8,
  forceFallback: true, // Native drag and drop is unreliable on iPhones.
  supportPointer: false,
  fallbackTolerance: 3,
  draggable: '[data-photo]',
}

watch(playlistList, (element) => {
  playlistSortable?.destroy()
  if (!element) return
  playlistSortable = Sortable.create(element, {
    ...SHARED,
    group: { name: 'playlist', pull: true, put: true },
    onEnd(event) {
      dragged()
      if (event.from !== event.to) return // Dropped on the library: handled there.
      const { item, from, oldIndex, newIndex } = event
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
      from.removeChild(item)
      from.insertBefore(item, from.children[oldIndex] ?? null)
      move(oldIndex, newIndex)
    },
    onAdd(event) {
      // A photo dragged in from the library. The library keeps its own copy.
      const { item, clone, newIndex } = event
      const photoId = item.dataset.photo ?? ''
      clone.replaceWith(item)
      insert(photoId, newIndex ?? photos.value.length)
    },
  } as Sortable.Options)
}, { flush: 'post' })

watch(libraryList, (element) => {
  librarySortable?.destroy()
  if (!element) return
  librarySortable = Sortable.create(element, {
    ...SHARED,
    sort: false,
    group: { name: 'playlist', pull: 'clone', put: true },
    onEnd: dragged,
    onAdd(event) {
      // A playlist photo dragged back to the library: take it out of the playlist.
      const { item, from, oldIndex } = event
      const photoId = item.dataset.photo ?? ''
      item.remove()
      from.insertBefore(item, from.children[oldIndex ?? 0] ?? null)
      const photo = photos.value.find(entry => entry.id === photoId)
      if (photo) remove(photo)
    },
  } as Sortable.Options)
}, { flush: 'post' })

function saveOrder(next: Photo[], message: string) {
  photos.value = next
  announcement.value = message
  error.value = ''
  const order = next.map(photo => photo.id)
  return enqueue(async () => {
    await $fetch(`/api/playlists/${id}/order`, { method: 'POST', headers: apiHeaders, body: { photo_ids: order } })
  }, 'Couldn\'t save the new order.')
}

function move(from: number, to: number) {
  if (to < 0 || to >= photos.value.length || from === to) return
  const next = [...photos.value]
  const [photo] = next.splice(from, 1)
  next.splice(to, 0, photo!)
  saveOrder(next, `${photo!.filename} moved to position ${to + 1} of ${next.length}.`)
}

/** Adds a library photo at a position, or moves it there if it's already in the playlist. */
function insert(photoId: string, at: number) {
  const existing = photos.value.findIndex(photo => photo.id === photoId)
  // The drop position counted the copy being dragged in, so an earlier photo lands one sooner.
  if (existing !== -1) return move(existing, Math.min(at - (existing < at ? 1 : 0), photos.value.length - 1))

  const photo = library.value.find(entry => entry.id === photoId)
  if (!photo) return
  error.value = ''
  const position = Math.min(at, photos.value.length)
  const next = [...photos.value]
  next.splice(position, 0, photo)
  photos.value = next
  announcement.value = `${photo.filename} added at position ${position + 1} of ${next.length}.`
  return enqueue(async () => {
    const result = await $fetch<{ playlist: Playlist }>(`/api/playlists/${id}/photos`, {
      method: 'POST',
      headers: apiHeaders,
      body: { photo_ids: [photoId], at: position },
    })
    playlist.value = result.playlist
  }, 'Couldn\'t add that photo.')
}

/** Tap a photo, then tap where it goes. */
function tap(photo: Photo, index: number) {
  if (justDragged) return
  const from = photos.value.findIndex(item => item.id === picked.value)
  if (from === -1) {
    picked.value = photo.id
    return
  }
  picked.value = null
  move(from, index)
}

function remove(photo: Photo) {
  error.value = ''
  photos.value = photos.value.filter(item => item.id !== photo.id)
  if (picked.value === photo.id) picked.value = null
  announcement.value = `${photo.filename} taken out of the playlist. It's still in your library.`
  return enqueue(async () => {
    const result = await $fetch<{ playlist: Playlist }>(`/api/playlists/${id}/remove`, {
      method: 'POST',
      headers: apiHeaders,
      body: { photo_ids: [photo.id] },
    })
    playlist.value = result.playlist
  }, 'Couldn\'t take that photo out.')
}

async function rename(event: Event) {
  const name = (event.target as HTMLInputElement).value.trim()
  if (!playlist.value || !name || name === playlist.value.name) return
  error.value = ''
  try {
    playlist.value = (await $fetch<{ playlist: Playlist }>(`/api/playlists/${id}`, {
      method: 'PATCH',
      headers: apiHeaders,
      body: { name },
    })).playlist
  }
  catch (failure) {
    error.value = problem(failure, 'Couldn\'t rename the playlist.')
  }
}

async function play() {
  await document.documentElement.requestFullscreen?.().catch(() => undefined)
  await navigateTo({ path: '/', query: { playlist: id, order: order.value } })
}

async function deletePlaylist() {
  deleting.value = true
  try {
    await $fetch(`/api/playlists/${id}`, { method: 'DELETE', headers: apiHeaders })
    await navigateTo('/admin/playlists')
  }
  catch (failure) {
    error.value = problem(failure, 'Couldn\'t delete the playlist.')
    confirmingDelete.value = false
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <AdminShell :title="playlist?.name ?? 'Playlist'">
    <NuxtLink to="/admin/playlists" class="self-start text-primary underline underline-offset-2">All playlists</NuxtLink>

    <p v-if="missing" class="text-xl text-muted">This playlist doesn't exist any more.</p>

    <template v-else-if="playlist">
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Name" class="min-w-56 grow sm:grow-0">
          <UInput :model-value="playlist.name" name="playlist-name" maxlength="60" size="lg" class="w-full" @change="rename" />
        </UFormField>
        <UFormField label="Order">
          <USelect
            v-model="order"
            :items="[{ label: 'Random', value: 'random' }, { label: 'Playlist order', value: 'sequential' }]"
            size="lg"
            class="w-48"
          />
        </UFormField>
        <UButton size="lg" icon="i-lucide-play" :disabled="photos.length === 0" @click="play">Play here</UButton>
      </div>
      <p class="text-muted max-w-3xl">
        {{ playlist.frames.length ? `Showing on ${playlist.frames.join(', ')}.` : 'Not on a frame yet.' }}
        To put it on a frame, choose it under Playlist on the Photos page and press Start slideshow, or pick it on the frame's card.
      </p>

      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>

      <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="playlist-heading" class="flex min-w-0 flex-col gap-3 lg:sticky lg:top-2">
          <div class="flex items-baseline justify-between gap-2">
            <h2 id="playlist-heading" class="text-2xl font-extrabold tracking-tight">
              In this playlist <span class="font-normal text-muted tabular-nums">({{ photos.length }})</span>
            </h2>
          </div>
          <p class="text-sm text-muted">
            {{ picked ? 'Now tap where it goes.' : 'Drag to reorder, or tap a photo and then tap where it goes. Drag one onto your library to take it out.' }}
          </p>
          <ol
            ref="playlistList"
            class="grid min-h-40 grid-cols-3 content-start gap-2 rounded-lg border-2 border-dashed border-default p-2 sm:grid-cols-4 lg:max-h-[70vh] lg:overflow-y-auto"
            aria-label="Photos in this playlist, in order"
          >
            <li v-for="(photo, index) in photos" :key="photo.id" :data-photo="photo.id" class="flex flex-col gap-1">
              <button
                type="button"
                class="relative block w-full cursor-grab rounded select-none [-webkit-touch-callout:none]"
                :class="{ 'ring-4 ring-primary': picked === photo.id }"
                :aria-label="picked ? `Move to position ${index + 1}, the place of ${photo.filename}` : `Pick up ${photo.filename}, number ${index + 1}`"
                :aria-pressed="picked === photo.id"
                @click="tap(photo, index)"
              >
                <img
                  :src="`/v/${photo.id}-640.webp`"
                  alt=""
                  draggable="false"
                  class="pointer-events-none aspect-square w-full rounded bg-elevated object-cover"
                  :class="{ 'opacity-40': photo.hidden }"
                >
                <span class="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-sm font-bold text-white tabular-nums">{{ index + 1 }}</span>
              </button>
              <p v-if="photo.hidden" class="text-xs text-muted">Hidden, so skipped</p>
              <UButton size="xs" variant="ghost" color="error" class="justify-center" :aria-label="`Take ${photo.filename} out of the playlist`" @click="remove(photo)">
                Take out
              </UButton>
            </li>
            <li v-if="!loading && photos.length === 0" class="col-span-full grid min-h-36 place-items-center p-4 text-center text-muted">
              Drag photos here from your library, or tap Add under a photo.
            </li>
          </ol>
        </section>

        <section aria-labelledby="library-heading" class="flex min-w-0 flex-col gap-3">
          <h2 id="library-heading" class="text-2xl font-extrabold tracking-tight">Your library</h2>
          <div class="grid gap-2 sm:grid-cols-2">
            <USelect v-model="libraryTag" :items="libraryTagItems" aria-label="Show photos tagged" class="w-full" />
            <UInput v-model="librarySearch" name="library-search" icon="i-lucide-search" placeholder="Search names and captions" aria-label="Search the library" class="w-full" />
          </div>
          <ul
            ref="libraryList"
            class="grid grid-cols-3 gap-2 sm:grid-cols-4"
            aria-label="Your library. Drag a photo into the playlist."
          >
            <li v-for="photo in library" :key="photo.id" :data-photo="photo.id" class="flex flex-col gap-1">
              <div class="relative cursor-grab select-none [-webkit-touch-callout:none]">
                <img
                  :src="`/v/${photo.id}-640.webp`"
                  :alt="photo.filename"
                  draggable="false"
                  loading="lazy"
                  class="pointer-events-none aspect-square w-full rounded bg-elevated object-cover"
                  :class="{ 'opacity-40': inPlaylist.has(photo.id) || photo.hidden }"
                >
                <span v-if="inPlaylist.has(photo.id)" class="absolute inset-x-1 bottom-1 rounded bg-black/75 px-1 text-center text-xs font-bold text-white">
                  In playlist
                </span>
              </div>
              <UButton
                size="xs"
                variant="soft"
                class="justify-center"
                :disabled="inPlaylist.has(photo.id)"
                :aria-label="`Add ${photo.filename} to the end of the playlist`"
                @click="insert(photo.id, photos.length)"
              >
                Add
              </UButton>
            </li>
          </ul>
          <p v-if="library.length === 0" class="text-muted">No photos match.</p>
          <UButton v-if="libraryNext !== null" variant="soft" color="neutral" class="self-start" @click="loadLibrary(true)">
            Show more photos
          </UButton>
        </section>
      </div>

      <UButton size="lg" color="error" variant="soft" icon="i-lucide-trash-2" class="self-start" @click="confirmingDelete = true">
        Delete this playlist
      </UButton>
      <UModal v-model:open="confirmingDelete" :title="`Delete ${playlist.name}?`" :dismissible="!deleting">
        <template #body>
          <div class="flex flex-col gap-3 text-lg">
            <p>The photos stay in your library. Only the playlist and its order go.</p>
            <p v-if="playlist.frames.length">{{ playlist.frames.join(', ') }} will go back to showing photos by tag.</p>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton size="lg" color="neutral" variant="soft" class="justify-center" autofocus :disabled="deleting" @click="confirmingDelete = false">Keep it</UButton>
            <UButton size="lg" color="error" class="justify-center" :loading="deleting" @click="deletePlaylist">Delete playlist</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </AdminShell>
</template>
