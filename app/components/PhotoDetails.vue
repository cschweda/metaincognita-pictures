<script setup lang="ts">
// Everything known about one photo, opened from the ⋮ button on its thumbnail. Rows with no
// value are left out, so a photo without camera data simply has no Camera section.
interface Details {
  photo: {
    id: string
    filename: string
    width: number
    height: number
    taken_at: string | null
    uploaded_at: string
    caption: string | null
    hidden: boolean
    hash: string
    tags: string[]
    playlists: string[]
  }
  original: {
    extension: string
    bytes: number
    format: string | null
    compression: string | null
    width: number | null
    height: number | null
    orientation: number | null
    space: string | null
    channels: number | null
    depth: string | null
    bits_per_sample: number | null
    density: number | null
    chroma_subsampling: string | null
    progressive: boolean | null
    has_alpha: boolean | null
    has_icc_profile: boolean
    has_exif: boolean
    has_xmp: boolean
    camera: Record<string, string | number | boolean | null> | null
    location: { latitude: number, longitude: number, altitude: number | null } | null
  } | null
  variants: { size: number, bytes: number | null, width: number | null, height: number | null, has_exif: boolean }[]
  variant_format: { format: string, quality: number, metadata: string }
}

const props = defineProps<{ photoId: string | null }>()
const open = defineModel<boolean>('open', { default: false })

const details = ref<Details | null>(null)
const failed = ref(false)

watch(() => [props.photoId, open.value] as const, async ([id, isOpen]) => {
  if (!id || !isOpen) return
  details.value = null
  failed.value = false
  try {
    details.value = await $fetch<Details>(`/api/photos/${id}/details`)
  }
  catch {
    failed.value = true
  }
}, { immediate: true })

const bytes = (value: number | null | undefined) => {
  if (!value) return null
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}
const when = (value: string | null | undefined) => {
  if (!value) return null
  const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}
const megapixels = (width?: number | null, height?: number | null) =>
  width && height ? `${width} × ${height} (${((width * height) / 1_000_000).toFixed(1)} MP)` : null
const yesNo = (value: boolean | null | undefined) => value === null || value === undefined ? null : value ? 'Yes' : 'No'

const ORIENTATIONS: Record<number, string> = {
  1: 'Upright',
  2: 'Mirrored',
  3: 'Upside down',
  4: 'Upside down, mirrored',
  5: 'Turned and mirrored',
  6: 'Turned 90° clockwise',
  7: 'Turned and mirrored',
  8: 'Turned 90° counterclockwise',
}

