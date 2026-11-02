<script setup lang="ts">
// Thumbnails of what the slideshow will play: the chosen tag, or every photo.
interface Listed {
  id: string
  filename: string
  hidden: number
}

const tagFilter = useTagFilter()
const photos = ref<Listed[]>([])
const next = ref<number | null>(null)
const loading = ref(true)

async function load(before?: number) {
  loading.value = true
  const page = await $fetch<{ photos: Listed[], next: number | null }>('/api/photos', {
    query: { before, limit: 60, tag: tagFilter.value || undefined },
  })
  photos.value = before === undefined ? page.photos : [...photos.value, ...page.photos]
  next.value = page.next
  loading.value = false
}

onMounted(() => load())
watch(tagFilter, () => load())
</script>

<template>
  <section aria-label="Photos in this slideshow" class="flex flex-col gap-3">
    <p v-if="!loading && photos.length === 0" class="text-xl text-muted">No photos have this tag yet.</p>
    <ul class="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
      <li v-for="photo in photos" :key="photo.id">
        <NuxtLink to="/admin/photos" :title="photo.filename" class="block">
          <img
            :src="`/v/${photo.id}-640.webp`"
            :alt="photo.filename"
            loading="lazy"
            class="aspect-square w-full rounded bg-elevated object-contain"
            :class="{ 'opacity-40': photo.hidden }"
          >
        </NuxtLink>
      </li>
    </ul>
    <UButton v-if="next !== null" block variant="soft" :loading="loading" @click="load(next ?? undefined)">
      Load more
    </UButton>
  </section>
</template>
