// Role: device. Live updates, so changes from the phone reach the frame right away.
const PING_MS = 25_000

export default defineEventHandler((event) => {
  const deviceId = event.context.device!.id
  const stream = createEventStream(event)
  addFrameStream(deviceId, stream)

  const ping = setInterval(() => {
    stream.push({ event: 'ping', data: '1' }).catch(() => undefined)
  }, PING_MS)

  stream.onClosed(async () => {
    clearInterval(ping)
    removeFrameStream(deviceId, stream)
    await stream.close()
  })
  return stream.send()
})
