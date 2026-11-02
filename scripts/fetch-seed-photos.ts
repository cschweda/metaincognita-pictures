// Downloads the sample photos into seed/photos/ and writes seed/manifest.json.
// This is the only code in the project allowed to make network requests in Phase 0.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Shape {
  width: number
  height: number
  ids: number[]
  tags: (index: number) => string[]
}

const SHAPES: Shape[] = [
  // Every other landscape also gets `fall`, so filters can combine two tags.
  { width: 2400, height: 1600, ids: [10, 11, 12, 15, 16, 20, 22, 24, 26, 27], tags: i => (i % 2 ? ['travel', 'landscape', 'fall'] : ['travel', 'landscape']) },
  { width: 1600, height: 2400, ids: [28, 29, 30, 37, 42, 48], tags: () => ['family'] },
  { width: 2000, height: 2000, ids: [49, 54, 58, 60], tags: () => ['city'] },
  { width: 3000, height: 1000, ids: [64, 65, 76], tags: () => ['landscape'] },
  { width: 1000, height: 2400, ids: [83, 96], tags: () => ['family', 'fall'] },
]

// The second batch, each tagged by what it shows, in the same mix of shapes.
const LANDSCAPE = { width: 2400, height: 1600 }
const PORTRAIT = { width: 1600, height: 2400 }
const SQUARE = { width: 2000, height: 2000 }
const PANORAMIC = { width: 3000, height: 1000 }
const TALL = { width: 1000, height: 2400 }

const TAGGED = [
  { id: 100, ...LANDSCAPE, tags: ['beach', 'travel', 'landscape'] },
  { id: 103, ...LANDSCAPE, tags: ['fall', 'landscape', 'travel'] },
  { id: 110, ...LANDSCAPE, tags: ['sunset', 'landscape', 'fall'] },
  { id: 116, ...LANDSCAPE, tags: ['landscape', 'travel', 'summer'] },
  { id: 118, ...LANDSCAPE, tags: ['landscape', 'flowers', 'travel'] },
  { id: 122, ...LANDSCAPE, tags: ['night', 'city', 'travel'] },
  { id: 124, ...LANDSCAPE, tags: ['water', 'summer', 'travel'] },
  { id: 128, ...LANDSCAPE, tags: ['mountains', 'water', 'travel'] },
  { id: 104, ...PORTRAIT, tags: ['still-life'] },
  { id: 106, ...PORTRAIT, tags: ['flowers', 'spring'] },
  { id: 107, ...PORTRAIT, tags: ['nature', 'summer'] },
  { id: 108, ...PORTRAIT, tags: ['beach', 'travel', 'summer'] },
  { id: 111, ...PORTRAIT, tags: ['cars', 'city'] },
  { id: 113, ...PORTRAIT, tags: ['food', 'still-life'] },
  { id: 127, ...PORTRAIT, tags: ['nature', 'spring'] },
  { id: 101, ...SQUARE, tags: ['architecture', 'city'] },
  { id: 117, ...SQUARE, tags: ['music', 'night'] },
  { id: 119, ...SQUARE, tags: ['still-life', 'work'] },
  { id: 126, ...SQUARE, tags: ['water', 'nature'] },
  { id: 112, ...PANORAMIC, tags: ['nature', 'fall'] },
  { id: 121, ...PANORAMIC, tags: ['mountains', 'landscape'] },
  { id: 125, ...PANORAMIC, tags: ['water', 'landscape', 'fall'] },
  { id: 102, ...TALL, tags: ['food', 'summer'] },
  { id: 109, ...TALL, tags: ['nature', 'summer'] },
  { id: 120, ...TALL, tags: ['night', 'landscape'] },
]

const PHOTOS_DIR = join('seed', 'photos')

async function download(url: string, path: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

mkdirSync(PHOTOS_DIR, { recursive: true })

const manifest: { file: string, tags: string[] }[] = []
let downloaded = 0
let skipped = 0
const failed: string[] = []

const photos = [
  ...SHAPES.flatMap(({ width, height, ids, tags }) =>
    ids.map((id, index) => ({ id, width, height, tags: tags(index) }))),
  ...TAGGED,
]

for (const { id, width, height, tags } of photos) {
  const file = `seed-${String(id).padStart(3, '0')}.jpg`
  const path = join(PHOTOS_DIR, file)
  const url = `https://picsum.photos/id/${id}/${width}/${height}`
  manifest.push({ file, tags: [...tags, 'test'] })

  if (existsSync(path)) {
    skipped++
    continue
  }
  try {
    await download(url, path).catch(() => download(url, path)) // retry once
    downloaded++
  }
  catch {
    failed.push(file)
  }
}

writeFileSync(join('seed', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`${downloaded} downloaded, ${skipped} skipped, ${failed.length} failed${failed.length ? `: ${failed.join(', ')}` : ''}`)
if (failed.length > 0) process.exit(1)
