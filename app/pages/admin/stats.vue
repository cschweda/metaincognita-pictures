<script setup lang="ts">
import type { Stats } from '~/components/LibraryStats.vue'

definePageMeta({ middleware: 'admin' })

interface ServerStats {
  cpu_percent: number
  cores: number
  load_1m: number
  memory_total: number
  memory_available: number
  swap_total: number
  swap_free: number
  disk_total: number
  disk_free: number
  library_bytes: number
  app_memory: number
  uptime_seconds: number
  app_uptime_seconds: number
  node: string
  photo_bytes: number
  photo_size_is_estimate: boolean
  photos_remaining: number
}

const REFRESH_MS = 5000

const { tags, loadTags } = useTags()
const library = ref<Stats | null>(null)
const server = ref<ServerStats | null>(null)
const failed = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

async function loadServer() {
  try {
    server.value = await $fetch<ServerStats>('/api/stats/server')
    failed.value = false
  }
  catch {
    failed.value = true
  }
}

onMounted(async () => {
  await Promise.all([$fetch<Stats>('/api/stats').then((stats) => { library.value = stats }), loadTags(), loadServer()])
  timer = setInterval(loadServer, REFRESH_MS)
})
onBeforeUnmount(() => clearInterval(timer))

function size(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor(seconds / 3600) % 24
  const minutes = Math.floor(seconds / 60) % 60
  if (days) return `${days}d ${hours}h`
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

const meters = computed(() => {
  const s = server.value
  if (!s) return []
  const used = (total: number, left: number) => (total ? ((total - left) / total) * 100 : 0)
  return [
    { label: 'CPU', percent: s.cpu_percent, note: `${s.cpu_percent}% of ${s.cores} ${s.cores === 1 ? 'core' : 'cores'}` },
    {
      label: 'Memory',
      percent: used(s.memory_total, s.memory_available),
      note: `${size(s.memory_available)} left of ${size(s.memory_total)}`,
    },
    { label: 'Swap', percent: used(s.swap_total, s.swap_free), note: `${size(s.swap_free)} left of ${size(s.swap_total)}` },
    { label: 'Disk', percent: used(s.disk_total, s.disk_free), note: `${size(s.disk_free)} left of ${size(s.disk_total)}` },
  ]
})

const facts = computed(() => {
  const s = server.value
  if (!s) return []
  return [
    { label: 'Photo storage used', value: size(s.library_bytes) },
    { label: 'App memory', value: size(s.app_memory) },
    { label: 'Server up for', value: duration(s.uptime_seconds) },
    { label: 'App up for', value: duration(s.app_uptime_seconds) },
    { label: 'Load, last minute', value: s.load_1m.toFixed(2) },
    { label: 'Node', value: s.node },
  ]
})
</script>

<template>
  <AdminShell title="Stats">
    <LibraryStats :stats="library" :tags="tags" />

    <section aria-label="Server" class="flex flex-col gap-6">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-4xl font-extrabold tracking-tight">Server</h2>
        <p class="text-muted">Updates every 5 seconds</p>
      </div>

      <p v-if="failed" role="alert" class="text-error">Couldn't reach the server. Showing the last numbers received.</p>

      <div v-if="server" class="flex flex-col">
        <p class="text-6xl sm:text-7xl font-extrabold tracking-tight leading-none tabular-nums">
          {{ server.photos_remaining.toLocaleString() }}
        </p>
        <p class="text-xl font-medium">more photos will fit, approximately</p>
        <p class="text-muted max-w-2xl">
          Counts up to 80% disk use, at
          {{ server.photo_size_is_estimate ? 'an estimated' : 'your library\'s average of' }}
          {{ size(server.photo_bytes) }} per photo.
          <template v-if="server.photo_size_is_estimate">It switches to your real average at 200 photos.</template>
        </p>
      </div>

      <ul class="flex flex-col gap-3">
        <li
          v-for="meter in meters"
          :key="meter.label"
          class="grid grid-cols-[5rem_1fr] sm:grid-cols-[6rem_1fr_16rem] items-center gap-x-3 gap-y-1"
        >
          <span class="text-lg">{{ meter.label }}</span>
          <span
            class="block h-3 rounded bg-accented"
            role="meter"
            :aria-label="meter.label"
            :aria-valuenow="Math.round(meter.percent)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="block h-full rounded-e bg-[#b8841f]" :style="{ width: `${meter.percent}%` }" />
          </span>
          <span class="col-span-2 sm:col-span-1 text-muted tabular-nums sm:text-end">{{ meter.note }}</span>
        </li>
      </ul>

      <dl class="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
        <div v-for="fact in facts" :key="fact.label" class="flex flex-col-reverse">
          <dt class="text-muted">{{ fact.label }}</dt>
          <dd class="text-2xl font-bold tabular-nums">{{ fact.value }}</dd>
        </div>
      </dl>
    </section>
  </AdminShell>
</template>
