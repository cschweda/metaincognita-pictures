// SSE streams to connected frames. One process (Doc 00 §2), so a Map is enough.
export type FrameEvent = 'playlist-changed' | 'config-changed' | 'reload' | 'control' | 'show'
type Stream = ReturnType<typeof createEventStream>

const streams = new Map<string, Set<Stream>>()

export function addFrameStream(deviceId: string, stream: Stream): void {
  const set = streams.get(deviceId) ?? new Set<Stream>()
  set.add(stream)
  streams.set(deviceId, set)
}

export function removeFrameStream(deviceId: string, stream: Stream): void {
  const set = streams.get(deviceId)
  set?.delete(stream)
  if (set?.size === 0) streams.delete(deviceId)
}

export function isFrameConnected(deviceId: string): boolean {
  return streams.has(deviceId)
}

export function pushToFrame(deviceId: string, event: FrameEvent, data = '1'): void {
  for (const stream of streams.get(deviceId) ?? []) {
    stream.push({ event, data }).catch(() => undefined)
  }
}

export function pushToAllFrames(event: FrameEvent): void {
  for (const deviceId of streams.keys()) pushToFrame(deviceId, event)
}

export function closeFrameStreams(deviceId: string): void {
  for (const stream of streams.get(deviceId) ?? []) stream.close().catch(() => undefined)
  streams.delete(deviceId)
}
