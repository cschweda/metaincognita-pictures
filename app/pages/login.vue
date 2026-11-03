<script setup lang="ts">
const password = ref('')
const showPassword = ref(false)
// With two-factor login on, the right password leads to a second step for the app's code.
const step = ref<'password' | 'code'>('password')
const code = ref('')
const recovery = ref(false)
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

function startAgain() {
  step.value = 'password'
  code.value = ''
  recovery.value = false
  error.value = ''
}
function toggleRecovery() {
  recovery.value = !recovery.value
  code.value = ''
  error.value = ''
  nextTick(() => document.getElementById('code')?.focus())
}

async function login() {
  if (lockedSeconds.value > 0) return
  error.value = ''
  submitting.value = true
  try {
    if (step.value === 'code') {
      await $fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch' },
        body: { code: code.value },
      })
      return await navigateTo('/admin')
    }
    const result = await $fetch<{ ok?: boolean, code_needed?: boolean }>('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Requested-With': 'fetch' },
      body: { password: password.value },
    })
    if (result.code_needed) {
      step.value = 'code'
      password.value = ''
      await nextTick()
      document.getElementById('code')?.focus()
      return
    }
    await navigateTo('/admin')
  }
  catch (e) {
    const failure = e as { statusCode?: number, statusMessage?: string, response?: Response, data?: { data?: { restart?: boolean } } }
    if (failure.data?.data?.restart) {
      step.value = 'password'
      code.value = ''
      error.value = failure.statusMessage ?? 'Enter your password again.'
    }
    else if (failure.statusCode === 429) {
      const retry = Number(failure.response?.headers.get('retry-after'))
      startLockout(Number.isFinite(retry) && retry > 0 ? retry : 300)
      error.value = failure.statusMessage ?? 'Too many wrong passwords. Try again in 5 minutes.'
    }
    else {
      error.value = failure.statusMessage ?? 'That is not correct.'
    }
    password.value = ''
    code.value = ''
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
      <template v-if="step === 'password'">
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
      </template>
      <template v-else>
        <p class="-mt-1 text-muted">
          {{ recovery ? 'Enter one of your recovery codes. Each one works once.' : 'Enter the 6-digit code from your authenticator app.' }}
        </p>
        <UFormField :label="recovery ? 'Recovery code' : 'Code'" :error="error || undefined">
          <UInput
            id="code"
            v-model="code"
            :inputmode="recovery ? 'text' : 'numeric'"
            :autocomplete="recovery ? 'off' : 'one-time-code'"
            :maxlength="recovery ? 11 : 6"
            :pattern="recovery ? undefined : '[0-9]{6}'"
            :placeholder="recovery ? 'XXXXX-XXXXX' : '123456'"
            autocapitalize="characters"
            :spellcheck="false"
            required
            class="w-full font-mono tracking-widest"
          />
        </UFormField>
      </template>
      <UButton type="submit" block :loading="submitting" :disabled="lockedSeconds > 0">
        {{ lockedSeconds > 0 ? `Locked, try again in ${lockedLabel}` : step === 'code' ? 'Continue' : 'Log in' }}
      </UButton>
      <div v-if="step === 'code'" class="flex flex-wrap justify-between gap-2 text-sm">
        <UButton variant="link" color="neutral" size="sm" class="px-0" @click="toggleRecovery">
          {{ recovery ? 'Use the code from the app' : 'Use a recovery code' }}
        </UButton>
        <UButton variant="link" color="neutral" size="sm" class="px-0" @click="startAgain">Start again</UButton>
      </div>
    </form>
  </main>
</template>
