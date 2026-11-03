// Role: device, or admin for a slideshow in their own browser. What a frame shows when someone taps
// the photo: caption, date, camera settings, size, and tags. Anyone in the room can see a frame,
// so the location is never included, and a frame can't look up a photo it isn't allowed to show.
import { stat } from 'node:fs/promises'
import sharp from 'sharp'
import { db } from '../../../db'
import type { Photo } from '../../../types'

const PHOTO_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!PHOTO_ID.test(id)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const photo = db.prepare<[string], Photo>(`SELECT * FROM photos WHERE id = ?`).get(id)
  if (!photo || (photo.hidden && !event.context.admin)) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const tags = db.prepare<[string], { name: string }>(
    `SELECT t.name FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.photo_id = ? ORDER BY t.name COLLATE NOCASE`,
  ).all(id).map(row => row.name)

  let camera = null
  for (const extension of ORIGINAL_EXTENSIONS) {
    const path = picturesPath('orig', `${id}.${extension}`)
    if (!(await stat(path).catch(() => null))) continue
    const metadata = await sharp(path, { limitInputPixels: false }).metadata().catch(() => null)
    camera = readCamera(readExif(metadata?.exif))
    break
  }

  return {
    caption: photo.caption,
    taken_at: photo.taken_at,
    width: photo.width,
    height: photo.height,
    tags,
    camera: camera && {
      make: camera.make,
      model: camera.model,
      lens: camera.lens,
      exposure: camera.exposure,
      aperture: camera.aperture,
      iso: camera.iso,
      focal_length: camera.focal_length,
    },
  }
})
