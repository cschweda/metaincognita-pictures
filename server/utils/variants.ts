// Image work with no Nitro dependencies, so scripts can share it with the server.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

export const VARIANT_SIZES = [640, 1280, 1920, 2560] as const

// Decoding a 48-megapixel HEIC peaks around 600 MB, so it runs in its own process.
// That memory is gone when the process exits, and it can't trigger pm2's restart limit.
const DECODE_HEIC = `
  const decode = require('heic-decode')
  const sharp = require('sharp')
  const { readFileSync } = require('node:fs')
  const [input, output] = process.argv.slice(1)
  decode({ buffer: readFileSync(input) })
    .then(({ width, height, data }) => sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    }).removeAlpha().jpeg({ quality: 92 }).toFile(output))
    .catch((error) => { console.error(error); process.exit(1) })
`

/**
 * sharp can read a HEIC's metadata but not decode it. The decoded pixels are already upright
 * even though the file's EXIF may still say to rotate, so the JPEG carries no orientation.
 */
export async function decodeHeic(inputPath: string, outputPath: string): Promise<void> {
  await promisify(execFile)(process.execPath, ['-e', DECODE_HEIC, inputPath, outputPath], { timeout: 120_000 })
}

export function variantFile(id: string, size: number): string {
  return `${id}-${size}.webp`
}

/** Writes every size. No withMetadata(), so EXIF, including GPS, never reaches a frame. */
export async function writeVariants(sourcePath: string, id: string, directory: string): Promise<void> {
  for (const size of VARIANT_SIZES) {
    await sharp(sourcePath, { sequentialRead: true })
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(join(directory, variantFile(id, size)))
  }
}
