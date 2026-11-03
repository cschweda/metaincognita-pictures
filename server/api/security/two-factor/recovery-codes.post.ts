// Role: admin. Replaces the recovery codes with ten new ones. The old ones stop working. Needs the
// password and a current code from the app.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown, code?: unknown }>(event)
  if (!twoFactorEnabled()) throw createError({ statusCode: 409, statusMessage: 'Two-factor login is off' })
  await verifyAdminPassword(event, body?.password, 'new recovery codes')
  await checkWithLockout(event, 'new recovery codes', 'code', () => spendSecondFactor(body?.code) !== null)
  const codes = issueRecoveryCodes()
  logEvent(event, 'warn', 'security', 'Made new recovery codes; the old ones no longer work')
  return { recovery_codes: codes }
})
