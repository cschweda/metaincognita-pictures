// Role: public. The first poll after approval creates the device and sets its cookie, once.
import { ulid } from 'ulid'
import { db } from '../../db'
import type { Pairing } from '../../types'

export default defineEventHandler((event) => {
  const id = String(getQuery(event).id ?? '')
  const token = randomToken()

  const outcome = db.transaction((): 'pending' | 'approved' | 'expired' | 'replayed' => {
    const pairing = db.prepare<[string], Pairing>(`SELECT * FROM pairings WHERE id = ?`).get(id)
    if (!pairing) return 'expired'
    if (pairing.status === 'claimed') return 'replayed'

    const live = db.prepare<[string], { live: number }>(
      `SELECT expires_at > datetime('now') AS live FROM pairings WHERE id = ?`,
    ).get(id)?.live === 1
    if (pairing.status === 'expired' || !live) return 'expired'
    if (pairing.status === 'pending') return 'pending'

    const deviceId = ulid()
    db.prepare(
      `INSERT INTO devices (id, name, token_hash, screen_w, screen_h, dpr, paired_at, token_rotated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    ).run(deviceId, pairing.name ?? 'Frame', sha256(token), pairing.screen_w, pairing.screen_h, pairing.dpr)
    db.prepare(
      `UPDATE pairings SET status = 'claimed', device_id = ?, claimed_at = datetime('now') WHERE id = ?`,
    ).run(deviceId, id)
    return 'approved'
  })()

  if (outcome === 'replayed') {
    console.warn(`[pair] SUSPICIOUS poll after claim ip=${clientIp(event)}`)
    return { status: 'expired' }
  }
  if (outcome === 'approved') {
    setDeviceCookie(event, token)
    console.log(`[pair] claimed ip=${clientIp(event)}`)
  }
  return { status: outcome }
})
