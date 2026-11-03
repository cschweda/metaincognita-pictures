<script setup lang="ts">
// Deleting more than one photo: shows which ones, waits, and needs the count typed by hand and the
// password. One photo keeps its single confirmation; everything at once is Start over. With `demo`,
// it removes the demo photos instead, through their own route, with the same checks.
const props = defineProps<{ ids: string[], demo?: boolean, count?: number }>()
// The demo's count comes from the server, since its photos may not all be loaded in the grid.
const total = computed(() => props.count ?? props.ids.length)
const emit = defineEmits<{ deleted: [count: number] }>()
const noun = computed(() => props.demo ? 'demo photos' : 'photos')
const open = defineModel<boolean>('open', { default: false })

const WAIT_SECONDS = 5
const phrase = computed(() => `delete ${total.value} ${noun.value}`)
const typed = ref('')
const password = ref('')
const countdown = ref(WAIT_SECONDS)
const pasteRefused = ref(false)
const working = ref(false)
const error = ref('')
let timer: ReturnType<typeof setInterval> | undefined

watch(open, (isOpen) => {
  clearInterval(timer)
  typed.value = ''
  password.value = ''
  error.value = ''
  pasteRefused.value = false
  if (!isOpen) return
  countdown.value = WAIT_SECONDS
  timer = setInterval(() => {
    countdown.value = Math.max(0, countdown.value - 1)
    if (countdown.value === 0) clearInterval(timer)
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))

function refuse(event: Event) {
  event.preventDefault()
  pasteRefused.value = true
}
function onBeforeInput(event: InputEvent) {
  if (/^insertFrom(Paste|Drop|Yank)|^insertReplacementText/.test(event.inputType)) refuse(event)
}

const ready = computed(() => countdown.value === 0 && typed.value === phrase.value && password.value.length > 0 && !working.value)

async function confirm() {
  if (!ready.value) return
  working.value = true
  error.value = ''
  try {
    const result = props.demo
      ? await $fetch<{ removed: number }>('/api/demo/remove', { method: 'POST', headers: apiHeaders, body: { phrase: typed.value, password: password.value } })
      : await $fetch<{ deleted: number }>('/api/photos/delete', { method: 'POST', headers: apiHeaders, body: { photo_ids: props.ids, phrase: typed.value, password: password.value } })
    open.value = false
    emit('deleted', 'removed' in result ? result.removed : result.deleted)
  }
  catch (failure) {
    error.value = (failure as { statusMessage?: string }).statusMessage ?? 'Nothing was deleted.'
    password.value = ''
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="`Delete ${total} ${noun}?`" :dismissible="!working" description="This can't be undone">
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="confirm">
        <ul class="grid grid-cols-6 gap-1" aria-label="Photos that will be deleted">
          <li v-for="id in ids.slice(0, 18)" :key="id">
            <img :src="`/v/${id}-640.webp`" alt="" class="aspect-square w-full rounded object-cover">
          </li>
        </ul>
        <p v-if="total > ids.slice(0, 18).length" class="-mt-2 text-sm text-muted">and {{ total - ids.slice(0, 18).length }} more</p>
        <p class="text-lg">
          <template v-if="demo">These <strong>{{ total }} demo photos</strong>, and the demo's playlists, preset, and unused tags, will be deleted. Your own photos stay.</template>
          <template v-else>These <strong>{{ ids.length }} photos</strong> will be deleted from the server, originals and all. They come out of every playlist, and off every frame. There's no undo.</template>
        </p>
        <p>To confirm, type <strong class="select-none font-mono" @copy.prevent>{{ phrase }}</strong> by hand. Pasting is turned off.</p>
        <UFormField label="Type the words above">
          <UInput
            v-model="typed"
            name="bulk-delete-phrase"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            :spellcheck="false"
            class="w-full font-mono"
            @paste="refuse"
            @drop="refuse"
            @beforeinput="onBeforeInput"
          />
        </UFormField>
        <p v-if="pasteRefused && typed !== phrase" role="alert" class="-mt-2 text-sm text-error">Pasting doesn't work here. Type it.</p>
        <UFormField label="Your admin password">
          <UInput v-model="password" type="password" name="bulk-delete-password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton size="lg" color="neutral" variant="soft" class="justify-center" autofocus :disabled="working" @click="open = false">Keep them</UButton>
          <UButton type="submit" size="lg" color="error" icon="i-lucide-trash-2" class="justify-center" :disabled="!ready" :loading="working">
            {{ countdown > 0 ? `Delete ${total} ${noun} (${countdown})` : `Delete ${total} ${noun}` }}
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
