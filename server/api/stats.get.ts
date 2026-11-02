// Role: admin. The numbers on the admin home.
import { mkdir, statfs } from 'node:fs/promises'
import { db } from '../db'

export default defineEventHandler(async () => {
  const counts = db.prepare<[], { total: number, showing: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(hidden = 0), 0) AS showing FROM photos`,
  ).get()
  const frames = db.prepare<[], { id: string }>(`SELECT id FROM devices WHERE revoked = 0`).all()

  const dir = picturesPath()
  await mkdir(dir, { recursive: true })
  const disk = await statfs(dir)
  const totalBytes = disk.blocks * disk.bsize
  const freeBytes = disk.bavail * disk.bsize

  return {
    photos: counts?.total ?? 0,
    showing: counts?.showing ?? 0,
    frames: frames.length,
    online: frames.filter(frame => isFrameConnected(frame.id)).length,
    disk_total: totalBytes,
    disk_free: freeBytes,
  }
})
