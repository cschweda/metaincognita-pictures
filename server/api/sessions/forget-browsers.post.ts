// Role: admin. Forgets every browser remembered for skipping the flood limits. Logins aren't
// affected; each browser is remembered again at its next login.
export default defineEventHandler((event) => {
  const forgotten = forgetAllBrowsers()
  console.warn(`[auth] forgot ${forgotten} remembered browsers ip=${clientIp(event)}`)
  return { forgotten }
})
