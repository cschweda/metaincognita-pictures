// Inserts a device named "test" and prints its raw token, or deletes it with --remove.
// Used to test device scope before pairing exists. Start the app once first to create the database.
import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'
import { ulid } from 'ulid'
import { randomToken, sha256 } from '../server/utils/tokens'

dotenv.config({ quiet: true })

const dbPath = process.env.NUXT_DB_PATH
if (!dbPath || !existsSync(dbPath)) {
  console.error(`No database at ${dbPath ?? 'NUXT_DB_PATH'}. Start the app once first.`)
  process.exit(1)
}

const db = new Database(dbPath)
db.prepare(`DELETE FROM devices WHERE name = 'test'`).run()

if (process.argv.includes('--remove')) {
  console.log('Removed the test device.')
}
else {
  const token = randomToken()
  db.prepare(
    `INSERT INTO devices (id, name, token_hash, paired_at) VALUES (?, 'test', ?, datetime('now'))`,
  ).run(ulid(), sha256(token))
  console.log(token)
}
