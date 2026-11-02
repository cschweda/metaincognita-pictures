import { stat } from 'node:fs/promises'
import sharp from 'sharp'

// Originals above this size are re-encoded. Smaller ones are kept byte for byte.
export const COMPRESS_OVER_BYTES = 8 * 1024 * 1024
const JPEG_QUALITY = 85
const MIN_SAVING = 0.9 // Keep the result only if it is at least 10% smaller.
const COMPRESSIBLE = new Set(['jpeg', 'png', 'tiff', 'webp'])

/**
 * Writes a smaller JPEG to outputPath, keeping EXIF, and returns true.
 * Returns false, and writes nothing to keep, when the file should stay as it is.
 */
export async function compressOriginal(inputPath: string, outputPath: string): Promise<boolean> {
  const { size } = await stat(inputPath)
  if (size <= COMPRESS_OVER_BYTES) return false

  const metadata = await sharp(inputPath).metadata()
  if (!metadata.format || !COMPRESSIBLE.has(metadata.format) || metadata.hasAlpha) return false

  // keepMetadata() leaves the orientation flag in place, so nothing is rotated here.
  await sharp(inputPath, { sequentialRead: true })
    .keepMetadata()
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(outputPath)

  const compressed = await stat(outputPath)
  return compressed.size <= size * MIN_SAVING
}
