// Compresses large originals already in the library. Reports savings by default;
// pass --apply to replace the files. This cannot be undone, and frame images are not changed.
import { readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import dotenv from 'dotenv'
import { COMPRESS_OVER_BYTES, compressOriginal } from '../server/utils/compress'

dotenv.config({ quiet: true })

const picturesDir = process.env.NUXT_PICTURES_DIR
if (!picturesDir) {
  console.error('NUXT_PICTURES_DIR is not set.')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const dir = join(picturesDir, 'orig')
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

let checked = 0
let compressed = 0
let before = 0
let after = 0

for (const file of readdirSync(dir)) {
  if (file.endsWith('.compressing')) continue
  checked++

  const path = join(dir, file)
  const size = statSync(path).size
  if (size <= COMPRESS_OVER_BYTES) continue

  const temp = `${path}.compressing`
  try {
    if (await compressOriginal(path, temp)) {
      compressed++
      before += size
      after += statSync(temp).size
      if (apply) {
        renameSync(temp, join(dir, `${file.slice(0, -extname(file).length)}.jpg`))
        if (extname(file) !== '.jpg') rmSync(path)
      }
    }
  }
  catch (error) {
    console.error(`${file}: skipped, ${(error as Error).message}`)
  }
  finally {
    rmSync(temp, { force: true })
  }
}

const verb = apply ? 'Compressed' : 'Would compress'
console.log(`${verb} ${compressed} of ${checked} originals: ${megabytes(before)} MB to ${megabytes(after)} MB.`)
if (!apply && compressed > 0) console.log('Run again with --apply to replace them.')
