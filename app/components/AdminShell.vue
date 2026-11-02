<script setup lang="ts">
// Navigation for every admin page. Pages with `hero` lead with Start slideshow.
const props = defineProps<{ hero?: boolean, title?: string }>()
const route = useRoute()

const LINKS = [
  { label: 'Photos', to: '/admin' },
  { label: 'Frames', to: '/admin/frames' },
  { label: 'Tags', to: '/admin/tags' },
  { label: 'Stats', to: '/admin/stats' },
  { label: 'Pair a frame', to: '/admin/pair' },
  { label: 'Sessions', to: '/admin/sessions' },
]

const heroPhotos = ref<string[]>([])
const count = ref<number | null>(null)

const tagFilter = useTagFilter()
const { tags, loadTags } = useTags()

const tagName = computed(() => tagFilter.value === 'memories'
  ? 'On this day'
  : tags.value.find(tag => tag.id === tagFilter.value)?.name)
const tagItems = computed(() => [
  { label: 'No tag: all photos, random order', value: 'all' },
  { label: 'On this day', value: 'memories' },
  ...tags.value.map(tag => ({ label: `${tag.name} (${tag.photos ?? 0})`, value: tag.id })),
])

async function loadHero() {
  const { photos } = await $fetch<{ photos: { id: string, hidden: number }[] }>('/api/photos', {
    query: { limit: 200, tag: tagFilter.value || undefined },
  })
  const visible = photos.filter(photo => !photo.hidden)
  heroPhotos.value = visible.slice(0, 8).map(photo => photo.id)
  count.value = tagFilter.value ? visible.length : (await $fetch<{ showing: number }>('/api/stats')).showing
}

onMounted(() => {
  if (!props.hero) return
  loadTags()
  loadHero()
})
watch([tagFilter, tags], () => {
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
        <button type="button" class="rounded px-3 py-2 font-medium text-muted hover:text-default" @click="logout">
          Log out
        </button>
      </nav>
    </header>

    <section v-if="hero" aria-label="Slideshow" class="flex flex-col gap-2">
      <StartSlideshow :photos="heroPhotos" :count="count" :tag-name="tagName" />
      <UFormField label="Show photos tagged" class="max-w-xl">
        <USelect
          :model-value="tagFilter || 'all'"
          :items="tagItems"
          size="lg"
          class="w-full"
          @update:model-value="tagFilter = $event === 'all' ? '' : String($event)"
        />
      </UFormField>
    </section>

    <main class="flex flex-col gap-5">
      <h1 v-if="title" class="text-4xl sm:text-5xl font-extrabold tracking-tight">{{ title }}</h1>
      <slot />
    </main>
  </div>
</template>
