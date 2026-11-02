<script setup lang="ts">
const props = defineProps<{ frame: Frame, tags: Tag[], presets: Preset[] }>()
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
const SORTS = [
  { label: 'Random', value: 'random' },
  { label: 'My order', value: 'manual' },
  { label: 'Date taken', value: 'taken_at' },
  { label: 'Date uploaded', value: 'uploaded_at' },
]

const expanded = ref(false)
const error = ref('')
const presetName = ref('')
const confirmingRevoke = ref(false)
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

async function reload() {
  await $fetch(`/api/devices/${props.frame.id}/reload`, { method: 'POST', headers: apiHeaders })
  status.value = 'Reload sent.'
}

async function revoke() {
  if (!confirmingRevoke.value) {
    confirmingRevoke.value = true
    return
  }
  await $fetch(`/api/devices/${props.frame.id}/revoke`, { method: 'POST', headers: apiHeaders })
  emit('removed', props.frame.id)
}

function rename(event: Event) {
  const name = (event.target as HTMLInputElement).value.trim()
  if (name && name !== props.frame.name) save({ name })
}

const sleepValue = (value: string) => value || null
</script>

<template>
  <li class="flex flex-col gap-4 rounded-lg bg-elevated p-4">
    <div class="flex items-center gap-3">
      <div class="size-24 shrink-0 rounded" :style="{ backgroundColor: frame.matte }">
        <img
          v-if="frame.current_photo_id"
          :src="`/v/${frame.current_photo_id}-640.webp`"
          alt=""
          class="size-full object-contain"
        >
      </div>
      <div class="min-w-0">
        <h2 class="text-3xl font-bold tracking-tight truncate">{{ frame.name }}</h2>
        <p class="text-muted">{{ lastSeen }}</p>
        <p v-if="frame.dormant" class="text-warning">Silent for 30+ days. Consider removing it.</p>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-xl font-bold">Showing</h3>
        <UFieldGroup v-if="frame.filter.tags.length > 1" size="xs">
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
          :variant="frame.filter.tags.length === 0 ? 'solid' : 'soft'"
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
          :variant="frame.filter.tags.includes(tag.id) ? 'solid' : 'soft'"
          :aria-pressed="frame.filter.tags.includes(tag.id)"
          @click="toggleTag(tag.id)"
        >
          {{ tag.name }}
        </UButton>
      </div>
    </div>

    <div class="flex flex-col gap-2">
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
        <UButton size="sm" variant="soft" color="error" @click="revoke">
          {{ confirmingRevoke ? 'Really remove this frame?' : 'Remove frame' }}
        </UButton>
      </div>
      <p v-if="status" role="status" class="text-sm">{{ status }}</p>
    </div>

    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
  </li>
</template>
