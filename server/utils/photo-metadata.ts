// Reading what a photo's original file says about itself: format, camera, and location. Shared
// by the admin's details panel and the frame's, which never gets the location.
import exifReader from 'exif-reader'

export const ORIGINAL_EXTENSIONS = ['jpg', 'png', 'webp', 'tif', 'avif', 'heic']

export type Exif = ReturnType<typeof exifReader>

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

export function readCamera(exif: Exif | null) {
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

export function readLocation(exif: Exif | null) {
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


/** Parses EXIF, or returns null when there is none or it can't be read. */
export function readExif(buffer: Buffer | undefined): Exif | null {
  try {
    return buffer ? exifReader(buffer) : null
  }
  catch {
    return null
  }
}
