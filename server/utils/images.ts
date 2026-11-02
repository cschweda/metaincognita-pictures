import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, open, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import exifReader from 'exif-reader'
import sharp from 'sharp'
import { ulid } from 'ulid'
import { db } from '../db'
import type { Photo } from '../types'
import { compressOriginal } from './compress'

export const VARIANT_SIZES = [640, 1280, 1920, 2560] as const
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 20

const EXTENSIONS = ['jpg', 'png', 'webp', 'tif', 'avif', 'heic']

// sharp reads the format from the file's bytes, so the name and declared type don't count.
function extensionFor(metadata: sharp.Metadata): string | undefined {
  switch (metadata.format) {
    case 'jpeg': return 'jpg'
    case 'png': return 'png'
    case 'webp': return 'webp'
    case 'tiff': return 'tif'
    case 'heif': return metadata.compression === 'av1' ? 'avif' : undefined
    default: return undefined
  }
}

async function isHeic(path: string): Promise<boolean> {
  const file = await open(path)
  try {
    const { buffer } = await file.read(Buffer.alloc(12), 0, 12, 0)
    return /^ftyp(heic|heix|hevc|hevx|mif1|msf1)$/.test(buffer.toString('latin1', 4, 12))
  }
  finally {
    await file.close()
  }
}

// Keeps memory low on a 1 GiB droplet.
sharp.concurrency(1)
sharp.cache(false)

// Photos are processed one at a time, across all requests (Doc 06 §8).
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task)
  queue = result.catch(() => undefined)
  return result
}

export function picturesPath(...parts: string[]): string {
  return join(useRuntimeConfig().picturesDir, ...parts)
}

function variantPath(id: string, size: number): string {
  return picturesPath('v', `${id}-${size}.webp`)
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function readTakenAt(exif: Buffer | undefined): string | null {
  if (!exif) return null
  try {
    const parsed = exifReader(exif)
    const taken = parsed.Photo?.DateTimeOriginal ?? parsed.Image?.DateTime
    return taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null
  }
  catch {
    return null // Unreadable EXIF should not reject a good photo.
  }
}

/** Returns a usable tag name, or throws a 400. Commas separate tags at upload. */
export function cleanTagName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 40 || name.includes(',')) {
    throw createError({ statusCode: 400, statusMessage: 'Tag names are 1 to 40 characters, with no commas' })
  }
  return name
}

function tagIds(names: string[]): string[] {
  const insert = db.prepare(`INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)`)
  const find = db.prepare<[string], { id: string }>(`SELECT id FROM tags WHERE name = ?`)
  return names.map((name) => {
    insert.run(ulid(), name)
    return find.get(name)!.id
  })
}

export type UploadResult =
  | { status: 'added', photo: Photo }
  | { status: 'duplicate' }
  | { status: 'rejected', error: string }

// sharp can read a HEIC's metadata but not decode it. The decoded pixels are already upright
// even though the file's EXIF may still say to rotate, so the JPEG carries no orientation.
//
// Decoding a 24-megapixel HEIC peaks above 500 MB, so it runs in its own process.
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

async function decodeHeic(inputPath: string, outputPath: string) {
  await promisify(execFile)(process.execPath, ['-e', DECODE_HEIC, inputPath, outputPath], { timeout: 120_000 })
}

/** Runs one uploaded temp file through the pipeline in Doc 00 §6. The caller owns the temp file. */
export function ingestPhoto(tempPath: string, filename: string, tags: string[]): Promise<UploadResult> {
  return enqueue(async () => {
    const metadata = await sharp(tempPath).metadata().catch(() => null)
    const heic = await isHeic(tempPath)
    const detected = heic ? 'heic' : metadata ? extensionFor(metadata) : undefined
    if (!metadata || !detected) return { status: 'rejected', error: 'Not a supported image.' }

    // Hashed before any conversion, so uploading the same file twice is still a duplicate.
    const hash = await hashFile(tempPath)
    const existing = db.prepare(`SELECT 1 FROM photos WHERE hash = ?`).get(hash)
    if (existing) return { status: 'duplicate' }

    const id = ulid()
    const variants = VARIANT_SIZES.map(size => ({ size, path: variantPath(id, size) }))
    const workPath = `${tempPath}.jpg`
    let extension = detected
    let originalPath = picturesPath('orig', `${id}.${extension}`)

    try {
      let source = tempPath
      if (heic) {
        await decodeHeic(tempPath, workPath)
        source = workPath
      }

      const { width, height } = (await sharp(source).metadata()).autoOrient

      if (!heic && await compressOriginal(tempPath, workPath)) {
        extension = 'jpg'
        originalPath = picturesPath('orig', `${id}.jpg`)
        source = workPath
      }
      await copyFile(heic ? tempPath : source, originalPath)

      for (const variant of variants) {
        // No withMetadata(), so EXIF, including GPS, never reaches a frame.
        await sharp(source, { sequentialRead: true })
          .rotate()
          .resize({ width: variant.size, height: variant.size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(variant.path)
      }

      const photo = db.transaction(() => {
        const row = db.prepare<[string, string, number, number, string | null, string], Photo>(
          `INSERT INTO photos (id, filename, width, height, taken_at, hash, position)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM photos))
           RETURNING *`,
        ).get(id, filename, width, height, readTakenAt(metadata.exif), hash)!
        const link = db.prepare(`INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)`)
        for (const tagId of tagIds(tags)) link.run(id, tagId)
        return row
      })()

      pushToAllFrames('playlist-changed')
      return { status: 'added', photo }
    }
    catch (error) {
      await removeFiles(id, originalPath)
      console.error(`[photos] failed to process ${id}`, error)
      return { status: 'rejected', error: 'Could not process this image.' }
    }
    finally {
      await rm(workPath, { force: true })
    }
  })
}

async function removeFiles(id: string, originalPath: string) {
  await Promise.all([
    rm(originalPath, { force: true }),
    ...VARIANT_SIZES.map(size => rm(variantPath(id, size), { force: true })),
  ])
}

/** Deletes a photo's row and every file on disk. Returns false if it doesn't exist. */
export async function deletePhoto(id: string): Promise<boolean> {
  const removed = db.prepare(`DELETE FROM photos WHERE id = ?`).run(id)
  if (removed.changes === 0) return false

  await Promise.all(EXTENSIONS.map(extension =>
    rm(picturesPath('orig', `${id}.${extension}`), { force: true }),
  ))
  await removeFiles(id, picturesPath('orig', id))
  pushToAllFrames('playlist-changed')
  return true
}

export async function ensurePhotoDirs(): Promise<void> {
  await Promise.all(['orig', 'v', 'tmp'].map(dir => mkdir(picturesPath(dir), { recursive: true })))
}
