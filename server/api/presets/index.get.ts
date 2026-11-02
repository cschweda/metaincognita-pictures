// Role: admin. Saved filters.
import { db } from '../../db'
import type { Preset } from '../../types'

export default defineEventHandler(() => ({
  presets: db.prepare<[], Preset>(`SELECT * FROM presets ORDER BY name COLLATE NOCASE`).all()
    .map(preset => ({ ...preset, filter: parseFilter(preset.filter) })),
}))
