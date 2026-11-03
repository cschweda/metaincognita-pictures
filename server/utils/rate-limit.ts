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

/**
 * The key a client is limited by. One IPv6 host can use any address in its /64 (2^64 of them),
 * so IPv6 is limited per /64. IPv4, and IPv4 written as IPv6, is limited per address.
 */
export function ipBucket(ip: string): string {
  const address = ip.replace(/^::ffff:(?=\d+\.)/i, '')
  if (!address.includes(':')) return address
  const [head = '', tail = ''] = address.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = address.includes('::') ? (tail ? tail.split(':') : []) : []
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  return `${groups.slice(0, 4).map(group => group.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

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
  if (attempts.size > MAX_KEYS) trim(attempts, now)
  return 0
}

/** After a successful login, forgets this IP's attempts and its one successful attempt globally. */
export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip)
  attempts.get(GLOBAL_KEY)?.pop()
}

const hits = new Map<string, number[]>()

// Keys are dropped once they're older than any window, and the maps are capped, so a flood of
// fresh addresses can't grow memory without bound. Past the cap the oldest keys go first.
const LONGEST_WINDOW_MS = 60 * 60_000
const MAX_KEYS = 50_000

function trim(map: Map<string, number[]>, now: number) {
  for (const [key, times] of map) {
    if (key !== GLOBAL_KEY && now - (times.at(-1) ?? 0) > LONGEST_WINDOW_MS) map.delete(key)
  }
  for (const key of map.keys()) {
    if (map.size <= MAX_KEYS) break
    if (key !== GLOBAL_KEY) map.delete(key)
  }
}

/** Run every minute by the sweep plugin. */
export function sweepRateLimits(now = Date.now()): void {
  trim(attempts, now)
  trim(hits, now)
}

/** A plain sliding window, for routes that just refuse once over the limit. */
export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const kept = (hits.get(key) ?? []).filter(time => now - time < windowMs)
  const allowed = kept.length < limit
  if (allowed) kept.push(now)
  if (kept.length > 0) hits.set(key, kept)
  else hits.delete(key)
  if (hits.size > MAX_KEYS) trim(hits, now)
  return allowed
}
