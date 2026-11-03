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
  </AdminShell>
</template>
