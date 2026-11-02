// Role: public.
import { db } from '../db'

export default defineEventHandler(() => {
  const row = db.prepare<[], { ok: number }>(`SELECT 1 AS ok`).get()
  return { ok: true, db: row?.ok === 1 }
})
