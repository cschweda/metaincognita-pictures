import { readdir, rm, stat } from 'node:fs/promises'

// Uploads stream into tmp/ and remove their own files, but a crash or a dropped connection can
// leave one behind. Anything there for over an hour is left over, since processing takes seconds.
const MAX_AGE_MS = 60 * 60_000

async function sweepTmp() {
  const dir = picturesPath('tmp')
  const files = await readdir(dir).catch(() => [] as string[])
  const now = Date.now()
  for (const file of files) {
    const path = `${dir}/${file}`
    const info = await stat(path).catch(() => null)
    if (info?.isFile() && now - info.mtimeMs > MAX_AGE_MS) await rm(path, { force: true })
  }
}

export default defineNitroPlugin(() => {
  sweepTmp().catch(error => console.error('[photos] tmp sweep failed', error))
  const timer = setInterval(() => {
    sweepTmp().catch(error => console.error('[photos] tmp sweep failed', error))
  }, MAX_AGE_MS)
  timer.unref()
})
