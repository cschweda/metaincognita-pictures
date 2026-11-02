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
  </AdminShell>
</template>
