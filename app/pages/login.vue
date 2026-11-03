<script setup lang="ts">
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const submitting = ref(false)
// While locked out, the button counts down instead of letting more guesses through.
const lockedUntil = ref(0)
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

const lockedSeconds = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)))
const lockedLabel = computed(() => {
  const s = lockedSeconds.value
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`
})

function startLockout(seconds: number) {
  lockedUntil.value = Date.now() + seconds * 1000
  now.value = Date.now()
  clearInterval(ticker)
  ticker = setInterval(() => {
    now.value = Date.now()
    if (lockedSeconds.value === 0) {
      clearInterval(ticker)
      error.value = ''
    }
  }, 1000)
}
onBeforeUnmount(() => clearInterval(ticker))

async function login() {
  if (lockedSeconds.value > 0) return
  error.value = ''
  submitting.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Requested-With': 'fetch' },
      body: { password: password.value },
    })
    await navigateTo('/admin')
  }
  catch (e) {
    const failure = e as { statusCode?: number, statusMessage?: string, response?: Response }
    if (failure.statusCode === 429) {
      const retry = Number(failure.response?.headers.get('retry-after'))
      startLockout(Number.isFinite(retry) && retry > 0 ? retry : 300)
      error.value = failure.statusMessage ?? 'Too many wrong passwords. Try again in 5 minutes.'
    }
    else {
      error.value = failure.statusMessage ?? 'That password is not correct.'
    }
    password.value = ''
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh flex items-center justify-center p-4">
    <form class="w-full max-w-xs flex flex-col gap-3" @submit.prevent="login">
      <h1 class="text-5xl font-extrabold tracking-tight">OpenMantel</h1>
      <p class="-mt-1 text-muted">Sign in to manage your photos and frames.</p>
      <!-- There is one admin and no username, but password managers need a field to file the password under. -->
      <input type="text" name="username" autocomplete="username" value="admin" class="sr-only" tabindex="-1" aria-hidden="true" readonly>
      <UFormField label="Password" :error="error || undefined">
        <UInput
          id="password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          required
          autofocus
          class="w-full"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              aria-controls="password"
              @click="showPassword = !showPassword"
            />
          </template>
        </UInput>
      </UFormField>
      <UButton type="submit" block :loading="submitting" :disabled="lockedSeconds > 0">
        {{ lockedSeconds > 0 ? `Locked, try again in ${lockedLabel}` : 'Log in' }}
      </UButton>
    </form>
  </main>
</template>
