// Turns two-factor login off from the server itself, for when the phone and the recovery codes
// are both lost. Anyone who can run this already controls the server. Run it where the app runs:
//   pnpm security:reset-2fa                                  (on the server)
//   docker compose exec app pnpm security:reset-2fa          (with Docker)
// Restart the app afterwards, so no login waiting for a code carries on.
import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const dbPath = process.env.NUXT_DB_PATH
if (!dbPath || !existsSync(dbPath)) {
  console.error(`No database at ${dbPath ?? 'NUXT_DB_PATH'}.`)
  process.exit(1)
}

const db = new Database(dbPath)
const removed = db.prepare(`DELETE FROM settings WHERE key IN ('totp_secret', 'totp_last_step', 'totp_recovery', 'totp_pending')`).run().changes
const hasEvents = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'`).get()
if (removed && hasEvents) {
  db.prepare(`INSERT INTO events (level, kind, message) VALUES ('warn', 'security', 'Turned off two-factor login from the server')`).run()
}
console.log(removed ? 'Two-factor login is off. Log in with the password alone, then turn it on again from Security.' : 'Two-factor login was already off.')
