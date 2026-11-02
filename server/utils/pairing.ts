import { randomInt } from 'node:crypto'
import { db } from '../db'
import type { Pairing } from '../types'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 symbols, no 0 O 1 I
const CODE_LENGTH = 6

export function newPairingCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}

/** Accepts what a person types: any case, with or without the dash. */
export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

export function findPendingPairing(code: string): Pairing | undefined {
  return db.prepare<[string], Pairing>(
    `SELECT * FROM pairings WHERE code = ? AND status = 'pending' AND expires_at > datetime('now')`,
  ).get(normalizeCode(code))
}

/** Expires stale rows and removes old ones. Runs every minute, not only on read (Doc 06 §5). */
export function sweepPairings(): void {
  const expired = db.prepare(
    `UPDATE pairings SET status = 'expired'
     WHERE status IN ('pending', 'approved') AND expires_at <= datetime('now')`,
  ).run()
  if (expired.changes > 0) console.log(`[pair] expired ${expired.changes}`)

  db.prepare(
    `DELETE FROM pairings
     WHERE (status = 'claimed' AND claimed_at <= datetime('now', '-24 hours'))
        OR (status = 'expired' AND expires_at <= datetime('now', '-24 hours'))`,
  ).run()
}
