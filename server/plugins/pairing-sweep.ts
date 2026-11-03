import { migrated } from '../db'

// The every-minute expiry from Doc 06 §5.
export default defineNitroPlugin(() => {
  const timer = setInterval(() => {
    migrated.then(sweepPairings).catch(error => console.error('[pair] sweep failed', error))
    sweepRateLimits()
  }, 60_000)
  timer.unref()
})
