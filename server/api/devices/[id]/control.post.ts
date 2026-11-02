// Role: admin. Works a frame like a remote: next, previous, pause, or resume.
const ACTIONS = ['next', 'previous', 'pause', 'resume']

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ action?: unknown }>(event)
  const action = typeof body?.action === 'string' ? body.action : ''

  if (!ACTIONS.includes(action)) throw createError({ statusCode: 400, statusMessage: 'Unknown action' })
  if (!isFrameConnected(id)) throw createError({ statusCode: 409, statusMessage: 'That frame is offline' })

  pushToFrame(id, 'control', action)
  return { ok: true }
})
