<script setup lang="ts">
const props = defineProps<{ frame: Frame, tags: Tag[], presets: Preset[], playlists: Playlist[] }>()
const emit = defineEmits<{ updated: [frame: Frame], removed: [id: string], presetsChanged: [] }>()

const MATTES = [
  { name: 'Black', value: '#000000' },
  { name: 'Charcoal', value: '#2b2b2b' },
  { name: 'Mid grey', value: '#808080' },
  { name: 'Warm white', value: '#f5efe6' },
  { name: 'White', value: '#ffffff' },
]
const INTERVALS = [
  { label: '10 seconds', value: 10 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '30 minutes', value: 1800 },
]

const DAYS = [
  { short: 'S', name: 'Sunday' },
  { short: 'M', name: 'Monday' },
  { short: 'T', name: 'Tuesday' },
  { short: 'W', name: 'Wednesday' },
  { short: 'T', name: 'Thursday' },
  { short: 'F', name: 'Friday' },
  { short: 'S', name: 'Saturday' },
]

const expanded = ref(false)
// The frame reports this id, so it's checked before it becomes part of an address the admin's browser loads.
const showingNow = computed(() => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(props.frame.current_photo_id ?? '') ? props.frame.current_photo_id : null)
// Picking "Playlist" before any playlist exists shows how to make one, without changing the frame.
const wantsPlaylist = ref(false)
const showsPlaylist = computed(() => Boolean(props.frame.playlist_id) || wantsPlaylist.value)
const playlistChoices = computed(() => props.playlists.map(playlist => ({
  label: `${playlist.name} (${playlist.photos} ${playlist.photos === 1 ? 'photo' : 'photos'})`,
  value: playlist.id,
})))
const SORTS = computed(() => [
  { label: 'Random', value: 'random' },
  { label: props.frame.playlist_id ? 'Playlist order' : 'My order', value: 'manual' },
  { label: 'Date taken', value: 'taken_at' },
  { label: 'Date uploaded', value: 'uploaded_at' },
])

function showTags() {
  wantsPlaylist.value = false
  if (props.frame.playlist_id) save({ playlist_id: null })
}
function showPlaylist() {
  const first = props.playlists[0]
  if (props.frame.playlist_id) return
  if (first) save({ playlist_id: first.id })
  else wantsPlaylist.value = true
}
const error = ref('')
const presetName = ref('')
const confirmingDeactivate = ref(false)
const deactivating = ref(false)
const status = ref('')

const lastSeen = computed(() => {
  if (props.frame.online) return 'Online now'
  const seen = props.frame.last_seen_at
  return seen ? `Last seen ${new Date(`${seen.replace(' ', 'T')}Z`).toLocaleString()}` : 'Not seen yet'
})
const activePreset = computed(() => props.presets.find(preset =>
  preset.filter.mode === props.frame.filter.mode
  && preset.filter.tags.length === props.frame.filter.tags.length
  && preset.filter.tags.every(tag => props.frame.filter.tags.includes(tag)),
)?.id)

async function save(changes: Partial<Frame>) {
  error.value = ''
  try {
    const { device } = await $fetch<{ device: Frame }>(`/api/devices/${props.frame.id}`, {
      method: 'PATCH',
      headers: apiHeaders,
      body: changes,
    })
    emit('updated', device)
  }
  catch {
    error.value = 'That change could not be saved.'
  }
}

function toggleTag(id: string) {
  const { tags, mode } = props.frame.filter
  const next = tags.includes(id) ? tags.filter(tag => tag !== id) : [...tags, id]
  save({ filter: { tags: next, mode } })
}

async function savePreset() {
  if (!presetName.value.trim()) return
  await $fetch('/api/presets', {
    method: 'POST',
    headers: apiHeaders,
    body: { name: presetName.value, filter: props.frame.filter },
  })
  presetName.value = ''
  emit('presetsChanged')
}

async function deletePreset(id: string) {
  await $fetch(`/api/presets/${id}`, { method: 'DELETE', headers: apiHeaders })
  emit('presetsChanged')
}

async function control(action: string) {
  error.value = ''
  try {
    await $fetch(`/api/devices/${props.frame.id}/control`, { method: 'POST', headers: apiHeaders, body: { action } })
  }
  catch {
    error.value = 'That frame is offline, so it can\'t be controlled right now.'
  }
}

