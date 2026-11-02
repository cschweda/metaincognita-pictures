// Rebuilds missing frame images from the originals, for example after a restore.
// Add --all to rebuild every image.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'
import { decodeHeic, VARIANT_SIZES, variantFile, writeVariants } from '../server/utils/variants'

dotenv.config({ quiet: true })

const { NUXT_DB_PATH: dbPath, NUXT_PICTURES_DIR: picturesDir } = process.env
if (!dbPath || !picturesDir) {
  console.error('NUXT_DB_PATH and NUXT_PICTURES_DIR must be set.')
  process.exit(1)
}

const all = process.argv.includes('--all')
const originals = join(picturesDir, 'orig')
const variants = join(picturesDir, 'v')
mkdirSync(variants, { recursive: true })

const files = new Map(readdirSync(originals).map(file => [file.split('.')[0], file]))
const photos = new Database(dbPath, { readonly: true }).prepare<[], { id: string }>(`SELECT id FROM photos`).all()

let rebuilt = 0
let complete = 0
const missing: string[] = []

for (const { id } of photos) {
  if (!all && VARIANT_SIZES.every(size => existsSync(join(variants, variantFile(id, size))))) {
    complete++
    continue
  }

  const original = files.get(id)
  if (!original) {
    missing.push(id)
    continue
  }

  const path = join(originals, original)
  if (original.endsWith('.heic')) {
    const decoded = join(variants, `${id}.tmp.jpg`)
    await decodeHeic(path, decoded)
    await writeVariants(decoded, id, variants)
    rmSync(decoded, { force: true })
  }
  else {
    await writeVariants(path, id, variants)
  }
  rebuilt++
}

console.log(`${rebuilt} rebuilt, ${complete} already complete, ${missing.length} with no original.`)
if (missing.length > 0) {
  console.error(`No original for: ${missing.join(', ')}`)
  process.exit(1)
}
