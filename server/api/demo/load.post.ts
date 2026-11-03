// Role: admin. Replaces the library with a fresh demo. Only in demo mode, where nothing of the
// owner's can be lost, so one confirmation is enough. Paired frames stay paired, showing all photos. In live mode the demo is reached through
// Start over, with all of its checks.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ confirm?: unknown }>(event)
  if (body?.confirm !== true) throw createError({ statusCode: 400, statusMessage: 'Confirm first' })
  if (appMode() === 'live') {
    throw createError({ statusCode: 409, statusMessage: 'Your own photos are here. Use Start over to replace everything with the demo' })
  }
  if (demoJob().state === 'loading') return { job: demoJob() }
  await nukeEverything({ keepFrames: true })
  console.log(`[demo] reloaded ip=${clientIp(event)}`)
  return { job: startDemoLoad() }
})
