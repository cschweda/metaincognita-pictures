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

/**
 * A wider neighbourhood, used only during a flood: IPv4 by /24 and IPv6 by /48, the block one
 * customer usually gets, so rotating through nearby addresses doesn't multiply the guesses.
 */
export function prefixBucket(ip: string): string {
  const address = ip.replace(/^::ffff:(?=\d+\.)/i, '')
  if (!address.includes(':')) return `${address.split('.').slice(0, 3).join('.')}.0/24`
  return `${ipBucket(address).split(':').slice(0, 3).join(':')}::/48`
}

export const LOCK_AFTER_FAILURES = 5
export const LOCKOUT_MS = 5 * 60_000
const FORGET_AFTER_MS = 15 * 60_000 // Wrong guesses this old no longer count toward a lockout.
// A flood of wrong passwords from many addresses doesn't lock anyone out, which would let an
// attacker keep the owner out. It cuts each address's tries to one until the flood passes, so a
// right password on the first try still works.
const FLOOD = { failures: 20, ms: 60 * 60_000 }
// During a flood, password checks from addresses that aren't logged in are capped at this many a
// minute in total. Past it they wait about a minute: a delay at worst, never a lockout.
const FLOOD_CEILING = { attempts: 30, ms: 60_000 }
let floodAttempts: number[] = []

const failures = new Map<string, { count: number, last: number, lockedUntil: number }>()
let recentFailures: number[] = []

function underFlood(now: number): boolean {
  recentFailures = recentFailures.filter(time => now - time < FLOOD.ms)
  return recentFailures.length >= FLOOD.failures
}

/** Milliseconds until this address may try a password again, or 0. During a flood, its /24 or /48 counts too. */
export function loginLockout(key: string, now = Date.now(), { prefix, trusted = false }: { prefix?: string, trusted?: boolean } = {}): number {
  const locks = [key, ...(prefix && !trusted && underFlood(now) ? [prefix] : [])]
    .map(name => failures.get(name))
    .map(entry => (entry && entry.lockedUntil > now ? entry.lockedUntil - now : 0))
  let wait = Math.max(0, ...locks)
  if (!trusted && underFlood(now)) {
    floodAttempts = floodAttempts.filter(time => now - time < FLOOD_CEILING.ms)
    if (floodAttempts.length >= FLOOD_CEILING.attempts) wait = Math.max(wait, (floodAttempts[0] ?? now) + FLOOD_CEILING.ms - now)
  }
  return wait
}

/**
 * Counts an attempt before the password is checked, so attempts sent all at once can't each slip
 * past the limit while the others are still being checked. A right password gives it back.
 * Returns the tries left after this one, and the lockout it started, if any.
 */
export function reserveLoginAttempt(key: string, { trusted = false, prefix }: { trusted?: boolean, prefix?: string } = {}, now = Date.now()): { triesLeft: number, lockedMs: number, at: number } {
  const entry = failures.get(key)
  const count = entry && now - entry.last < FORGET_AFTER_MS && entry.lockedUntil <= now ? entry.count + 1 : 1
  const flood = !trusted && underFlood(now)
  const limit = flood ? 1 : LOCK_AFTER_FAILURES
  const locked = count >= limit
  failures.set(key, { count: locked ? 0 : count, last: now, lockedUntil: locked ? now + LOCKOUT_MS : 0 })
  // During a flood the whole neighbourhood shares this one try, and the attempt counts toward the ceiling.
  if (flood && prefix) failures.set(prefix, { count: 0, last: now, lockedUntil: now + LOCKOUT_MS })
  if (flood) floodAttempts.push(now)
  recentFailures.push(now)
  if (failures.size > MAX_KEYS) trim(now)
  return { triesLeft: locked ? 0 : limit - count, lockedMs: locked ? LOCKOUT_MS : 0, at: now }
}

/** A right password: this address starts again with its full tries, and the attempt is refunded. */
export function clearLoginAttempts(key: string, at?: number, prefix?: string): void {
  failures.delete(key)
  if (prefix) failures.delete(prefix)
  if (at !== undefined) {
    const index = recentFailures.lastIndexOf(at)
    if (index !== -1) recentFailures.splice(index, 1)
  }
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
