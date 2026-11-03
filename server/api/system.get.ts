// Role: admin. What is running, for the Technical details page and for bug reports.
import { stat } from 'node:fs/promises'
import os from 'node:os'
import sharp from 'sharp'
import { db } from '../db'

const fileBytes = (path: string) => stat(path).then(info => info.size, () => 0)

export default defineEventHandler(async () => {
  const { build, dbPath } = useRuntimeConfig()
  const migrations = db.prepare<[], { name: string, applied_at: string }>(
    `SELECT name, applied_at FROM _migrations ORDER BY name`,
  ).all()
  const [database, wal] = await Promise.all([fileBytes(dbPath), fileBytes(`${dbPath}-wal`)])

  return {
    app: {
      version: build.version,
      commit: build.commit || null,
      built_at: build.builtAt,
      started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
    },
    runtime: {
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      arch: process.arch,
      hostname: os.hostname(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    libraries: {
      nuxt: build.nuxt,
      vue: build.vue,
      nuxt_ui: build.nuxtUi,
      sharp: sharp.versions.sharp ?? null,
      libvips: sharp.versions.vips,
      better_sqlite3: build.betterSqlite3,
      sqlite: db.prepare<[], { version: string }>(`SELECT sqlite_version() AS version`).get()?.version ?? null,
      heic_decode: build.heicDecode,
    },
    database: {
      path: dbPath,
      bytes: database + wal,
      journal_mode: db.pragma('journal_mode', { simple: true }) as string,
      migrations: migrations.length,
      latest_migration: migrations.at(-1)?.name ?? null,
      latest_migration_at: migrations.at(-1)?.applied_at ?? null,
    },
    storage: {
      path: picturesPath(),
      variant_sizes: [...VARIANT_SIZES],
    },
  }
})
