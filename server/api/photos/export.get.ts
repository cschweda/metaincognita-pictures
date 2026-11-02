// Role: admin. Downloads every original, with a manifest of names, tags, dates, and captions.
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { db } from '../../db'
import type { Photo } from '../../types'

const BLOCK = 512

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(BLOCK)
  const field = (value: string, offset: number) => header.write(value, offset, 'ascii')
  const octal = (value: number, length: number) => `${value.toString(8).padStart(length - 1, '0')}\0`

  field(name, 0)
  field(octal(0o644, 8), 100)
  field(octal(0, 8), 108)
  field(octal(0, 8), 116)
  field(octal(size, 12), 124)
  field(octal(Math.floor(Date.now() / 1000), 12), 136)
  field('        ', 148) // The checksum counts this field as spaces.
  field('0', 156)
  field('ustar\0', 257)
  field('00', 263)

  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  field(`${checksum.toString(8).padStart(6, '0')}\0 `, 148)
  return header
}

function padding(size: number): Buffer {
  return Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK)
}

async function* archive(files: Map<string, string>, manifest: string) {
  const manifestBytes = Buffer.from(manifest)
  yield tarHeader('openmantel/manifest.json', manifestBytes.length)
  yield manifestBytes
  yield padding(manifestBytes.length)

  for (const file of files.values()) {
    const path = picturesPath('orig', file)
    const { size } = await stat(path)
    yield tarHeader(`openmantel/originals/${file}`, size)
    yield* createReadStream(path)
    yield padding(size)
  }
  yield Buffer.alloc(BLOCK * 2)
}

export default defineEventHandler(async (event) => {
  const photos = db.prepare<[], Photo>(`SELECT * FROM photos ORDER BY position DESC`).all()
  const tags = db.prepare<[], { photo_id: string, name: string }>(
    `SELECT pt.photo_id, t.name FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id`,
  ).all()

  const stored = await readdir(picturesPath('orig')).catch(() => [] as string[])
  const files = new Map(stored.map(file => [file.split('.')[0]!, file]))

  const manifest = JSON.stringify(photos.map(photo => ({
    file: files.get(photo.id) ? `originals/${files.get(photo.id)}` : null,
    filename: photo.filename,
    taken_at: photo.taken_at,
    caption: photo.caption,
    hidden: photo.hidden === 1,
    tags: tags.filter(tag => tag.photo_id === photo.id).map(tag => tag.name),
  })), null, 2)

  setResponseHeaders(event, {
    'Content-Type': 'application/x-tar',
    'Content-Disposition': 'attachment; filename="openmantel-photos.tar"',
  })
  return sendStream(event, Readable.from(archive(files, manifest)))
})
