<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

interface LoginSession {
  ref: string
  created_at: string
  last_seen_at: string
  user_agent: string | null
  ip: string | null
  current: boolean
}

const sessions = ref<LoginSession[]>([])
const forgotten = ref('')

// Break glass: one typed confirmation and the password, then everything is signed out.
const BREAK_GLASS_PHRASE = 'sign out everything'
const breaking = ref(false)
const breakTyped = ref('')
const breakPassword = ref('')
const breakError = ref('')
const breakWorking = ref(false)
const breakPasteRefused = ref(false)
function refusePaste(event: Event) {
  event.preventDefault()
  breakPasteRefused.value = true
}
function onBreakBeforeInput(event: InputEvent) {
  if (/^insertFrom(Paste|Drop|Yank)|^insertReplacementText/.test(event.inputType)) refusePaste(event)
}
watch(breaking, (open) => {
  breakTyped.value = ''
  breakPassword.value = ''
  breakError.value = ''
  breakPasteRefused.value = false
  void open
})
async function signOutEverything() {
  breakWorking.value = true
  breakError.value = ''
  try {
    await $fetch('/api/sessions/sign-out-everything', {
      method: 'POST',
      headers: { 'X-Requested-With': 'fetch' },
      body: { phrase: breakTyped.value, password: breakPassword.value },
    })
    await navigateTo('/login')
  }
  catch (failure) {
    breakError.value = (failure as { statusMessage?: string }).statusMessage ?? 'Nothing was signed out.'
    breakPassword.value = ''
  }
  finally {
    breakWorking.value = false
  }
}

async function forgetBrowsers() {
  const result = await $fetch<{ forgotten: number }>('/api/sessions/forget-browsers', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } })
  forgotten.value = `Forgot ${result.forgotten} ${result.forgotten === 1 ? 'browser' : 'browsers'}.`
}

async function load() {
  sessions.value = (await $fetch<{ sessions: LoginSession[] }>('/api/sessions')).sessions
}
onMounted(load)

async function revoke(session: LoginSession) {
  await $fetch(`/api/sessions/${session.ref}`, { method: 'DELETE', headers: { 'X-Requested-With': 'fetch' } })
  if (session.current) return navigateTo('/login')
  await load()
}
</script>

<template>
  <AdminShell title="Login sessions">
    <ul class="flex flex-col gap-3">
      <li v-for="session in sessions" :key="session.ref" class="flex items-start justify-between gap-3 max-w-3xl">
        <div class="min-w-0">
          <p class="truncate">{{ session.user_agent ?? 'Unknown browser' }}</p>
          <p class="text-muted">
            {{ session.ip }}, last seen {{ session.last_seen_at }} UTC
            <span v-if="session.current">(this session)</span>
          </p>
        </div>
        <UButton size="sm" variant="soft" color="error" @click="revoke(session)">Sign out</UButton>
      </li>
    </ul>

    <section aria-labelledby="remembered" class="flex max-w-3xl flex-col gap-2 rounded-lg border border-default p-4">
      <h2 id="remembered" class="text-xl font-bold">Remembered browsers</h2>
      <p class="text-muted">
        Browsers you've logged in from are remembered, so a flood of wrong guesses from elsewhere can't keep you out.
        If a device is lost, forget them all. Changing your password forgets them too. Each is remembered again at its next login.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton variant="soft" color="neutral" icon="i-lucide-shield-off" @click="forgetBrowsers">Forget all browsers</UButton>
        <span role="status" class="text-sm">{{ forgotten }}</span>
      </div>
    </section>

    <section aria-labelledby="break-glass" class="flex max-w-3xl flex-col gap-2 rounded-lg border-2 border-error p-4">
      <h2 id="break-glass" class="text-xl font-bold">Break glass</h2>
      <p class="text-muted">
        If you think someone else has got in: sign out every login, including this one, and deactivate every frame, so each has to be
        paired again. Remembered browsers are forgotten too. Your photos aren't touched. Afterwards, log in and change your password.
      </p>
      <UButton color="error" size="lg" icon="i-lucide-siren" class="self-start" @click="breaking = true">Sign out everything</UButton>
    </section>

    <UModal v-model:open="breaking" title="Sign out everything?" description="Every login and every frame" :dismissible="!breakWorking">
      <template #body>
        <form class="flex flex-col gap-4" @submit.prevent="signOutEverything">
          <p>
            Every login session ends, including yours, and every frame is deactivated and goes back to its pairing screen.
            You'll need to log in again, and pair each frame again.
          </p>
          <p>To confirm, type <strong class="select-none font-mono" @copy.prevent>{{ BREAK_GLASS_PHRASE }}</strong> by hand. Pasting is turned off.</p>
          <UFormField label="Type the words above">
            <UInput
              v-model="breakTyped"
              name="break-glass-phrase"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              :spellcheck="false"
              class="w-full font-mono"
              @paste="refusePaste"
              @drop="refusePaste"
              @beforeinput="onBreakBeforeInput"
            />
          </UFormField>
          <p v-if="breakPasteRefused && breakTyped !== BREAK_GLASS_PHRASE" role="alert" class="-mt-2 text-sm text-error">Pasting doesn't work here. Type it.</p>
          <UFormField label="Your admin password">
            <UInput v-model="breakPassword" type="password" name="break-glass-password" autocomplete="current-password" class="w-full" />
          </UFormField>
          <p v-if="breakError" role="alert" class="text-sm text-error">{{ breakError }}</p>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton size="lg" color="neutral" variant="soft" class="justify-center" autofocus :disabled="breakWorking" @click="breaking = false">Cancel</UButton>
            <UButton
              type="submit"
              size="lg"
              color="error"
              icon="i-lucide-siren"
              class="justify-center"
              :disabled="breakTyped !== BREAK_GLASS_PHRASE || !breakPassword || breakWorking"
              :loading="breakWorking"
            >
              Sign out everything
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </AdminShell>
</template>
