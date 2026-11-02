import type { Device } from '../types'

const DORMANT_MS = 30 * 24 * 60 * 60 * 1000

/** What the admin sees. Token hashes never leave the server. */
export function publicDevice(device: Device) {
  const lastSeen = device.last_seen_at ?? device.paired_at
  return {
    id: device.id,
    name: device.name,
    filter: parseFilter(device.filter),
    sort: device.sort,
    screen_w: device.screen_w,
    screen_h: device.screen_h,
    dpr: device.dpr,
    interval_sec: device.interval_sec,
    matte: device.matte,
    backdrop: device.backdrop,
    sleep_start: device.sleep_start,
    sleep_end: device.sleep_end,
    paired_at: device.paired_at,
    last_seen_at: device.last_seen_at,
    current_photo_id: device.current_photo_id,
    revoked: device.revoked === 1,
    online: isFrameConnected(device.id),
    dormant: Date.now() - Date.parse(`${lastSeen.replace(' ', 'T')}Z`) > DORMANT_MS,
  }
}
