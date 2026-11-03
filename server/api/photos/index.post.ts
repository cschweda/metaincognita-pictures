// Role: admin. Streams each file to disk, so a large upload never sits in memory.
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'
import { cleanTagName, ensurePhotoDirs, ingestPhoto, MAX_FILE_BYTES, MAX_FILES_PER_REQUEST, picturesPath } from '../../utils/images'

interface Received {
  filename: string
  path: string
  truncated: boolean
}

const MAX_UPLOAD_TAGS = 20

/** Same rules as the Tags page: each name is checked, and a batch takes at most 20 tags. */
function parseTags(value: string): string[] {
  const names = [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))]
  if (names.length > MAX_UPLOAD_TAGS) {
    throw createError({ statusCode: 400, statusMessage: `Choose at most ${MAX_UPLOAD_TAGS} tags for an upload` })
  }
  return names.map(name => cleanTagName(name))
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
    await new Promise<void>((resolve, rejectRequest) => {
      let failed = false
      // Once the request has failed, nothing more is written: the parser stops and later files drain.
      const reject = (error: unknown) => {
        if (failed) return
        failed = true
        event.node.req.unpipe(parser)
        parser.destroy()
        rejectRequest(error)
      }
      const parser = Busboy({
        headers: event.node.req.headers,
        limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
      })

      parser.on('field', (name, value) => {
        if (name !== 'tags') return
        try {
          tags = parseTags(value)
        }
        catch (error) {
          reject(error) // Thrown inside busboy's handler, it would escape the request.
        }
      })
      parser.on('file', (_name, stream, info) => {
        if (failed) {
          stream.resume()
          return
        }
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
      // A client that disconnects mid-upload would otherwise leave the parser, and its files, waiting.
      event.node.req.on('aborted', () => reject(createError({ statusCode: 400, statusMessage: 'Upload interrupted' })))
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
    // Wait for every write to finish or fail first. Removing a file whose write is still opening
    // it would leave a stray temp file behind. The startup sweep catches anything left anyway.
    await Promise.race([Promise.allSettled(writes), new Promise(resolve => setTimeout(resolve, 10_000))])
    await Promise.all(received.map(file => rm(file.path, { force: true })))
  }
})
