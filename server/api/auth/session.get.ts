// Role: public. Reports whether the caller has an admin session or is a paired frame, so the
// frame page can send an unpaired screen to pairing without asking for anything it would be refused.
export default defineEventHandler(event => ({
  admin: event.context.admin === true,
  device: Boolean(event.context.device),
}))
