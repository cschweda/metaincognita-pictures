// Role: admin. Deletes every photo, frame, playlist, tag, and preset. Needs the token from
// /api/nuke/start, at least 10 seconds old, plus the exact phrase and the admin password, checked
// with the same lockout as logging in.
export default defineEventHandler(async (event) => {
  const session = currentSessionRef(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ token?: unknown, phrase?: unknown, password?: unknown, then_demo?: unknown }>(event)
  const token = typeof body?.token === 'string' ? body.token : ''
  const phrase = typeof body?.phrase === 'string' ? body.phrase : ''

  if (phrase !== NUKE_PHRASE) throw createError({ statusCode: 400, statusMessage: 'The phrase doesn\'t match exactly' })
  await verifyAdminPassword(event, body?.password, 'Start over')
  takeNukeToken(token, session)

  const deleted = await nukeEverything()
  logEvent(event, 'warn', 'delete', `Start over: deleted ${deleted.photos} photos, ${deleted.frames} frames, ${deleted.playlists} playlists, ${deleted.tags} tags, and ${deleted.presets} presets${body?.then_demo === true ? ', then loaded the demo' : ''}`)
  // "Load the demo" in live mode is this: everything goes first, then a fresh demo.
  const job = body?.then_demo === true ? startDemoLoad() : null
  return { deleted, job }
})
