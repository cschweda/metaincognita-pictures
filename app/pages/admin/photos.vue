<script setup lang="ts">
import Sortable from 'sortablejs'

definePageMeta({ middleware: 'admin' })

interface Photo {
  id: string
  filename: string
  hidden: number
  position: number
  caption: string | null
  tags: Tag[]
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
const progress = ref('')
const problems = ref<string[]>([])
const announcement = ref('')
const confirming = ref<string | null>(null)
const grid = useTemplateRef<HTMLElement>('grid')

async function loadPhotos(before?: number) {
  loading.value = true
  const page = await $fetch<{ photos: Photo[], next: number | null }>('/api/photos', {
    query: { before, tag: tagFilter.value || undefined },
  })
  photos.value = before === undefined ? page.photos : [...photos.value, ...page.photos]
  next.value = page.next
  loading.value = false
}

onMounted(() => {
  loadPhotos()
  if (!grid.value) return
  Sortable.create(grid.value, {
    handle: '[data-drag-handle]',
    animation: 150,
    onEnd({ item, from, oldIndex, newIndex }) {
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
      // Sortable moved the element itself. Put it back so Vue stays in charge of the list.
      from.insertBefore(item, from.children[oldIndex + (newIndex < oldIndex ? 1 : 0)] ?? null)
      movePhoto(oldIndex, newIndex)
    },
  })
})

const tagNames = computed(() => allTags.value.map(tag => tag.name))

watch(tagFilter, () => {
  selected.value = []
  loadPhotos()
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
function bulkDelete() {
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
  for (const [index, file] of files.entries()) {
    progress.value = `Uploading ${index + 1} of ${files.length}…`
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
  }

  input.value = ''
  progress.value = `${added} added, ${duplicates} already in the library.`
  await Promise.all([loadPhotos(), loadTags()])
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
}

</script>

<template>
  <AdminShell hero title="Your photos">
    <section class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-stretch" aria-label="Add photos">
      <label class="drop">
        <span class="text-3xl font-bold tracking-tight">Add photos</span>
        <span class="text-muted">Drop them here or choose files. JPEG, PNG, WebP, TIFF, AVIF, or HEIC.</span>
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
      <p class="sr-only">{{ announcement }}</p>
      <ul v-if="problems.length" class="text-error">
        <li v-for="problem in problems" :key="problem">{{ problem }}</li>
      </ul>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UButton
        variant="soft"
        color="neutral"
        @click="selected = selected.length ? [] : photos.map(photo => photo.id)"
      >
        {{ selected.length ? 'Clear selection' : 'Select all shown' }}
      </UButton>
    </div>

    <section
      v-if="selected.length"
      class="sticky top-2 z-10 flex flex-col gap-2 rounded-lg border border-default bg-default p-3"
      aria-label="Change selected photos"
    >
      <p class="text-xl font-bold">{{ selected.length }} selected</p>
      <TagPicker v-model="bulkTags" label="Tags" :options="tagNames" />
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" :disabled="!bulkTags.length || busy" @click="applyTags('add')">Add tags</UButton>
        <UButton size="sm" variant="soft" :disabled="!bulkTags.length || busy" @click="applyTags('remove')">Remove tags</UButton>
        <UButton size="sm" variant="soft" color="neutral" :disabled="busy" @click="bulkShown(true)">Show on frames</UButton>
        <UButton size="sm" variant="soft" color="neutral" :disabled="busy" @click="bulkShown(false)">Hide from frames</UButton>
        <UButton size="sm" variant="soft" color="error" :disabled="busy" @click="bulkDelete">
          {{ confirmingBulkDelete ? `Really delete ${selected.length}?` : 'Delete' }}
        </UButton>
      </div>
    </section>

    <p v-if="!loading && photos.length === 0" class="text-xl text-muted">No photos here. Add some above.</p>

    <ul ref="grid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7">
      <li v-for="(photo, index) in photos" :key="photo.id" class="flex flex-col gap-2">
        <div class="relative">
          <img
            :src="`/v/${photo.id}-640.webp`"
            :alt="photo.filename"
            loading="lazy"
            class="aspect-square w-full object-contain bg-elevated rounded"
            :class="{ 'opacity-40': photo.hidden }"
          >
          <button
            type="button"
            data-drag-handle
            :aria-label="`Move ${photo.filename}. Use the arrow keys.`"
            title="Drag to rearrange"
            class="absolute top-2 right-2 size-11 grid place-items-center rounded bg-black/70 text-white cursor-grab active:cursor-grabbing touch-none"
            @keydown.left.prevent="moveWithKeyboard($event, index)"
            @keydown.up.prevent="moveWithKeyboard($event, index)"
            @keydown.right.prevent="moveWithKeyboard($event, index)"
            @keydown.down.prevent="moveWithKeyboard($event, index)"
          >
            <UIcon name="i-lucide-grip" aria-hidden="true" />
          </button>
        </div>
        <UCheckbox
          :model-value="selected.includes(photo.id)"
          :name="`select-${photo.id}`"
          label="Select"
          @update:model-value="toggleSelected(photo.id, $event === true)"
        />
        <UCheckbox
          :model-value="!photo.hidden"
          :name="`shown-${photo.id}`"
          label="Show on frames"
          @update:model-value="setShown(photo, $event === true)"
        />
        <UInput
          :model-value="photo.caption ?? ''"
          :name="`caption-${photo.id}`"
          placeholder="Caption (optional)"
          maxlength="200"
          :aria-label="`Caption for ${photo.filename}`"
          @change="saveCaption(photo, ($event.target as HTMLInputElement).value)"
        />
        <p v-if="photo.tags.length" class="text-sm text-muted truncate">
          {{ photo.tags.map(tag => tag.name).join(', ') }}
        </p>
        <UButton size="sm" variant="ghost" color="error" class="self-start" @click="remove(photo)">
          {{ confirming === photo.id ? 'Really delete?' : 'Delete' }}
        </UButton>
      </li>
    </ul>

    <UButton v-if="next" block variant="soft" :loading="loading" @click="next !== null && loadPhotos(next)">
      Load more
    </UButton>
  </AdminShell>
</template>

<style scoped>
.drop {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.5rem;
  border: 2px dashed var(--ui-border-accented);
  border-radius: 0.5rem;
}
.drop:hover,
.drop:focus-within {
  border-color: var(--ui-primary);
}
</style>
