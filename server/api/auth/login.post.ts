// Role: public. Requires the X-Requested-With header. Five wrong passwords lock this address out
// for five minutes. With two-factor login on, the right password returns `code_needed` and a
// short ticket instead of a session, and /api/auth/code finishes the login.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown }>(event)
  await verifyAdminPassword(event, body?.password)
  if (twoFactorEnabled()) {
    issueLoginTicket(event)
    logEvent(event, 'info', 'login', 'Right password, waiting for the two-factor code')
    return { code_needed: true }
  }
  createSession(event)
  rememberBrowser(event)
  logEvent(event, 'info', 'login', 'Logged in')
  return { ok: true }
})
