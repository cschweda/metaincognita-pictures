import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

function open() {
  const { dbPath } = useRuntimeConfig()
  if (!dbPath) throw new Error('NUXT_DB_PATH is not set')

  mkdirSync(dirname(dbPath), { recursive: true })
  // The database and its -wal and -shm files hold session and token hashes, so only the app user
  // reads them. The stricter umask covers just their creation; photo files keep the usual one.
  const previous = process.umask(0o077)
  let connection: Database.Database
  try {
    connection = new Database(dbPath)
    connection.pragma('journal_mode = WAL')
  }
  finally {
    process.umask(previous)
  }
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      chmodSync(file, 0o600)
    }
    catch {
      // Owned by another user, or not created yet. Not worth refusing to start over.
    }
  }
  connection.pragma('foreign_keys = ON')
  return connection
}

export const db = open()

// Migration files are bundled as server assets, so they ship inside .output.
async function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name        TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const storage = useStorage('assets:migrations')
  const files = (await storage.getKeys()).filter(key => key.endsWith('.sql')).sort()
  const applied = new Set(
    db.prepare<[], { name: string }>(`SELECT name FROM _migrations`).all().map(row => row.name),
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await storage.getItem<string>(file)
    if (!sql) throw new Error(`Migration ${file} is empty`)

    db.transaction(() => {
      db.exec(sql)
      db.prepare(`INSERT INTO _migrations (name) VALUES (?)`).run(file)
    })()
    console.log(`[db] applied migration ${file}`)
  }
}

// The auth middleware awaits this, so no route can run against an unmigrated database.
export const migrated = migrate()
