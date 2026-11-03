<script setup lang="ts">
// Hand-picked sets of photos, in their own order, that frames can show.
definePageMeta({ middleware: 'admin' })

const playlists = ref<Playlist[]>([])
const loading = ref(true)
const name = ref('')
const error = ref('')

async function load() {
  playlists.value = (await $fetch<{ playlists: Playlist[] }>('/api/playlists')).playlists
  loading.value = false
}
onMounted(load)

async function create() {
  error.value = ''
  try {
    const { playlist } = await $fetch<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      headers: apiHeaders,
      body: { name: name.value },
    })
    name.value = ''
    await navigateTo(`/admin/playlists/${playlist.id}`)
  }
  catch (failure) {
    error.value = (failure as { statusMessage?: string }).statusMessage ?? 'Couldn\'t create the playlist.'
  }
}
</script>

<template>
  <AdminShell title="Playlists">
    <p class="text-lg text-muted max-w-2xl">
      A playlist is a set of photos you pick, in an order you choose. To show one on a frame, open the frame on
      <NuxtLink to="/admin/frames" class="text-primary underline underline-offset-2">Frames</NuxtLink>
      and choose Playlist. To fill one, select photos on
      <NuxtLink to="/admin" class="text-primary underline underline-offset-2">Photos</NuxtLink>
      and choose Add to playlist.
    </p>

    <form class="flex max-w-xl items-end gap-2" @submit.prevent="create">
      <UFormField label="New playlist" class="grow">
        <UInput v-model="name" name="playlist-name" maxlength="60" placeholder="Living room" size="lg" class="w-full" />
      </UFormField>
      <UButton type="submit" size="lg" :disabled="!name.trim()">Create</UButton>
    </form>
    <p v-if="error" role="alert" class="text-error">{{ error }}</p>

    <p v-if="!loading && playlists.length === 0" class="text-xl text-muted">No playlists yet.</p>

    <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="playlist in playlists" :key="playlist.id">
        <NuxtLink
          :to="`/admin/playlists/${playlist.id}`"
          class="flex items-center gap-4 rounded-lg bg-elevated p-3 hover:bg-accented"
        >
          <span class="size-20 shrink-0 overflow-hidden rounded bg-default">
            <img v-if="playlist.cover" :src="`/v/${playlist.cover}-640.webp`" alt="" class="size-full object-cover">
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-2xl font-bold tracking-tight">{{ playlist.name }}</span>
            <span class="text-muted">{{ playlist.photos }} {{ playlist.photos === 1 ? 'photo' : 'photos' }}</span>
            <span class="truncate text-sm text-muted">
              {{ playlist.frames.length ? `On ${playlist.frames.join(', ')}` : 'Not on a frame' }}
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </AdminShell>
</template>
