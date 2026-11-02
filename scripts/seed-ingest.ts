// Pushes seed/photos/ through the real upload route, with the tags from seed/manifest.json.
// Needs the app running. Set PICTURES_PASSWORD, and SEED_URL if it isn't on localhost:3100.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const base = process.env.SEED_URL ?? 'http://localhost:3100'
const password = process.env.PICTURES_PASSWORD
const session = process.env.PICTURES_SESSION
if (!password && !session) {
  console.error('Set PICTURES_PASSWORD to the admin password, or PICTURES_SESSION to a session id.')
  process.exit(1)
}

const headers = { 'X-Requested-With': 'fetch' }

async function logIn(): Promise<string> {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!login.ok) {
    console.error(`Login failed: ${login.status}`)
    process.exit(1)
  }
  return login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

const cookie = session ? `admin_session=${session}` : await logIn()

const manifest: { file: string, tags: string[] }[] = JSON.parse(readFileSync('seed/manifest.json', 'utf8'))
const counts = { added: 0, duplicate: 0, rejected: 0, missing: 0 }

for (const { file, tags } of manifest) {
  const path = join('seed', 'photos', file)
  if (!existsSync(path)) {
    counts.missing++
    continue
  }

  const form = new FormData()
  form.append('tags', tags.join(','))
  form.append('photo', new Blob([readFileSync(path)], { type: 'image/jpeg' }), file)

  const response = await fetch(`${base}/api/photos`, { method: 'POST', headers: { ...headers, cookie }, body: form })
  if (!response.ok) {
    console.error(`${file}: upload failed with ${response.status}`)
    counts.rejected++
    continue
  }
  const { results } = await response.json() as { results: { status: keyof typeof counts, error?: string }[] }
  for (const result of results) {
    counts[result.status]++
    if (result.error) console.error(`${file}: ${result.error}`)
  }
}

console.log(`${counts.added} added, ${counts.duplicate} duplicate, ${counts.rejected} rejected, ${counts.missing} missing`)
