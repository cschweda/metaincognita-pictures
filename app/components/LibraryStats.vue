<script setup lang="ts">
// The library at a glance: plain numbers, then tags as a ranked bar list.
export interface Stats {
  photos: number
  showing: number
  frames: number
  online: number
  disk_total: number
  disk_free: number
}

const props = defineProps<{ stats: Stats | null, tags: Tag[] }>()

const gigabytes = (bytes: number) => (bytes / 1024 ** 3).toFixed(bytes < 10 * 1024 ** 3 ? 1 : 0)

const numbers = computed(() => {
  const stats = props.stats
  if (!stats) return []
  return [
    { value: stats.photos, label: stats.photos === 1 ? 'photo' : 'photos', note: `${stats.showing} showing on frames` },
    { value: stats.frames, label: stats.frames === 1 ? 'frame' : 'frames', note: `${stats.online} online now` },
    { value: props.tags.length, label: props.tags.length === 1 ? 'tag' : 'tags', note: 'to sort by' },
    { value: gigabytes(stats.disk_free), label: 'GB free', note: `of ${gigabytes(stats.disk_total)} GB` },
  ]
})

const bars = computed(() => {
  const ranked = [...props.tags].sort((a, b) => (b.photos ?? 0) - (a.photos ?? 0)).slice(0, 8)
  const most = Math.max(1, ...ranked.map(tag => tag.photos ?? 0))
  return ranked.map(tag => ({ ...tag, width: `${((tag.photos ?? 0) / most) * 100}%` }))
})
</script>

<template>
  <section aria-label="Library at a glance" class="flex flex-col gap-10">
    <dl class="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
      <div v-for="item in numbers" :key="item.label" class="flex flex-col-reverse">
        <dd class="text-muted">{{ item.note }}</dd>
        <dt class="text-xl font-medium">{{ item.label }}</dt>
        <dd class="text-6xl sm:text-7xl font-extrabold tracking-tight leading-none tabular-nums">{{ item.value }}</dd>
      </div>
    </dl>

    <div v-if="bars.length" class="flex flex-col gap-3">
      <h2 class="text-2xl font-bold tracking-tight">Photos by tag</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="bar in bars" :key="bar.id">
          <NuxtLink
            :to="{ path: '/admin', query: { tag: bar.id } }"
            class="grid grid-cols-[7rem_1fr_2.5rem] sm:grid-cols-[10rem_1fr_3rem] items-center gap-3 rounded py-1 hover:bg-elevated"
            :title="`See ${bar.photos} photos tagged ${bar.name}`"
          >
            <span class="truncate text-lg">{{ bar.name }}</span>
            <span class="block h-3 rounded-e bg-[#b8841f]" :style="{ width: bar.width }" />
            <span class="text-end text-lg font-semibold tabular-nums">{{ bar.photos }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </section>
</template>
