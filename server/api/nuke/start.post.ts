// Role: admin. The first step of deleting everything: what would go, and a token for the last step.
export default defineEventHandler((event) => {
  const session = currentSessionRef(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  logEvent(event, 'warn', 'delete', 'Opened Start over')
  return { token: startNuke(session), counts: nukeCounts(), phrase: NUKE_PHRASE, wait_ms: NUKE_MIN_WAIT_MS }
})
