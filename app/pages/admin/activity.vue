<script setup lang="ts">
// The Activity log: logins, wrong passwords and lockouts, pairing, frames, and deletes, newest
// first. The place to look first if something seems wrong.
definePageMeta({ middleware: 'admin' })

interface ActivityEvent {
  id: number
  at: string
  level: 'info' | 'warn'
  kind: string
  message: string
  ip: string | null
  agent: string | null
}

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Warnings', value: 'warn' },
  { label: 'Logins', value: 'login' },
  { label: 'Sessions', value: 'session' },
  { label: 'Security', value: 'security' },
  { label: 'Frames and pairing', value: 'frames' },
  { label: 'Deletes', value: 'delete' },
  { label: 'Uploads', value: 'photo' },
]
const ICONS: Record<string, string> = {
  login: 'i-lucide-log-in',
  session: 'i-lucide-key-round',
  pair: 'i-lucide-link',
  frame: 'i-lucide-monitor',
  delete: 'i-lucide-trash-2',
  photo: 'i-lucide-image-up',
  demo: 'i-lucide-flask-conical',
  security: 'i-lucide-shield-check',
}

const filter = ref('all')
const events = ref<ActivityEvent[]>([])
const next = ref<number | null>(null)
const warnings = ref(0)
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function query(before?: number) {
  const f = filter.value
  return {
    before,
    level: f === 'warn' ? 'warn' : undefined,
    kind: f === 'frames' ? undefined : ['login', 'session', 'security', 'delete', 'photo'].includes(f) ? f : undefined,
  }
}

async function fetchPage(before?: number) {
  // Frames and pairing are two kinds, fetched together.
  if (filter.value === 'frames') {
    const [frames, pairs] = await Promise.all(['frame', 'pair'].map(kind =>
      $fetch<{ events: ActivityEvent[], next: number | null, warnings_24h: number }>('/api/events', { query: { before, kind } }),
    ))
    const merged = [...frames!.events, ...pairs!.events].sort((a, b) => b.id - a.id).slice(0, 100)
    return { events: merged, next: merged.length === 100 ? merged.at(-1)!.id : null, warnings_24h: frames!.warnings_24h }
  }
  return $fetch<{ events: ActivityEvent[], next: number | null, warnings_24h: number }>('/api/events', { query: query(before) })
}

async function load() {
  loading.value = true
  try {
    const page = await fetchPage()
    events.value = page.events
    next.value = page.next
    warnings.value = page.warnings_24h
  }
  finally {
    loading.value = false
  }
}

async function loadOlder() {
  if (next.value === null) return
  const page = await fetchPage(next.value)
  events.value = [...events.value, ...page.events]
  next.value = page.next
}

onMounted(() => {
  load()
  // Every 15 seconds while it's in front of you, only refreshing the newest page.
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && events.value.length <= 100) load().catch(() => undefined)
  }, 15_000)
})
onBeforeUnmount(() => clearInterval(timer))
watch(filter, () => load())

const when = (sql: string) => new Date(`${sql.replace(' ', 'T')}Z`).toLocaleString()
/** A short browser name, from the user agent. */
function browser(agent: string | null) {
  if (!agent) return null
  const os = /iPhone|iPad/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : null
  const name = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : /curl|node|python|Go-http/i.test(agent) ? 'a script' : null
  return [name, os].filter(Boolean).join(' on ') || null
}
</script>

<template>
  <AdminShell title="Activity">
    <p class="max-w-3xl text-lg text-muted">
      Logins, wrong passwords, pairing, frames, and deletes, newest first. If anything here looks wrong, sign out other sessions on
      <NuxtLink to="/admin/sessions" class="text-primary underline underline-offset-2">Login sessions</NuxtLink>
      and change your password.
    </p>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-1" role="group" aria-label="Show">
        <UButton
          v-for="option in FILTERS"
          :key="option.value"
          size="sm"
          color="neutral"
          :variant="filter === option.value ? 'solid' : 'outline'"
          :aria-pressed="filter === option.value"
          @click="filter = option.value"
        >
          {{ option.label }}
        </UButton>
      </div>
      <p class="text-sm" :class="warnings ? 'text-warning' : 'text-muted'">
        {{ warnings ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'} in the last 24 hours` : 'No warnings in the last 24 hours' }}
      </p>
    </div>

    <p v-if="!loading && events.length === 0" class="text-muted">Nothing recorded yet.</p>

    <ol class="flex flex-col divide-y divide-default rounded-lg border border-default">
      <li v-for="item in events" :key="item.id" class="flex items-start gap-3 p-3" :class="{ 'bg-warning/5': item.level === 'warn' }">
        <UIcon :name="ICONS[item.kind] ?? 'i-lucide-circle'" class="mt-0.5 size-5 shrink-0" :class="item.level === 'warn' ? 'text-warning' : 'text-muted'" aria-hidden="true" />
        <div class="flex min-w-0 flex-col">
          <p :class="{ 'font-medium': item.level === 'warn' }">
            <span v-if="item.level === 'warn'" class="sr-only">Warning: </span>{{ item.message }}
          </p>
          <p class="text-sm text-muted">
            {{ when(item.at) }}<template v-if="item.ip"> · {{ item.ip }}</template><template v-if="browser(item.agent)"> · {{ browser(item.agent) }}</template>
          </p>
        </div>
      </li>
    </ol>
    <UButton v-if="next !== null" variant="soft" color="neutral" class="self-start" @click="loadOlder">Load older</UButton>
  </AdminShell>
</template>