async function reload() {
  await $fetch(`/api/devices/${props.frame.id}/reload`, { method: 'POST', headers: apiHeaders })
  status.value = 'Reload sent.'
}

// The frame goes back to its pairing screen on its next request, so using it again means pairing it again.
async function deactivate() {
  deactivating.value = true
  try {
    await $fetch(`/api/devices/${props.frame.id}/revoke`, { method: 'POST', headers: apiHeaders })
    confirmingDeactivate.value = false
    emit('removed', props.frame.id)
  }
  catch {
    error.value = 'Couldn\'t deactivate the frame. Try again.'
    confirmingDeactivate.value = false
  }
  finally {
    deactivating.value = false
  }
}

function rename(event: Event) {
  const name = (event.target as HTMLInputElement).value.trim()
  if (name && name !== props.frame.name) save({ name })
}

const sleepValue = (value: string) => value || null
const presetChoices = computed(() => [
  { label: 'Off', value: 'off' },
  ...props.presets.map(preset => ({ label: preset.name, value: preset.id })),
])

function toggleDay(day: number) {
  const days = props.frame.schedule_days
  save({ schedule_days: days.includes(day) ? days.filter(item => item !== day) : [...days, day] })
}
</script>

<template>
  <li class="flex min-w-0 flex-col gap-4 rounded-lg bg-elevated p-4">
    <div class="flex items-center gap-3">
      <div class="size-24 shrink-0 rounded" :style="{ backgroundColor: frame.matte }">
        <img
          v-if="showingNow"
          :src="`/v/${showingNow}-640.webp`"
          alt=""
          class="size-full object-contain"
        >
      </div>
      <div class="min-w-0">
        <h2 class="text-3xl font-bold tracking-tight truncate">{{ frame.name }}</h2>
        <p class="text-muted">{{ lastSeen }}</p>
        <p v-if="frame.dormant" class="text-warning">Silent for 30+ days. Consider deactivating it.</p>
      </div>
    </div>

    <div v-if="frame.online" class="grid grid-cols-4 gap-2" role="group" aria-label="Remote control">
      <UButton variant="soft" color="neutral" icon="i-lucide-skip-back" aria-label="Previous photo" class="justify-center" @click="control('previous')" />
      <UButton variant="soft" color="neutral" icon="i-lucide-pause" aria-label="Pause" class="justify-center" @click="control('pause')" />
      <UButton variant="soft" color="neutral" icon="i-lucide-play" aria-label="Resume" class="justify-center" @click="control('resume')" />
      <UButton variant="soft" color="neutral" icon="i-lucide-skip-forward" aria-label="Next photo" class="justify-center" @click="control('next')" />
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-xl font-bold">What it shows</h3>
        <UFieldGroup size="sm" aria-label="What this frame shows">
          <UButton :variant="showsPlaylist ? 'soft' : 'solid'" color="neutral" :aria-pressed="!showsPlaylist" @click="showTags">
            By tag
          </UButton>
          <UButton :variant="showsPlaylist ? 'solid' : 'soft'" color="neutral" :aria-pressed="showsPlaylist" @click="showPlaylist">
            Playlist
          </UButton>
        </UFieldGroup>
      </div>

      <template v-if="showsPlaylist">
        <USelect
          v-if="playlists.length"
          :model-value="frame.playlist_id ?? undefined"
          :items="playlistChoices"
          placeholder="Choose a playlist"
          size="lg"
          class="w-full"
          aria-label="Playlist"
          @update:model-value="save({ playlist_id: String($event) })"
        />
        <p v-else class="text-muted">
          No playlists yet. Select photos on the
          <NuxtLink to="/admin" class="text-primary underline underline-offset-2">Photos</NuxtLink>
          page and choose Add to playlist, or start one on
          <NuxtLink to="/admin/playlists" class="text-primary underline underline-offset-2">Playlists</NuxtLink>.
        </p>
        <p v-if="frame.playlist_id && frame.schedule_preset_id" class="text-sm text-muted">
          At its scheduled times, this frame shows its scheduled preset instead.
        </p>
      </template>

      <template v-else>
        <div v-if="frame.filter.tags.length > 1" class="flex justify-end">
          <UFieldGroup size="xs">
            <UButton
              :variant="frame.filter.mode === 'any' ? 'solid' : 'soft'"
              color="neutral"
              :aria-pressed="frame.filter.mode === 'any'"
              @click="save({ filter: { ...frame.filter, mode: 'any' } })"
            >
              Any tag
            </UButton>
            <UButton
              :variant="frame.filter.mode === 'all' ? 'solid' : 'soft'"
              color="neutral"
              :aria-pressed="frame.filter.mode === 'all'"
              @click="save({ filter: { ...frame.filter, mode: 'all' } })"
            >
              All tags
            </UButton>
          </UFieldGroup>
        </div>

        <div v-if="presets.length" class="flex flex-wrap gap-2">
          <UButton
            v-for="preset in presets"
            :key="preset.id"
            size="sm"
            :variant="activePreset === preset.id ? 'solid' : 'outline'"
            :aria-pressed="activePreset === preset.id"
            @click="save({ filter: preset.filter })"
          >
            {{ preset.name }}
          </UButton>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="neutral"
            :variant="frame.filter.tags.length === 0 ? 'solid' : 'outline'"
            :aria-pressed="frame.filter.tags.length === 0"
            @click="save({ filter: { tags: [], mode: frame.filter.mode } })"
          >
            Everything
          </UButton>
          <UButton
            v-for="tag in tags"
            :key="tag.id"
            size="sm"
            color="neutral"
            :variant="frame.filter.tags.includes(tag.id) ? 'solid' : 'outline'"
            :aria-pressed="frame.filter.tags.includes(tag.id)"
            @click="toggleTag(tag.id)"
          >
            {{ tag.name }}
          </UButton>
        </div>
      </template>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-xl font-bold">Matte</h3>
      <p class="-mt-1 text-sm text-muted">The colour around each photo, on screens whose shape doesn't match it.</p>
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Matte color">
        <button
          v-for="matte in MATTES"
          :key="matte.value"
          type="button"
          class="size-11 rounded-full border-2"
          :class="frame.matte === matte.value ? 'border-primary' : 'border-default'"
          :style="{ backgroundColor: matte.value }"
          :aria-label="matte.name"
          :aria-pressed="frame.matte === matte.value"
          @click="save({ matte: matte.value })"
        />
        <label class="flex items-center gap-1 text-sm">
          Other
          <input
            type="color"
            :name="`matte-${frame.id}`"
            :value="frame.matte"
            class="size-11"
            @change="save({ matte: ($event.target as HTMLInputElement).value })"
          >
        </label>
      </div>
      <UCheckbox
        :model-value="frame.backdrop === 'blur'"
        :name="`blur-${frame.id}`"
        label="Fill the bars with a blurred copy of the photo"
        @update:model-value="save({ backdrop: $event === true ? 'blur' : 'solid' })"
      />
      <UCheckbox
        :model-value="frame.match_shape"
        :name="`shape-${frame.id}`"
        label="Skip photos that don't suit this screen's shape"
        @update:model-value="save({ match_shape: $event === true })"
      />
      <UCheckbox
        :model-value="frame.memories_first"
        :name="`memories-${frame.id}`"
        label="Show photos from this date in past years first"
        @update:model-value="save({ memories_first: $event === true })"
      />
      <UCheckbox
        :model-value="frame.show_captions"
        :name="`captions-${frame.id}`"
        label="Show captions"
        @update:model-value="save({ show_captions: $event === true })"
      />
    </div>

    <UButton size="sm" variant="ghost" color="neutral" class="self-start" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? 'Fewer settings' : 'More settings' }}
    </UButton>

    <div v-if="expanded" class="flex flex-col gap-3">
      <UFormField label="Name">
        <UInput :model-value="frame.name" :name="`name-${frame.id}`" maxlength="60" class="w-full" @change="rename" />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Change photo every">
          <USelect
            :model-value="frame.interval_sec"
            :items="INTERVALS"
            class="w-full"
            @update:model-value="save({ interval_sec: Number($event) })"
          />
        </UFormField>
        <UFormField label="Order">
          <USelect
            :model-value="frame.sort"
            :items="SORTS"
            class="w-full"
            @update:model-value="save({ sort: String($event) })"
          />
        </UFormField>
        <UFormField label="Sleep from" help="Frame's local time">
          <UInput
            type="time"
            :model-value="frame.sleep_start ?? ''"
            :name="`sleep-start-${frame.id}`"
            class="w-full"
            @change="save({ sleep_start: sleepValue(($event.target as HTMLInputElement).value) })"
          />
        </UFormField>
        <UFormField label="Wake at">
          <UInput
            type="time"
            :model-value="frame.sleep_end ?? ''"
            :name="`sleep-end-${frame.id}`"
            class="w-full"
            @change="save({ sleep_end: sleepValue(($event.target as HTMLInputElement).value) })"
          />
        </UFormField>
      </div>

      <div class="flex flex-col gap-2">
        <h3 class="text-xl font-bold">Schedule</h3>
        <p v-if="!presets.length" class="text-sm text-muted">Save a preset below, then choose when this frame shows it.</p>
        <template v-else>
          <UFormField label="Switch to this preset">
            <USelect
              :model-value="frame.schedule_preset_id ?? 'off'"
              :items="presetChoices"
              class="w-full"
              @update:model-value="save({ schedule_preset_id: $event === 'off' ? null : String($event) })"
            />
          </UFormField>
          <template v-if="frame.schedule_preset_id">
            <div class="flex flex-wrap gap-1" role="group" aria-label="Days">
              <UButton
                v-for="(day, index) in DAYS"
                :key="day.name"
                size="sm"
                color="neutral"
                :variant="frame.schedule_days.includes(index) ? 'solid' : 'soft'"
                :aria-label="day.name"
                :aria-pressed="frame.schedule_days.includes(index)"
                class="size-9 justify-center"
                @click="toggleDay(index)"
              >
                {{ day.short }}
              </UButton>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="From" help="Frame's local time">
                <UInput
                  type="time"
                  :model-value="frame.schedule_start ?? ''"
                  :name="`schedule-start-${frame.id}`"
                  class="w-full"
                  @change="save({ schedule_start: sleepValue(($event.target as HTMLInputElement).value) })"
                />
              </UFormField>
              <UFormField label="Until">
                <UInput
                  type="time"
                  :model-value="frame.schedule_end ?? ''"
                  :name="`schedule-end-${frame.id}`"
                  class="w-full"
                  @change="save({ schedule_end: sleepValue(($event.target as HTMLInputElement).value) })"
                />
              </UFormField>
            </div>
            <p class="text-sm text-muted">With no days picked, it runs every day. With no times, it runs all day.</p>
          </template>
        </template>
      </div>

      <form class="flex items-end gap-2" @submit.prevent="savePreset">
        <UFormField label="Save this selection as a preset" class="grow">
          <UInput v-model="presetName" :name="`preset-${frame.id}`" maxlength="60" placeholder="Holidays" class="w-full" />
        </UFormField>
        <UButton type="submit" variant="soft">Save</UButton>
      </form>
      <div v-if="presets.length" class="flex flex-wrap gap-2">
        <UButton
          v-for="preset in presets"
          :key="preset.id"
          size="xs"
          variant="ghost"
          color="error"
          @click="deletePreset(preset.id)"
        >
          Delete preset {{ preset.name }}
        </UButton>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton size="sm" variant="soft" color="neutral" @click="reload">Reload frame</UButton>
      </div>
      <p v-if="status" role="status" class="text-sm">{{ status }}</p>
    </div>

    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>

    <UButton
      size="xl"
      color="error"
      icon="i-lucide-power"
      class="w-full justify-center sm:w-auto sm:self-start"
      @click="confirmingDeactivate = true"
    >
      Deactivate {{ frame.name }}
    </UButton>

    <UModal
      v-model:open="confirmingDeactivate"
      :title="`Deactivate ${frame.name}?`"
      :dismissible="!deactivating"
    >
      <template #body>
        <div class="flex flex-col gap-3 text-lg">
          <p>Are you sure? It stops showing photos right away and goes back to its pairing screen.</p>
          <p class="font-bold">Once deactivated, you'll need to pair it again to use it.</p>
          <p class="text-base text-muted">Your photos, tags, and playlists aren't affected.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton size="lg" color="neutral" variant="soft" class="justify-center" autofocus :disabled="deactivating" @click="confirmingDeactivate = false">
            Keep it
          </UButton>
          <UButton size="lg" color="error" icon="i-lucide-power" class="justify-center" :loading="deactivating" @click="deactivate">
            Deactivate
          </UButton>
        </div>
      </template>
    </UModal>
  </li>
</template>
