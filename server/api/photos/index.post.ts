// Role: admin. Streams each file to disk, so a large upload never sits in memory.
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'
import { ensurePhotoDirs, ingestPhoto, MAX_FILE_BYTES, MAX_FILES_PER_REQUEST, picturesPath } from '../../utils/images'

interface Received {
  filename: string
  path: string
  truncated: boolean
}

function parseTags(value: string): string[] {
  const names = value.split(',').map(tag => tag.trim()).filter(Boolean)
  return [...new Set(names)]
}

export default defineEventHandler(async (event) => {
  const contentType = getHeader(event, 'content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    throw createError({ statusCode: 415, statusMessage: 'Expected multipart/form-data' })
  }

  await ensurePhotoDirs()

  const received: Received[] = []
  const writes: Promise<void>[] = []
  let tags: string[] = []
  let tooManyFiles = false

  try {
    await new Promise<void>((resolve, reject) => {
      const parser = Busboy({
        headers: event.node.req.headers,
        limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
      })

      parser.on('field', (name, value) => {
        if (name === 'tags') tags = parseTags(value)
      })
      parser.on('file', (_name, stream, info) => {
        const file: Received = {
          filename: info.filename || 'untitled',
          path: picturesPath('tmp', randomUUID()), // The client's filename never reaches a path.
          truncated: false,
        }
        received.push(file)
        stream.on('limit', () => { file.truncated = true })
        writes.push(pipeline(stream, createWriteStream(file.path, { mode: 0o600 })))
      })
      parser.on('filesLimit', () => { tooManyFiles = true })
      parser.on('error', reject)
      parser.on('close', resolve)
      event.node.req.pipe(parser)
    })
    await Promise.all(writes)

    if (tooManyFiles) {
      throw createError({ statusCode: 413, statusMessage: `Send at most ${MAX_FILES_PER_REQUEST} files at a time` })
    }

    const results = []
    for (const file of received) {
      const result = file.truncated
        ? { status: 'rejected' as const, error: 'Larger than 50 MB.' }
        : await ingestPhoto(file.path, file.filename, tags)
      results.push({ filename: file.filename, ...result })
    }
    return { results }
  }
  finally {
    await Promise.all(received.map(file => rm(file.path, { force: true })))
  }
})
