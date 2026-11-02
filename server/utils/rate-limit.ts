// In-memory login limiter (Doc 06 §4). One process, so a Map is enough.
// Past a limit, attempts must be spaced by an exponentially growing delay, capped so
// the owner can never be locked out for long.

const WINDOWS = {
  ip: { limit: 5, ms: 15 * 60_000 },
  global: { limit: 20, ms: 60 * 60_000 },
}
const MAX_DELAY_MS = 5 * 60_000
const GLOBAL_KEY = '*'

const attempts = new Map<string, number[]>()

function recent(key: string, windowMs: number, now: number): number[] {
  const kept = (attempts.get(key) ?? []).filter(time => now - time < windowMs)
  if (kept.length > 0) attempts.set(key, kept)
  else attempts.delete(key)
  return kept
}

function waitFor(times: number[], limit: number, now: number): number {
  const over = times.length - limit
  if (over < 0) return 0
  const delay = Math.min(1000 * 2 ** over, MAX_DELAY_MS)
  return Math.max(0, (times.at(-1) ?? 0) + delay - now)
}

/** Records an attempt, or returns the milliseconds the caller must still wait. */
export function takeLoginAttempt(ip: string, now = Date.now()): number {
  const byIp = recent(ip, WINDOWS.ip.ms, now)
  const all = recent(GLOBAL_KEY, WINDOWS.global.ms, now)
  const wait = Math.max(
    waitFor(byIp, WINDOWS.ip.limit, now),
    waitFor(all, WINDOWS.global.limit, now),
  )
  if (wait > 0) return wait

  attempts.set(ip, [...byIp, now])
  attempts.set(GLOBAL_KEY, [...all, now])
  return 0
}

/** After a successful login, forgets this IP's attempts and its one successful attempt globally. */
export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip)
  attempts.get(GLOBAL_KEY)?.pop()
}

const hits = new Map<string, number[]>()

/** A plain sliding window, for routes that just refuse once over the limit. */
export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const kept = (hits.get(key) ?? []).filter(time => now - time < windowMs)
  const allowed = kept.length < limit
  if (allowed) kept.push(now)
  if (kept.length > 0) hits.set(key, kept)
  else hits.delete(key)
  return allowed
}
