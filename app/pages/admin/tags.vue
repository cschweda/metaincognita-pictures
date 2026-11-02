<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const { tags, loadTags } = useTags()
const error = ref('')
const confirming = ref<string | null>(null)

onMounted(loadTags)

async function rename(tag: Tag, event: Event) {
  const input = event.target as HTMLInputElement
  const name = input.value.trim()
  if (!name || name === tag.name) {
    input.value = tag.name
    return
  }

  error.value = ''
  try {
    await $fetch(`/api/tags/${tag.id}`, { method: 'PATCH', headers: apiHeaders, body: { name } })
    await loadTags()
  }
  catch (e) {
    input.value = tag.name
    error.value = (e as { statusCode?: number }).statusCode === 409
      ? `There is already a tag called ${name}.`
      : 'Tag names are 1 to 40 characters, with no commas.'
  }
}

async function remove(tag: Tag) {
  if (confirming.value !== tag.id) {
    confirming.value = tag.id
    return
  }
  await $fetch(`/api/tags/${tag.id}`, { method: 'DELETE', headers: apiHeaders })
  confirming.value = null
  await loadTags()
}
</script>

<template>
  <AdminShell title="Tags">
    <p class="text-muted max-w-2xl">
      Renaming a tag keeps it on its photos and frames. Deleting a tag removes it from them, but keeps the photos.
    </p>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>
    <p v-if="tags.length === 0" class="text-xl text-muted">No tags yet. Add some when you upload photos.</p>

    <ul class="flex flex-col gap-2 max-w-2xl">
      <li v-for="tag in tags" :key="tag.id" class="grid grid-cols-[1fr_6.5rem_auto] items-center gap-3">
        <UInput
          :model-value="tag.name"
          :name="`tag-${tag.id}`"
          :aria-label="`Rename ${tag.name}`"
          maxlength="40"
          class="w-full"
          @change="rename(tag, $event)"
        />
        <NuxtLink :to="{ path: '/admin', query: { tag: tag.id } }" class="text-muted hover:text-default tabular-nums">
          {{ tag.photos ?? 0 }} {{ tag.photos === 1 ? 'photo' : 'photos' }}
        </NuxtLink>
        <UButton size="sm" variant="ghost" color="error" @click="remove(tag)">
          {{ confirming === tag.id ? 'Really delete?' : 'Delete' }}
        </UButton>
      </li>
    </ul>
  </AdminShell>
</template>
