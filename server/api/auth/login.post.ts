// Role: public. Requires the X-Requested-With header. Five wrong passwords lock this address out
// for five minutes.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown }>(event)
  await verifyAdminPassword(event, body?.password)
  createSession(event)
  console.log(`[auth] login succeeded ip=${clientIp(event)}`)
  return { ok: true }
})