interface Row { label: string, value: string | null, mono?: boolean }
const sections = computed(() => {
  const d = details.value
  if (!d) return []
  const p = d.photo
  const o = d.original
  const c = o?.camera
  const list: { title: string, note?: string, rows: Row[] }[] = [
    {
      title: 'Photo',
      rows: [
        { label: 'File name', value: p.filename },
        { label: 'Taken', value: when(p.taken_at) },
        { label: 'Uploaded', value: when(p.uploaded_at) },
        { label: 'Size, upright', value: megapixels(p.width, p.height) },
        { label: 'Caption', value: p.caption },
        { label: 'Tags', value: p.tags.join(', ') || null },
        { label: 'Playlists', value: p.playlists.join(', ') || null },
        { label: 'On frames', value: p.hidden ? 'No, hidden' : 'Yes' },
      ],
    },
  ]
  if (o) {
    list.push({
      title: 'Original file',
      note: 'Kept on the server exactly as stored. Frames never receive it.',
      rows: [
        { label: 'Format', value: [o.format?.toUpperCase(), o.compression ? `${o.compression.toUpperCase()} compression` : null].filter(Boolean).join(', ') || o.extension.toUpperCase() },
        { label: 'File size', value: bytes(o.bytes) },
        { label: 'Pixels', value: megapixels(o.width, o.height) },
        { label: 'Orientation', value: o.orientation ? ORIENTATIONS[o.orientation] ?? String(o.orientation) : null },
        { label: 'Colour', value: [o.space?.toUpperCase(), o.channels ? `${o.channels} channels` : null, o.bits_per_sample ? `${o.bits_per_sample}-bit` : null].filter(Boolean).join(', ') || null },
        { label: 'Chroma subsampling', value: o.chroma_subsampling },
        { label: 'Progressive', value: o.format === 'jpeg' ? yesNo(o.progressive) : null },
        { label: 'Transparency', value: o.has_alpha ? 'Yes' : null },
        { label: 'Resolution', value: o.density ? `${o.density} dpi` : null },
        { label: 'Colour profile', value: o.has_icc_profile ? 'Embedded ICC profile' : 'None' },
        { label: 'Metadata', value: [o.has_exif ? 'EXIF' : null, o.has_xmp ? 'XMP' : null].filter(Boolean).join(', ') || 'None' },
        { label: 'Fingerprint', value: p.hash, mono: true },
      ],
    })
  }
  if (c) {
    list.push({
      title: 'Camera',
      rows: [
        { label: 'Camera', value: [c.make, c.model].filter(Boolean).join(' ') || null },
        { label: 'Lens', value: c.lens as string | null },
        { label: 'Exposure', value: c.exposure as string | null },
        { label: 'Aperture', value: c.aperture as string | null },
        { label: 'ISO', value: c.iso === null ? null : String(c.iso) },
        { label: 'Focal length', value: [c.focal_length, c.focal_length_35mm ? `${c.focal_length_35mm} in 35 mm terms` : null].filter(Boolean).join(', ') || null },
        { label: 'Flash', value: c.flash === null ? null : c.flash ? 'Fired' : 'Off' },
        { label: 'Software', value: c.software as string | null },
      ],
    })
  }
  if (o?.location) {
    const l = o.location
    list.push({
      title: 'Location',
      note: 'Recorded by the camera and kept in the original only. It is removed from everything a frame receives.',
      rows: [
        { label: 'Latitude', value: String(l.latitude), mono: true },
        { label: 'Longitude', value: String(l.longitude), mono: true },
        { label: 'Altitude', value: l.altitude === null ? null : `${l.altitude} m` },
      ],
    })
  }
  list.push({
    title: 'Frame images',
    note: `${d.variant_format.format.toUpperCase()} at quality ${d.variant_format.quality}, with all metadata removed. Frames get the size that suits their screen.`,
    rows: d.variants.map(variant => ({
      label: `${variant.size}px`,
      value: variant.bytes
        ? `${variant.width} × ${variant.height}, ${bytes(variant.bytes)}${variant.has_exif ? ', has EXIF' : ''}`
        : 'Missing. Run pnpm photos:rebuild',
    })),
  })
  return list.map(section => ({ ...section, rows: section.rows.filter(row => row.value) }))
})
</script>

<template>
  <UModal v-model:open="open" :title="details?.photo.filename ?? 'Photo details'" description="Details and metadata for this photo" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <p v-if="failed" role="alert" class="text-error">Couldn't load this photo's details.</p>
      <p v-else-if="!details" class="text-muted">Loading…</p>
      <div v-else class="flex flex-col gap-6">
        <img :src="`/v/${details.photo.id}-640.webp`" alt="" class="mx-auto max-h-56 rounded object-contain">
        <section v-for="section in sections" :key="section.title" class="flex flex-col gap-2">
          <h3 class="text-xl font-bold">{{ section.title }}</h3>
          <p v-if="section.note" class="text-sm text-muted">{{ section.note }}</p>
          <dl class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <template v-for="row in section.rows" :key="row.label">
              <dt class="text-muted">{{ row.label }}</dt>
              <dd class="min-w-0 break-words" :class="{ 'font-mono text-sm': row.mono }">{{ row.value }}</dd>
            </template>
          </dl>
        </section>
      </div>
    </template>
  </UModal>
</template>
