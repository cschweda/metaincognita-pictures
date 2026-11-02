<script setup lang="ts">
import Sortable from 'sortablejs'

definePageMeta({ middleware: 'admin' })

interface Photo {
  id: string
  filename: string
  hidden: number
  position: number
  caption: string | null
}
interface UploadResponse {
  results: { filename: string, status: 'added' | 'duplicate' | 'rejected', error?: string }[]
}

const headers = { 'X-Requested-With': 'fetch' }
const photos = ref<Photo[]>([])
const next = ref<number | null>(null)
const loading = ref(true)
const tags = ref('')
const progress = ref('')
const problems = ref<string[]>([])
const announcement = ref('')
const confirming = ref<string | null>(null)
const grid = useTemplateRef<HTMLElement>('grid')

async function loadPhotos(before?: number) {
  loading.value = true
  const page = await $fetch<{ photos: Photo[], next: number | null }>('/api/photos', { query: { before } })
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
    form.append('tags', tags.value)
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
  await loadPhotos()
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

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST', headers })
  await navigateTo('/login')
}
</script>

<template>
  <main class="mx-auto max-w-6xl p-4 flex flex-col gap-6">
    <header class="flex items-center justify-between">
      <h1 class="text-lg font-medium">pictures</h1>
      <nav class="flex items-center gap-1">
        <UButton to="/admin/pair" variant="ghost" color="neutral">Pair a frame</UButton>
        <UButton to="/admin/sessions" variant="ghost" color="neutral">Sessions</UButton>
        <UButton variant="ghost" color="neutral" @click="logout">Log out</UButton>
      </nav>
    </header>

    <section class="flex flex-col sm:flex-row sm:items-end gap-3" aria-label="Upload photos">
      <UFormField label="Tags for this upload" help="Separate with commas" class="sm:w-72">
        <UInput v-model="tags" name="tags" placeholder="travel, fall" class="w-full" />
      </UFormField>
      <label class="flex flex-col gap-1 text-sm font-medium sm:w-72">
        Photos
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp,image/avif,image/tiff,image/heic,image/heif,.heic,.heif"
          multiple
          class="block w-full text-sm font-normal"
          @change="upload"
        >
      </label>
    </section>

    <div aria-live="polite" class="text-sm">
      <p v-if="progress">{{ progress }}</p>
      <p class="sr-only">{{ announcement }}</p>
      <ul v-if="problems.length" class="text-error">
        <li v-for="problem in problems" :key="problem">{{ problem }}</li>
      </ul>
    </div>

    <p v-if="!loading && photos.length === 0">No photos yet.</p>

    <ul ref="grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <li v-for="(photo, index) in photos" :key="photo.id" class="flex flex-col gap-1">
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
            class="absolute top-1 right-1 size-8 grid place-items-center rounded bg-black/60 text-white cursor-grab active:cursor-grabbing touch-none"
            @keydown.left.prevent="moveWithKeyboard($event, index)"
            @keydown.up.prevent="moveWithKeyboard($event, index)"
            @keydown.right.prevent="moveWithKeyboard($event, index)"
            @keydown.down.prevent="moveWithKeyboard($event, index)"
          >
            <UIcon name="i-lucide-grip" aria-hidden="true" />
          </button>
        </div>
        <UCheckbox
          :model-value="!photo.hidden"
          :name="`shown-${photo.id}`"
          label="Show on frames"
          @update:model-value="setShown(photo, $event === true)"
        />
        <UInput
          :model-value="photo.caption ?? ''"
          :name="`caption-${photo.id}`"
          size="xs"
          placeholder="Caption (optional)"
          maxlength="200"
          :aria-label="`Caption for ${photo.filename}`"
          @change="saveCaption(photo, ($event.target as HTMLInputElement).value)"
        />
        <UButton size="xs" variant="ghost" color="error" class="self-start" @click="remove(photo)">
          {{ confirming === photo.id ? 'Really delete?' : 'Delete' }}
        </UButton>
      </li>
    </ul>

    <UButton v-if="next" block variant="soft" :loading="loading" @click="next !== null && loadPhotos(next)">
      Load more
    </UButton>
  </main>
</template>
