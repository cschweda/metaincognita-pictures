// Optional two-factor login with time-based one-time codes (RFC 6238), as used by Google
// Authenticator, 1Password, Authy, and others: HMAC-SHA1, 6 digits, a new code every 30 seconds.
// Off until the owner turns it on. The secret and recovery code hashes live in `settings`, in the
// database the app user alone can read.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const STEP_SECONDS = 30
const DIGITS = 6
const DRIFT_STEPS = 1 // Accept the code before and after, for a phone clock a little off.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const RECOVERY_CODE_COUNT = 10

export function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** The code for one 30-second step. */
export function totpCode(secret: string, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', base32Decode(secret)).update(message).digest()
  const offset = hmac[hmac.length - 1]! & 15
  const number = (hmac.readUInt32BE(offset) & 0x7FFFFFFF) % 10 ** DIGITS
  return String(number).padStart(DIGITS, '0')
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS)
}

/**
 * The step a code belongs to, if it's valid now and newer than `lastUsed`, so a code can't be
 * used twice. Returns null when it doesn't match.
 */
export function matchTotp(secret: string, code: string, lastUsed: number, now = Date.now()): number | null {
  const digits = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const step = currentStep(now)
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
    const candidate = step + drift
    if (candidate <= lastUsed) continue
    const expected = Buffer.from(totpCode(secret, candidate))
    if (timingSafeEqual(expected, Buffer.from(digits))) return candidate
  }
  return null
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(secret: string, label: string): string {
  const issuer = 'OpenMantel'
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

/** Ten codes like 7KQ2M-9XDPA, for when the phone is lost. Each works once. */
export function newRecoveryCodes(): string[] {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // No 0/O, 1/I/L.
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('')
    return `${chars.slice(0, 5)}-${chars.slice(5)}`
  })
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
