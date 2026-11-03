import type { H3Event } from 'h3'
import type { Device } from '../types'

const DORMANT_MS = 30 * 24 * 60 * 60 * 1000
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60 // The longest a browser keeps a cookie.

/** HTTP-only, so frame JavaScript never sees the token. */
export function setDeviceCookie(event: H3Event, token: string): void {
  setCookie(event, 'device_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
}

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
    match_shape: device.match_shape === 1,
    memories_first: device.memories_first === 1,
    show_captions: device.show_captions === 1,
    schedule_preset_id: device.schedule_preset_id,
    playlist_id: device.playlist_id,
    schedule_days: JSON.parse(device.schedule_days) as number[],
    schedule_start: device.schedule_start,
    schedule_end: device.schedule_end,
    revoked: device.revoked === 1,
    online: isFrameConnected(device.id),
    dormant: Date.now() - Date.parse(`${lastSeen.replace(' ', 'T')}Z`) > DORMANT_MS,
  }
}
