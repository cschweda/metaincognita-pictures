// Optional two-factor login. Off by default. When on, the password alone opens a short ticket,
// and the six-digit code from the owner's authenticator app, or a recovery code, turns that ticket
// into a session. Stored in `settings`:
//   totp_secret     the shared secret, base32
//   totp_last_step  the 30-second step of the last code used, so a code can't be used twice
//   totp_recovery   JSON array of sha256 hashes of the unused recovery codes
//   totp_pending    JSON { secret, at } while the owner is setting it up
import type { H3Event } from 'h3'

const TICKET_COOKIE = 'login_ticket'
const TICKET_MS = 5 * 60_000
const TICKET_TRIES = 5
const PENDING_MS = 15 * 60_000
const tickets = new Map<string, { expires: number, tries: number }>()

export function twoFactorEnabled(): boolean {
  return Boolean(setting('totp_secret'))
}

function recoveryHashes(): string[] {
  try {
    const parsed = JSON.parse(setting('totp_recovery') ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  }
  catch {
    return []
  }
}

export function recoveryCodesLeft(): number {
  return recoveryHashes().length
}

/** Stores fresh recovery codes, replacing any old ones, and returns them to show once. */
export function issueRecoveryCodes(): string[] {
  const codes = newRecoveryCodes()
  setSetting('totp_recovery', JSON.stringify(codes.map(code => sha256(normalizeRecoveryCode(code)))))
  return codes
}

/**
 * Checks a code from the authenticator app, or a recovery code. A match is used up at once,
 * before anything else can run, so the same code can't be used twice.
 */
export function spendSecondFactor(input: unknown): 'app' | 'recovery' | null {
  const secret = setting('totp_secret')
  if (!secret || typeof input !== 'string' || input.length > 64) return null
  const step = matchTotp(secret, input, Number(setting('totp_last_step') ?? 0))
  if (step !== null) {
    setSetting('totp_last_step', String(step))
    return 'app'
  }
  const hash = sha256(normalizeRecoveryCode(input))
  const hashes = recoveryHashes()
  if (normalizeRecoveryCode(input).length === 10 && hashes.includes(hash)) {
    setSetting('totp_recovery', JSON.stringify(hashes.filter(item => item !== hash)))
    return 'recovery'
  }
  return null
}

/** Starts setting up: a new secret, kept aside until the owner proves their app has it. */
export function startTwoFactorSetup(): string {
  const secret = newTotpSecret()
  setSetting('totp_pending', JSON.stringify({ secret, at: Date.now() }))
  return secret
}

/** Finishes setting up, if the code matches the pending secret. Returns the recovery codes. */
export function finishTwoFactorSetup(code: unknown): string[] | null {
  let pending: { secret?: unknown, at?: unknown } = {}
  try {
    pending = JSON.parse(setting('totp_pending') ?? '{}')
  }
  catch {
    // Treated as no setup in progress.
  }
  if (typeof pending.secret !== 'string' || typeof pending.at !== 'number' || Date.now() - pending.at > PENDING_MS) return null
  const step = typeof code === 'string' ? matchTotp(pending.secret, code, 0) : null
  if (step === null) return null
  setSetting('totp_secret', pending.secret)
  setSetting('totp_last_step', String(step))
  setSetting('totp_pending', null)
  return issueRecoveryCodes()
}

export function turnOffTwoFactor(): void {
  for (const key of ['totp_secret', 'totp_last_step', 'totp_recovery', 'totp_pending']) setSetting(key, null)
  tickets.clear()
}

/** After the right password, when a code is still needed: a short-lived ticket in a cookie. */
export function issueLoginTicket(event: H3Event): void {
  const now = Date.now()
  for (const [hash, ticket] of tickets) if (ticket.expires < now) tickets.delete(hash)
  const token = randomToken()
  tickets.set(sha256(token), { expires: now + TICKET_MS, tries: 0 })
  setCookie(event, TICKET_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth', maxAge: TICKET_MS / 1000 })
}

/** The ticket this browser holds, counting one try against it. Five tries and it's gone. */
export function takeLoginTicket(event: H3Event): string | null {
  const token = getCookie(event, TICKET_COOKIE)
  if (!token) return null
  const hash = sha256(token)
  const ticket = tickets.get(hash)
  if (!ticket || ticket.expires < Date.now() || ticket.tries >= TICKET_TRIES) {
    tickets.delete(hash)
    return null
  }
  ticket.tries++
  return hash
}

export function endLoginTicket(event: H3Event, hash: string | null): void {
  if (hash) tickets.delete(hash)
  deleteCookie(event, TICKET_COOKIE, { path: '/api/auth' })
}
