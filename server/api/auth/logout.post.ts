// Role: public, so an expired session can still clear its cookie. Requires the X-Requested-With header.
export default defineEventHandler((event) => {
  if (event.context.admin) logEvent(event, 'info', 'login', 'Logged out')
  destroySession(event)
  return { ok: true }
})
