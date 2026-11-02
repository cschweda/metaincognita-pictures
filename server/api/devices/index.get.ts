// Role: admin. Every frame that hasn't been revoked.
import { db } from '../../db'
import type { Device } from '../../types'

export default defineEventHandler(() => ({
  devices: db.prepare<[], Device>(`SELECT * FROM devices WHERE revoked = 0 ORDER BY name COLLATE NOCASE`).all()
    .map(publicDevice),
}))
