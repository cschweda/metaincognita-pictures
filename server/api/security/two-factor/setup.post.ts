// Role: admin. Step one of turning on two-factor login: needs the password, and returns a new
// secret as a QR code for the authenticator app. Nothing changes until a code from it is confirmed.
import QRCode from 'qrcode'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown }>(event)
  if (twoFactorEnabled()) throw createError({ statusCode: 409, statusMessage: 'Two-factor login is already on' })
  await verifyAdminPassword(event, body?.password, 'set up two-factor login')
  const secret = startTwoFactorSetup()
  const host = getRequestHost(event, { xForwardedHost: false }).replace(/:\d+$/, '') || 'admin'
  const uri = otpauthUri(secret, host)
  const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  logEvent(event, 'info', 'security', 'Started setting up two-factor login')
  // Grouped in fours, for typing into an app by hand.
  return { secret: secret.match(/.{1,4}/g)!.join(' '), qr }
})
