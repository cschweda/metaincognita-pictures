// Role: public, with the ticket from a right password. Requires the X-Requested-With header.
// Takes the six-digit code from the authenticator app, or a recovery code. Wrong codes count
// toward the same five-try lockout as wrong passwords, and each ticket allows five tries.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: unknown }>(event)
  const ticket = takeLoginTicket(event)
  if (!ticket || !twoFactorEnabled()) {
    endLoginTicket(event, ticket)
    throw createError({ statusCode: 401, statusMessage: 'That took too long, or too many codes were tried. Enter your password again.', data: { restart: true } })
  }
  let used: 'app' | 'recovery' | null = null
  await checkWithLockout(event, 'login code', 'code', () => (used = spendSecondFactor(body?.code)) !== null)
  endLoginTicket(event, ticket)
  createSession(event)
  rememberBrowser(event)
  if (used === 'recovery') {
    logEvent(event, 'warn', 'security', `Logged in with a recovery code, ${recoveryCodesLeft()} left`)
  }
  else {
    logEvent(event, 'info', 'login', 'Logged in with a two-factor code')
  }
  return { ok: true }
})
