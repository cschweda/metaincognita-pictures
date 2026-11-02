import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import exifReader from 'exif-reader'
import sharp from 'sharp'
import { ulid } from 'ulid'
import { db } from '../db'
import type { Photo } from '../types'

export const VARIANT_SIZES = [640, 1280, 1920, 2560] as const
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 20

const EXTENSIONS = ['jpg', 'png', 'webp', 'tif', 'avif']

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

/** Runs one uploaded temp file through the pipeline in Doc 00 §6. The caller owns the temp file. */
export function ingestPhoto(tempPath: string, filename: string, tags: string[]): Promise<UploadResult> {
  return enqueue(async () => {
    const metadata = await sharp(tempPath).metadata().catch(() => null)
    const extension = metadata ? extensionFor(metadata) : undefined
    if (!metadata || !extension) {
      const heic = await isHeic(tempPath)
      return { status: 'rejected', error: heic ? 'HEIC is not supported yet. Export as JPEG.' : 'Not a supported image.' }
    }

    const hash = await hashFile(tempPath)
    const existing = db.prepare(`SELECT 1 FROM photos WHERE hash = ?`).get(hash)
    if (existing) return { status: 'duplicate' }

    const id = ulid()
    const originalPath = picturesPath('orig', `${id}.${extension}`)
    const variants = VARIANT_SIZES.map(size => ({ size, path: variantPath(id, size) }))

    try {
      const { width, height } = metadata.autoOrient

      await rename(tempPath, originalPath)

      for (const variant of variants) {
        // No withMetadata(), so EXIF, including GPS, never reaches a frame.
        await sharp(originalPath, { sequentialRead: true })
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

      return { status: 'added', photo }
    }
    catch (error) {
      await removeFiles(id, originalPath)
      console.error(`[photos] failed to process ${id}`, error)
      return { status: 'rejected', error: 'Could not process this image.' }
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
  return true
}

export async function ensurePhotoDirs(): Promise<void> {
  await Promise.all(['orig', 'v', 'tmp'].map(dir => mkdir(picturesPath(dir), { recursive: true })))
}
