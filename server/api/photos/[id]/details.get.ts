// Role: admin. Everything known about one photo: the library record, the original file's format,
// compression, and camera metadata, and the frame images made from it. Reads file headers only.
import { stat } from 'node:fs/promises'
import exifReader from 'exif-reader'
import sharp from 'sharp'
import { db } from '../../../db'
import type { Photo } from '../../../types'

const ORIGINAL_EXTENSIONS = ['jpg', 'png', 'webp', 'tif', 'avif', 'heic']

type Exif = ReturnType<typeof exifReader>

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().replace(/\0+$/, '') : null
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const date = (value: unknown) => value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null

/** Shutter speed as photographers write it: 1/250 s, or 2 s. */
function exposure(seconds: number | null) {
  if (!seconds) return null
  return seconds >= 1 ? `${Number(seconds.toFixed(1))} s` : `1/${Math.round(1 / seconds)} s`
}

/** Degrees, minutes, seconds and a hemisphere letter, to signed decimal degrees. */
function coordinate(parts: unknown, ref: unknown): number | null {
  if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(part => typeof part === 'number')) return null
  const [degrees, minutes, seconds] = parts as [number, number, number]
  const value = degrees + minutes / 60 + seconds / 3600
  return ref === 'S' || ref === 'W' ? -value : value
}

function camera(exif: Exif | null) {
  if (!exif) return null
  const image = exif.Image ?? {}
  const photo = exif.Photo ?? {}
  const result = {
    make: text(image.Make),
    model: text(image.Model),
    lens: text(photo.LensModel),
    taken: date(photo.DateTimeOriginal ?? image.DateTime),
    exposure: exposure(number(photo.ExposureTime)),
    aperture: number(photo.FNumber) ? `ƒ/${Number(number(photo.FNumber)!.toFixed(1))}` : null,
    iso: number(photo.ISOSpeedRatings) ?? number(photo.PhotographicSensitivity),
    focal_length: number(photo.FocalLength) ? `${Number(number(photo.FocalLength)!.toFixed(1))} mm` : null,
    focal_length_35mm: number(photo.FocalLengthIn35mmFilm) ? `${number(photo.FocalLengthIn35mmFilm)} mm` : null,
    flash: number(photo.Flash) === null ? null : (number(photo.Flash)! & 1) === 1,
    software: text(image.Software),
  }
  return Object.values(result).some(value => value !== null) ? result : null
}

function location(exif: Exif | null) {
  const gps = exif?.GPSInfo
  if (!gps) return null
  const latitude = coordinate(gps.GPSLatitude, gps.GPSLatitudeRef)
  const longitude = coordinate(gps.GPSLongitude, gps.GPSLongitudeRef)
  if (latitude === null || longitude === null) return null
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    altitude: number(gps.GPSAltitude) === null ? null : Math.round(number(gps.GPSAltitude)!),
  }
}

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
    let exif: Exif | null = null
    try {
      exif = metadata?.exif ? exifReader(metadata.exif) : null
    }
    catch {
      // Unreadable EXIF: show the rest.
    }
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
      camera: camera(exif),
      location: location(exif),
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
