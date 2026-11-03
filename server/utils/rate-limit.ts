// In-memory login lockout (Doc 06 §4). One process, so Maps are enough.
// Five wrong passwords from one address lock that address out for five minutes. Only that address:
// locking the whole login would let anyone keep the owner out with one bad guess a minute. As a
// backstop, 20 wrong passwords in an hour from anywhere lock the login for five minutes.

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

export const LOCK_AFTER_FAILURES = 5
export const LOCKOUT_MS = 5 * 60_000
const FORGET_AFTER_MS = 15 * 60_000 // Wrong guesses this old no longer count toward a lockout.
const GLOBAL = { limit: 20, ms: 60 * 60_000 }

const failures = new Map<string, { count: number, last: number, lockedUntil: number }>()
let globalFailures: number[] = []
let globalLockedUntil = 0

/** Milliseconds until this address may try a password again, or 0. */
export function loginLockout(key: string, now = Date.now()): number {
  const entry = failures.get(key)
  const own = entry && entry.lockedUntil > now ? entry.lockedUntil - now : 0
  const everyone = globalLockedUntil > now ? globalLockedUntil - now : 0
  return Math.max(own, everyone)
}

/** Records a wrong password. Returns the tries left before a lockout, and the lockout if it started. */
export function recordLoginFailure(key: string, now = Date.now()): { triesLeft: number, lockedMs: number } {
  const entry = failures.get(key)
  const count = entry && now - entry.last < FORGET_AFTER_MS && entry.lockedUntil <= now ? entry.count + 1 : 1
  const locked = count >= LOCK_AFTER_FAILURES
  failures.set(key, { count: locked ? 0 : count, last: now, lockedUntil: locked ? now + LOCKOUT_MS : 0 })

  globalFailures = [...globalFailures.filter(time => now - time < GLOBAL.ms), now]
  if (globalFailures.length >= GLOBAL.limit) {
    globalLockedUntil = now + LOCKOUT_MS
    globalFailures = []
  }
  if (failures.size > MAX_KEYS) trim(now)
  return { triesLeft: locked ? 0 : LOCK_AFTER_FAILURES - count, lockedMs: loginLockout(key, now) }
}

/** After a correct password, this address starts again with five tries. */
export function clearLoginAttempts(key: string): void {
  failures.delete(key)
}

/** The message for a locked-out caller, with the time left in whole minutes or seconds. */
export function lockoutMessage(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  const wait = seconds > 60 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`
  return `Too many wrong passwords. Try again in ${wait}.`
}

const hits = new Map<string, number[]>()

// Keys are dropped once they're older than any window, and the maps are capped, so a flood of
// fresh addresses can't grow memory without bound. Past the cap the oldest keys go first.
const LONGEST_WINDOW_MS = 60 * 60_000
const MAX_KEYS = 50_000

function trimHits(now: number) {
  for (const [key, times] of hits) {
    if (now - (times.at(-1) ?? 0) > LONGEST_WINDOW_MS) hits.delete(key)
  }
  for (const key of hits.keys()) {
    if (hits.size <= MAX_KEYS) break
    hits.delete(key)
  }
}

/** Forgets addresses that are neither locked nor recently wrong, then caps the map, oldest first. */
function trim(now: number) {
  for (const [key, entry] of failures) {
    if (entry.lockedUntil <= now && now - entry.last > FORGET_AFTER_MS) failures.delete(key)
  }
  for (const key of failures.keys()) {
    if (failures.size <= MAX_KEYS) break
    failures.delete(key)
  }
}

/** Run every minute by the sweep plugin. */
export function sweepRateLimits(now = Date.now()): void {
  trim(now)
  trimHits(now)
}

/** A plain sliding window, for routes that just refuse once over the limit. */
export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const kept = (hits.get(key) ?? []).filter(time => now - time < windowMs)
  const allowed = kept.length < limit
  if (allowed) kept.push(now)
  if (kept.length > 0) hits.set(key, kept)
  else hits.delete(key)
  if (hits.size > MAX_KEYS) trimHits(now)
  return allowed
}
