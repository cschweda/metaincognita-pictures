// Role: admin. Break glass: ends every login session (this one too), deactivates every frame so
// each must be paired again, and forgets every remembered browser. Needs "sign out everything"
// typed by hand and the admin password, checked with the same lockout as logging in.
import { db } from '../../db'

const BREAK_GLASS_PHRASE = 'sign out everything'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ phrase?: unknown, password?: unknown }>(event)
  if (body?.phrase !== BREAK_GLASS_PHRASE) throw createError({ statusCode: 400, statusMessage: `Type "${BREAK_GLASS_PHRASE}" exactly` })
  await verifyAdminPassword(event, body?.password, 'sign out everything')

  const frames = db.prepare<[], { id: string }>(`SELECT id FROM devices WHERE revoked = 0`).all()
  const counts = db.transaction(() => ({
    sessions: db.prepare(`DELETE FROM sessions`).run().changes,
    frames: db.prepare(`UPDATE devices SET revoked = 1 WHERE revoked = 0`).run().changes,
    pairings: db.prepare(`DELETE FROM pairings WHERE status != 'claimed'`).run().changes,
    browsers: forgetAllBrowsers(),
  }))()
  for (const frame of frames) closeFrameStreams(frame.id)
  deleteCookie(event, 'admin_session', { path: '/' })

  logEvent(event, 'warn', 'session', `Signed out everything: ${counts.sessions} login ${counts.sessions === 1 ? 'session' : 'sessions'} and ${counts.frames} ${counts.frames === 1 ? 'frame' : 'frames'}, and forgot ${counts.browsers} remembered ${counts.browsers === 1 ? 'browser' : 'browsers'}`)
  return counts
})
