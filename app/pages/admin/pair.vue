<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

interface Pending {
  code: string
  ip: string | null
  screen_w: number | null
  screen_h: number | null
  dpr: number | null
  age_seconds: number
}

const route = useRoute()
const headers = { 'X-Requested-With': 'fetch' }
const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const name = ref('')
const pending = ref<Pending | null>(null)
const error = ref('')
const done = ref('')

const screenSize = computed(() => {
  const value = pending.value
  return value?.screen_w ? `${value.screen_w} × ${value.screen_h} at ${value.dpr}x` : 'Not reported'
})
const age = computed(() => {
  const seconds = pending.value?.age_seconds ?? 0
  return seconds < 60 ? `${seconds} seconds ago` : `${Math.floor(seconds / 60)} minutes ago`
})

function explain(e: unknown) {
  const status = (e as { statusCode?: number }).statusCode
  if (status === 429) return 'Too many attempts. Wait a minute.'
  return status === 404 ? 'That code was not found, or it has expired.' : 'Something went wrong. Try again.'
}

async function lookup() {
  error.value = ''
  done.value = ''
  pending.value = null
  try {
    pending.value = await $fetch<Pending>('/api/pair/lookup', { query: { code: code.value } })
  }
  catch (e) {
    error.value = explain(e)
  }
}

async function approve() {
  error.value = ''
  try {
    await $fetch('/api/pair/approve', {
      method: 'POST',
      headers,
      body: { code: pending.value?.code, name: name.value },
    })
    done.value = `${name.value} is paired. It will start showing photos in a few seconds.`
    pending.value = null
    code.value = ''
    name.value = ''
  }
  catch (e) {
    error.value = explain(e)
  }
}
</script>

<template>
  <main class="mx-auto max-w-sm p-4 flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-lg font-medium">Pair a frame</h1>
      <UButton to="/admin" variant="ghost" color="neutral">Back</UButton>
    </header>

    <form class="flex flex-col gap-3" @submit.prevent="lookup">
      <UFormField label="Code on the frame">
        <UInput
          v-model="code"
          name="code"
          required
          autocomplete="off"
          autocapitalize="characters"
          placeholder="ABC-234"
          class="w-full font-mono"
        />
      </UFormField>
      <UButton type="submit" block variant="soft">Find frame</UButton>
    </form>

    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    <p v-if="done" role="status" class="text-sm">{{ done }}</p>

    <form v-if="pending" class="flex flex-col gap-3" @submit.prevent="approve">
      <dl class="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt class="text-muted">Screen</dt>
        <dd>{{ screenSize }}</dd>
        <dt class="text-muted">IP address</dt>
        <dd>{{ pending.ip }}</dd>
        <dt class="text-muted">Requested</dt>
        <dd>{{ age }}</dd>
      </dl>
      <p class="text-sm text-muted">If you didn't start this, don't approve it.</p>
      <UFormField label="Frame name">
        <UInput v-model="name" name="name" required maxlength="60" placeholder="Kitchen" class="w-full" />
      </UFormField>
      <UButton type="submit" block>Approve</UButton>
    </form>
  </main>
</template>
