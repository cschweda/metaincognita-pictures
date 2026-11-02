// Role: public. Reports whether the caller has an admin session.
export default defineEventHandler(event => ({ admin: event.context.admin === true }))
