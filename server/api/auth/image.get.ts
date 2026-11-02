// Role: public, so nginx auth_request gets a plain 204 or 401. Allows an admin or a device.
export default defineEventHandler((event) => {
  if (!event.context.admin && !event.context.device) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  setResponseStatus(event, 204)
  return null
})
