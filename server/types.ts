// Row types. These match server/db/migrations exactly.

export interface Photo {
  id: string
  filename: string
  width: number
  height: number
  taken_at: string | null
  uploaded_at: string
  hash: string
  hidden: number
  position: number
  caption: string | null
  demo: number
}

export interface Tag {
  id: string
  name: string
}

export interface Preset {
  id: string
  name: string
  filter: string
}

export interface Device {
  id: string
  name: string
  token_hash: string
  prev_token_hash: string | null
  prev_token_expires_at: string | null
  filter: string
  sort: string
  screen_w: number | null
  screen_h: number | null
  dpr: number | null
  interval_sec: number
  matte: string
  backdrop: string
  sleep_start: string | null
  sleep_end: string | null
  paired_at: string
  last_seen_at: string | null
  token_rotated_at: string | null
  revoked: number
  current_photo_id: string | null
  match_shape: number
  memories_first: number
  show_captions: number
  schedule_preset_id: string | null
  schedule_days: string
  schedule_start: string | null
  schedule_end: string | null
  playlist_id: string | null
  paused: number
  online_since: string | null
}

export interface Pairing {
  id: string
  code: string
  name: string | null
  ip: string | null
  screen_w: number | null
  screen_h: number | null
  dpr: number | null
  status: string
  device_id: string | null
  created_at: string
  expires_at: string
  claimed_at: string | null
}

export interface Session {
  id: string
  created_at: string
  last_seen_at: string
  user_agent: string | null
  ip: string | null
}

declare module 'h3' {
  interface H3EventContext {
    admin?: boolean
    device?: Device
  }
}
