// Role: admin. Deletes every photo, frame, playlist, tag, and preset. Needs the token from
// /api/nuke/start, at least 10 seconds old, plus the exact phrase and the admin password.
import argon2 from 'argon2'

export default defineEventHandler(async (event) => {
  const session = currentSessionRef(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const ip = clientIp(event)
  // The same limiter as login, since this checks the password too.
  const wait = takeLoginAttempt(ipBucket(ip))
  if (wait > 0) {
    setResponseHeader(event, 'Retry-After', Math.ceil(wait / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }

  const body = await readBody<{ token?: unknown, phrase?: unknown, password?: unknown, then_demo?: unknown }>(event)
  const token = typeof body?.token === 'string' ? body.token : ''
  const phrase = typeof body?.phrase === 'string' ? body.phrase : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (phrase !== NUKE_PHRASE) throw createError({ statusCode: 400, statusMessage: 'The phrase doesn\'t match exactly' })
  const { adminPasswordHash } = useRuntimeConfig(event)
  const valid = password.length > 0 && password.length <= 1024 && await argon2.verify(adminPasswordHash, password)
  if (!valid) {
    console.warn(`[nuke] wrong password ip=${ip}`)
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }
  clearLoginAttempts(ipBucket(ip)) // A correct password counts like a login.
  takeNukeToken(token, session)

  const deleted = await nukeEverything()
  console.warn(`[nuke] DELETED EVERYTHING ip=${ip} ${JSON.stringify(deleted)}`)
  // "Load the demo" in live mode is this: everything goes first, then a fresh demo.
  const job = body?.then_demo === true ? startDemoLoad() : null
  return { deleted, job }
})
