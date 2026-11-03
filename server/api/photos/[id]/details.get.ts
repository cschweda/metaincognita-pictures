// Role: admin. Everything known about one photo: the library record, the original file's format,
// compression, and camera metadata, and the frame images made from it. Reads file headers only.
import { stat } from 'node:fs/promises'
import sharp from 'sharp'
import { db } from '../../../db'
import type { Photo } from '../../../types'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const photo = db.prepare<[string], Photo>(`SELECT * FROM photos WHERE id = ?`).get(id)
  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })

  const tags = db.prepare<[string], { name: string }>(
    `SELECT t.name FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.photo_id = ? ORDER BY t.name COLLATE NOCASE`,
  ).all(id).map(row => row.name)
  const playlists = db.prepare<[string], { name: string }>(
    `SELECT p.name FROM playlist_photos pp JOIN playlists p ON p.id = pp.playlist_id WHERE pp.photo_id = ? ORDER BY p.name COLLATE NOCASE`,
  ).all(id).map(row => row.name)

  // The original keeps the extension it was stored with.
  let original = null
  for (const extension of ORIGINAL_EXTENSIONS) {
    const path = picturesPath('orig', `${id}.${extension}`)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    const metadata = await sharp(path, { limitInputPixels: false }).metadata().catch(() => null)
    const exif = readExif(metadata?.exif)
    original = {
      extension,
      bytes: info.size,
      format: metadata?.format ?? null,
      compression: metadata?.compression ?? null, // HEIC and AVIF: hevc or av1
      width: metadata?.width ?? null,
      height: metadata?.height ?? null,
      orientation: metadata?.orientation ?? null,
      space: metadata?.space ?? null,
      channels: metadata?.channels ?? null,
      depth: metadata?.depth ?? null,
      bits_per_sample: metadata?.bitsPerSample ?? null,
      density: metadata?.density ?? null,
      chroma_subsampling: metadata?.chromaSubsampling ?? null,
      progressive: metadata?.isProgressive ?? null,
      has_alpha: metadata?.hasAlpha ?? null,
      has_icc_profile: metadata?.hasProfile ?? false,
      has_exif: Boolean(metadata?.exif),
      has_xmp: Boolean(metadata?.xmp),
      camera: readCamera(exif),
      location: readLocation(exif),
    }
    break
  }

  const variants = []
  for (const size of VARIANT_SIZES) {
    const path = variantPath(id, size)
    const info = await stat(path).catch(() => null)
    const metadata = info ? await sharp(path).metadata().catch(() => null) : null
    variants.push({
      size,
      bytes: info?.size ?? null,
      width: metadata?.width ?? null,
      height: metadata?.height ?? null,
      has_exif: Boolean(metadata?.exif),
    })
  }

  return {
    photo: {
      id: photo.id,
      filename: photo.filename,
      width: photo.width,
      height: photo.height,
      taken_at: photo.taken_at,
      uploaded_at: photo.uploaded_at,
      caption: photo.caption,
      hidden: photo.hidden === 1,
      hash: photo.hash,
      tags,
      playlists,
    },
    original,
    variants,
    variant_format: { format: 'webp', quality: 82, metadata: 'removed' },
  }
})
