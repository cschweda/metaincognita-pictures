// Role: admin. Forgets every browser remembered for skipping the flood limits. Logins aren't
// affected; each browser is remembered again at its next login.
export default defineEventHandler((event) => {
  const forgotten = forgetAllBrowsers()
  logEvent(event, 'warn', 'session', `Forgot ${forgotten} remembered ${forgotten === 1 ? 'browser' : 'browsers'}`)
  return { forgotten }
})
