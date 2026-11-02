// Role: admin. Tells a frame to reload its page.
export default defineEventHandler((event) => {
  pushToFrame(getRouterParam(event, 'id') ?? '', 'reload')
  return { ok: true }
})
