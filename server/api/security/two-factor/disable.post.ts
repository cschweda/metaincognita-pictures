// Role: admin. Turns two-factor login off. Needs the password and a current code or a recovery
// code, both under the login lockout, so a session left open on a shared computer isn't enough.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown, code?: unknown }>(event)
  if (!twoFactorEnabled()) throw createError({ statusCode: 409, statusMessage: 'Two-factor login is already off' })
  await verifyAdminPassword(event, body?.password, 'turn off two-factor login')
  await checkWithLockout(event, 'turn off two-factor login', 'code', () => spendSecondFactor(body?.code) !== null)
  turnOffTwoFactor()
  logEvent(event, 'warn', 'security', 'Turned off two-factor login')
  return { ok: true }
})
