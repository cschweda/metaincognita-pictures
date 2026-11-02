// Role: public, so an expired session can still clear its cookie. Requires the X-Requested-With header.
export default defineEventHandler((event) => {
  destroySession(event)
  return { ok: true }
})
