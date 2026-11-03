// Role: admin. Step two: a code from the app proves it has the secret, and two-factor login is
// on from the next login. Returns ten recovery codes, shown this once and stored only as hashes.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: unknown }>(event)
  if (twoFactorEnabled()) throw createError({ statusCode: 409, statusMessage: 'Two-factor login is already on' })
  const recovery = finishTwoFactorSetup(body?.code)
  if (!recovery) {
    logEvent(event, 'warn', 'security', 'A code didn\'t match while setting up two-factor login')
    throw createError({ statusCode: 400, statusMessage: 'That code doesn\'t match. Check the app shows OpenMantel, and try the newest code. If it has been more than 15 minutes, start again.' })
  }
  logEvent(event, 'warn', 'security', 'Turned on two-factor login')
  return { recovery_codes: recovery }
})
