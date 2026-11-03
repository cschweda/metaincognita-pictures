<script setup lang="ts">
// What is running and where, for troubleshooting and bug reports.
definePageMeta({ middleware: 'admin' })

interface System {
  app: { version: string, commit: string | null, built_at: string, started_at: string, environment: string }
  runtime: { node: string, platform: string, arch: string, hostname: string, timezone: string }
  libraries: Record<'nuxt' | 'vue' | 'nuxt_ui' | 'sharp' | 'libvips' | 'better_sqlite3' | 'sqlite' | 'heic_decode', string | null>
  database: {
    path: string
    bytes: number
    journal_mode: string
    migrations: number
    latest_migration: string | null
    latest_migration_at: string | null
  }
  storage: { path: string, variant_sizes: number[] }
}

const { repository } = useAppConfig()
const system = ref<System | null>(null)
const failed = ref(false)
const copied = ref(false)

onMounted(async () => {
  try {
    system.value = await $fetch<System>('/api/system')
  }
  catch {
    failed.value = true
  }
})

const when = (iso: string | null) => iso ? new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleString() : 'Unknown'
const size = (bytes: number) => bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
const shortCommit = computed(() => system.value?.app.commit?.slice(0, 7) ?? null)

const groups = computed(() => {
  const s = system.value
  if (!s) return []
  const l = s.libraries
  return [
    {
      title: 'App',
      rows: [
        { label: 'Version', value: s.app.version },
        { label: 'Commit', value: shortCommit.value ?? 'Unknown', href: s.app.commit ? `${repository}/commit/${s.app.commit}` : undefined },
        { label: 'Built', value: when(s.app.built_at) },
        { label: 'Running since', value: when(s.app.started_at) },
        { label: 'Mode', value: s.app.environment },
      ],
    },
    {
      title: 'Server',
      rows: [
        { label: 'Node', value: s.runtime.node },
        { label: 'System', value: `${s.runtime.platform}, ${s.runtime.arch}` },
        { label: 'Host name', value: s.runtime.hostname },
        { label: 'Time zone', value: s.runtime.timezone },
      ],
    },
    {
      title: 'Database',
      rows: [
        { label: 'File', value: s.database.path, mono: true },
        { label: 'Size', value: size(s.database.bytes) },
        { label: 'SQLite', value: `${l.sqlite ?? 'Unknown'}, ${s.database.journal_mode.toUpperCase()} journal` },
        { label: 'Migrations applied', value: String(s.database.migrations) },
        { label: 'Latest migration', value: s.database.latest_migration ?? 'None', mono: true },
        { label: 'Applied', value: when(s.database.latest_migration_at) },
      ],
    },
    {
      title: 'Photos',
      rows: [
        { label: 'Folder', value: s.storage.path, mono: true },
        { label: 'Frame image widths', value: s.storage.variant_sizes.map(px => `${px}px`).join(', ') },
        { label: 'Format', value: 'WebP, with location and other metadata removed' },
      ],
    },
    {
      title: 'Libraries',
      rows: [
        { label: 'Nuxt', value: l.nuxt },
        { label: 'Vue', value: l.vue },
        { label: 'Nuxt UI', value: l.nuxt_ui },
        { label: 'sharp', value: `${l.sharp}, libvips ${l.libvips}` },
        { label: 'better-sqlite3', value: l.better_sqlite3 },
        { label: 'heic-decode', value: l.heic_decode },
      ],
    },
  ]
})

const LINKS = [
  { label: 'Source code', path: '' },
  { label: 'Changelog', path: '/blob/main/CHANGELOG.md' },
  { label: 'Self-hosting guide', path: '/blob/main/docs/self-hosting.md' },
  { label: 'Design', path: '/blob/main/docs/00-master-design.md' },
  { label: 'Security design', path: '/blob/main/docs/06-security.md' },
  { label: 'Report a problem', path: '/issues/new' },
]

/** Plain text for pasting into a bug report. Paths and the host name stay out of it. */
async function copySummary() {
  const s = system.value
  if (!s) return
  const l = s.libraries
  const text = [
    `OpenMantel ${s.app.version} (${shortCommit.value ?? 'unknown commit'}), built ${s.app.built_at}`,
    `Node ${s.runtime.node} on ${s.runtime.platform} ${s.runtime.arch}`,
    `SQLite ${l.sqlite}, ${s.database.migrations} migrations, latest ${s.database.latest_migration}`,
    `Nuxt ${l.nuxt}, Vue ${l.vue}, sharp ${l.sharp} (libvips ${l.libvips}), better-sqlite3 ${l.better_sqlite3}`,
  ].join('\n')
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <AdminShell title="Technical details">
    <p class="text-muted max-w-2xl">
      What this server is running. Include the summary when you report a problem; it leaves out folder paths and the host name.
    </p>

    <div class="flex flex-wrap gap-2">
      <UButton size="lg" variant="soft" :disabled="!system" @click="copySummary">
        {{ copied ? 'Copied' : 'Copy summary for a bug report' }}
      </UButton>
      <span class="sr-only" aria-live="polite">{{ copied ? 'Summary copied' : '' }}</span>
    </div>

    <p v-if="failed" role="alert" class="text-error">Couldn't load the details. Try reloading the page.</p>

    <div class="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      <section v-for="group in groups" :key="group.title" :aria-labelledby="`tech-${group.title}`" class="flex flex-col gap-3">
        <h2 :id="`tech-${group.title}`" class="text-2xl font-extrabold tracking-tight">{{ group.title }}</h2>
        <dl class="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
          <template v-for="row in group.rows" :key="row.label">
            <dt class="text-muted">{{ row.label }}</dt>
            <dd class="min-w-0 break-words" :class="{ 'font-mono text-sm': 'mono' in row && row.mono }">
              <a
                v-if="'href' in row && row.href"
                :href="row.href"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary underline underline-offset-2"
              >{{ row.value }}<span class="sr-only"> (opens in a new tab)</span></a>
              <template v-else>{{ row.value }}</template>
            </dd>
          </template>
        </dl>
      </section>

      <section aria-labelledby="tech-links" class="flex flex-col gap-3">
        <h2 id="tech-links" class="text-2xl font-extrabold tracking-tight">Project</h2>
        <ul class="flex flex-col gap-2">
          <li v-for="link in LINKS" :key="link.label">
            <a
              :href="repository + link.path"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-primary underline underline-offset-2"
            >
              {{ link.label }}
              <UIcon name="i-lucide-external-link" class="size-4" aria-hidden="true" />
              <span class="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        </ul>
        <p class="text-muted">OpenMantel is free and open source under the MIT license.</p>
      </section>
    </div>
  </AdminShell>
</template>
