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
  <main class="mx-auto max-w-2xl p-4 flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-lg font-medium">Login sessions</h1>
      <UButton to="/admin" variant="ghost" color="neutral">Back</UButton>
    </header>
    <ul class="flex flex-col gap-3">
      <li v-for="session in sessions" :key="session.ref" class="flex items-start justify-between gap-3 text-sm">
        <div class="min-w-0">
          <p class="truncate">{{ session.user_agent ?? 'Unknown browser' }}</p>
          <p class="text-muted">
            {{ session.ip }}, last seen {{ session.last_seen_at }} UTC
            <span v-if="session.current">(this session)</span>
          </p>
        </div>
        <UButton size="xs" variant="soft" color="error" @click="revoke(session)">Sign out</UButton>
      </li>
    </ul>
  </main>
</template>
