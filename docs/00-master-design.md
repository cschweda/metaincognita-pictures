# pictures.metaincognita.com — Doc 00: Master Design

**Project:** Cloud-based digital picture frame
**Owner:** Chris Schweda
**Status:** Draft v0.1 — 2026-11-02

---

## 1. Summary

A single Nuxt app on the DigitalOcean droplet serves two audiences:

- **Admin (you, on a real computer or phone):** log in, upload and tag photos, pair frames, and change what each frame is showing from your phone at any time.
- **Frames (Pi 5 / mini-PC with a small monitor, no keyboard):** a full-screen browser pointed at the site, showing a slideshow. Frames pair once using a Roku-style code and then never ask again.

All logic lives on the server. The frame is a dumb kiosk.

## 2. Stack

| Layer | Choice |
|---|---|
| App | Nuxt 4, Nuxt UI v4, pnpm |
| Runtime | Node 22 on the droplet (Forge-managed), behind nginx with Let's Encrypt |
| Database | SQLite via `better-sqlite3` (single file, WAL mode) |
| Images | `sharp` for resizing; originals and variants on local disk (`/var/pictures/`) |
| Process | pm2 with an `ecosystem.config.cjs`, running `.output/server/index.mjs` after `nuxt build`; `pm2 save` + `pm2 startup` so it survives reboots |
| Push to frames | Server-Sent Events from Nitro (one-way, cheap) |

This is a server-heavy app (persistent storage, long-running SSE, image processing), so it does not fit Netlify — droplet is correct.

### Process management (pm2)

`ecosystem.config.cjs` at the repo root, deployed with the app. Every path and secret lives in `.env` (mode 600, never committed); the ecosystem file loads it and holds no secrets. `.env` is the single source because the production server does not read it on its own and `rebuild.sh` reads `NUXT_DB_PATH` from it for backups.

```js
const { parsed: dotenv = {} } = require('dotenv').config({ path: `${__dirname}/.env`, quiet: true })

module.exports = {
  apps: [{
    name: 'pictures',
    script: '.output/server/index.mjs',
    cwd: '/home/forge/pictures.metaincognita.com',
    instances: 1,                 // SQLite + SSE: keep to one process, no cluster mode
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '400M',
    env: {
      ...dotenv,                  // NUXT_ADMIN_PASSWORD_HASH, NUXT_DB_PATH, NUXT_PICTURES_DIR
      NODE_ENV: 'production',
      PORT: 3100,
      HOST: '127.0.0.1',
    },
    error_file: '/home/forge/.pm2/logs/pictures-error.log',
    out_file:   '/home/forge/.pm2/logs/pictures-out.log',
    time: true,
  }],
}
```

Deploy with `./rebuild.sh`, the only deploy path. It builds into `.output.new` and swaps it into `.output` only after the build succeeds, so a failed build leaves the running site alone. This needs `nitro.output.dir` in `nuxt.config.ts` to read `BUILD_OUTPUT_DIR`, defaulting to `.output`. Nginx proxies `pictures.metaincognita.com` → `127.0.0.1:3100` with `proxy_buffering off` on the `/api/frame/events` location so SSE streams through.

Nginx sets `proxy_set_header X-Real-IP $remote_addr` on every proxied location, overwriting anything the client sent. The app takes the client IP from that header only, falling back to the socket address in dev. Without this every request appears to come from `127.0.0.1`, which breaks the per-IP rate limit and the IP shown on the pairing screen.

`instances: 1` is deliberate: cluster mode would give each worker its own SSE client list and compete for the SQLite write lock. One process handles a handful of frames trivially.

## 3. Roles and sessions

Two completely separate session types.

**Admin session**
- One user (you). Password stored as an Argon2 hash in `.env` or a `users` row; passkeys optional later.
- Normal HTTP-only, Secure, SameSite=Lax cookie. 14-day expiry, sliding.
- Can do everything.

**Device token**
- Issued only through the pairing flow below.
- Random 32-byte token, stored hashed (SHA-256) in `devices`. Sent as an HTTP-only cookie scoped to the frame.
- Read-only: can list its own playlist, fetch image variants, open the SSE stream, report heartbeat. Nothing else.
- Does not expire. Revocable from the admin page. Server rotates it silently every 30 days via `Set-Cookie` on the heartbeat response. Frame JavaScript never sees the token, because it can't read or write an HTTP-only cookie.

## 4. Pairing flow (Roku-style)

```
Frame                              Server                         Phone (admin)
  │ GET /                             │                               │
  │ no device cookie → shows /pair    │                               │
  │ POST /api/pair/start ────────────▶│ create pairing row            │
  │ ◀── { pairing_id, code: "WXK7-4M" }                               │
  │ shows code full-screen            │                               │
  │ GET /api/pair/poll?id=… (every 3s)│                               │
  │                                   │ ◀── GET /admin/pair ──────────│ (login if needed)
  │                                   │ ◀── POST /api/pair/approve ───│ { code, name: "Kitchen" }
  │                                   │ mark approved, store name     │
  │ GET /api/pair/poll?id=… ─────────▶│ mint token, create device,    │
  │                                   │ mark claimed (one transaction)│
  │ ◀── { status:"approved" } + Set-Cookie: device_token              │
  │ reloads → slideshow               │                               │
```

Rules:
- The raw token is never stored. It is minted on the first poll after approval, which is why the `devices` row is created there and not at approval. `approve` stores the name on the pairing row and resets `expires_at` to 10 minutes from then, so the frame has time to claim it.
- Code: 6 characters from an unambiguous alphabet (no 0/O/1/I), shown as `XXX-XXX`. Expires in 10 minutes. One attempt per code; rate-limit approvals.
- Optional convenience: on `start`, email yourself a link to `/admin/pair?code=WXK7-4M` via Gmail SMTP so approving is one tap. The email is a shortcut into the same flow, not a separate mechanism.
- Frame reports `screen.width × screen.height` and `devicePixelRatio` at pair time; stored on the device row and used to pick image variants. `start` also records the requester's IP on the pairing row for the approval screen.

## 5. Data model (SQLite)

```sql
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,          -- ulid
  filename      TEXT NOT NULL,             -- original name
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  taken_at      TEXT,                      -- from EXIF if present
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
  hash          TEXT NOT NULL UNIQUE,      -- sha256 of original, dedupe
  hidden        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE   -- "travel", "fall", "italy 2024"
);

CREATE TABLE photo_tags (
  photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
  tag_id   TEXT REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);
CREATE INDEX photo_tags_tag ON photo_tags(tag_id);

-- A saved filter you can apply to a frame with one tap.
CREATE TABLE presets (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,                     -- "Holidays", "Grandkids", "Everything"
  filter  TEXT NOT NULL                      -- JSON, same shape as devices.filter
);

CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,             -- "Kitchen", "Office Pi"
  token_hash    TEXT NOT NULL UNIQUE,
  prev_token_hash       TEXT UNIQUE,         -- previous token, valid during rotation grace
  prev_token_expires_at TEXT,                -- 24 hours after rotation
  filter        TEXT NOT NULL DEFAULT '{"tags":[],"mode":"any"}',  -- JSON, see below
  sort          TEXT NOT NULL DEFAULT 'random',   -- random | taken_at | uploaded_at
  screen_w      INTEGER, screen_h INTEGER, dpr REAL,
  interval_sec  INTEGER NOT NULL DEFAULT 30,
  matte         TEXT NOT NULL DEFAULT '#000000',  -- CSS color behind the photo
  backdrop      TEXT NOT NULL DEFAULT 'solid',    -- solid (matte fills bars) | blur
  sleep_start   TEXT, sleep_end TEXT,      -- "23:00", "06:30" local
  paired_at     TEXT NOT NULL,
  last_seen_at  TEXT,
  token_rotated_at TEXT,
  revoked       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pairings (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT,                             -- set by approve; becomes devices.name
  ip          TEXT,                             -- requester, shown on the approval screen
  screen_w    INTEGER, screen_h INTEGER, dpr REAL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | claimed | expired
  device_id   TEXT REFERENCES devices(id),      -- set when claimed
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  claimed_at  TEXT                              -- kept 24 hours to detect replayed polls
);
```

### Tags and filters

Photos carry zero or more tags; a photo can be both `travel` and `fall`. Tags are assigned at upload (a type-ahead picker on the upload form applies the chosen tags to the whole batch; new tags are created inline) and can be bulk-added or removed later by selecting photos in the grid.

A frame shows a **filter**, not a fixed album:

```json
{ "tags": ["travel", "fall"], "mode": "any" }
```

- `mode: "any"` — photos with travel OR fall
- `mode: "all"` — photos with travel AND fall
- `tags: []` — everything

The playlist endpoint turns the filter into one query (`EXISTS` for `any`, a `HAVING COUNT(DISTINCT tag_id) = n` for `all`) and applies the device's `sort`. The frame never knows about tags; it just receives ids.

Presets store a named filter so a frame can be switched to "Holidays" with one tap instead of toggling tags.

## 6. Image pipeline

On upload (admin only, multipart, up to ~50 MB each, batch allowed):

1. Compute SHA-256; reject duplicates.
2. Read EXIF with `sharp().metadata()` for orientation and `taken_at`; auto-rotate.
3. Write original to `/var/pictures/orig/<id>.<ext>`.
4. Generate variants as WebP, quality 82, longest edge: **640, 1280, 1920, 2560**. Store at `/var/pictures/v/<id>-<size>.webp`.
5. Insert `photos` row. Done synchronously for small batches; move to a tiny in-process queue if uploads of 100+ become normal.

Frames request `/api/img/<id>?w=<screen_w*dpr>`; server picks the smallest variant ≥ requested width. Nginx serves `/var/pictures/v/` with long cache headers, and every request passes `auth_request` first (Doc 06 §7); the Nitro route only resolves which file and issues an internal redirect (`X-Accel-Redirect`).

**Disk.** Photos start on the droplet's disk, which holds about 2,000 photos at an estimated 7 MB each (original plus four variants). When disk use passes 80%, mount a DO Volume at `/var/pictures`. All paths stay the same.

## 7. API surface

**Public / pairing**
- `POST /api/pair/start` → `{ pairing_id, code, expires_at }`
- `GET  /api/pair/poll?id=` → `{ status }`; the first poll after approval also sets the `device_token` cookie

**Device (device cookie required)**
- `GET  /api/frame/config` → interval, sleep window, matte, backdrop, variant width
- `GET  /api/frame/playlist?after=&limit=200` → ordered photo ids matching this device's filter, paged (server shuffles with a per-device seed if `random`, so paging stays stable)
- `GET  /api/img/:id?w=` → image bytes (via nginx)
- `GET  /api/frame/events` → SSE: `playlist-changed`, `config-changed`, `reload`
- `POST /api/frame/heartbeat` → updates `last_seen_at`; response may set a rotated `device_token` cookie

**Admin (admin cookie required)**
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` → `{ admin: boolean }` (these three are public, so the login page can reach them)
- `GET /api/auth/image` → 204 for an admin session or a valid device, otherwise 401 (public route; called by nginx `auth_request`)
- `POST /api/photos` (upload), `GET /api/photos`, `PATCH /api/photos/:id`, `DELETE /api/photos/:id`
- `GET/POST/PATCH/DELETE /api/tags`
- `POST /api/photos/tags` `{ photo_ids, add: [tag_id], remove: [tag_id] }` (bulk)
- `GET/POST/PATCH/DELETE /api/presets`
- `GET /api/devices`, `PATCH /api/devices/:id` (name, filter, sort, interval, matte, backdrop, sleep window — saving `filter` pushes `playlist-changed` over SSE; other fields push `config-changed`), `POST /api/devices/:id/revoke`, `POST /api/devices/:id/reload`
- `POST /api/pair/approve` `{ code, name }`

## 7a. Admin on the phone

The admin home (`/admin`) is built for a phone first. It is a list of frames; each card shows the frame's name, a thumbnail of the photo it is showing now, a last-seen time, and a tag selector inline. Tap a tag chip to toggle it, pick `any`/`all`, or tap a preset. A second row on each card holds the display settings: matte color swatches, solid/blur, interval, sleep window. Saving updates `devices.filter`, the server emits `playlist-changed` on that frame's SSE stream, and the frame refetches its playlist; the next transition is already from the new set. No reload, no re-pairing.

Upload also works from the phone (share sheet → browser → upload form with tag picker), but the desktop grid is where bulk tagging and cleanup happen.

## 8. Frame client (`/` when device cookie present)

- Single page, no chrome. The page background is the device's **matte color** (default black).
- **Aspect ratio: never crop.** The image is `object-fit: contain; object-position: center` inside a full-viewport box, so the whole photo is always visible and any unused space (top/bottom for a wide photo on a tall screen, left/right for a portrait photo on a landscape screen) shows the matte. No `cover`, no zoom, no pan. Portrait, square, panoramic, and 4:3 all show in full.
- **Matte** is per device and changed from the phone like everything else: `matte` is any CSS color (`#000000` default), with quick picks in the admin UI for black, white, warm white, mid grey, and charcoal plus a color input for anything else. `backdrop` chooses between `solid` (the matte color fills the bars) and `blur` (a blurred, scaled copy of the photo fills them; the matte shows only during cross-fades). Saving either pushes `config-changed` and the frame repaints on the next slide.
- Two stacked `<img>` layers; next image preloaded, 1-second cross-fade. Respects `prefers-reduced-motion`.
- Fetches the first playlist page on load and on SSE `playlist-changed`; fetches the next page when within 20 ids of the end; advances every `interval_sec`.
- Sleep window: renders solid black and stops fetching. Frame stays paired.
- Offline resilience: if a fetch fails, keep cycling the local cache; show a small dim dot in a corner so you know it's offline.
- Self-reloads every 6 hours (Chromium memory hygiene) and on SSE `reload`.
- Requests a screen wake lock; harmless if refused.

### Frame-side caching (bandwidth)

Goal: each frame downloads each photo once. After the first pass through its playlist, a frame pulls only new uploads.

- **HTTP layer.** Variant URLs are immutable (`/v/<id>-<size>.webp`); nginx sends `Cache-Control: private, max-age=31536000, immutable`. Chromium's own cache then skips re-downloads for free, but it evicts under disk pressure, so it is a bonus, not the mechanism.
- **Service worker + Cache API.** The SW intercepts `/v/*` requests: cache-first, and on a miss fetch from the network and store. Nothing is evicted by age; the cache is the frame's local copy of its library. A 10k-photo library at the 1920 size is ~4 GB, which fits on a 32 GB card or any mini-PC SSD. The SW also caches the current playlist page so a cold start offline still has something to show.
- **Prefetch.** The page tells the SW to warm the next 20 ids in the playlist, so the first pass never shows a loading gap and the frame is idle most of the time.
- **Budget.** The SW checks `navigator.storage.estimate()`; when usage passes 80% of quota it evicts least-recently-displayed entries. Call `navigator.storage.persist()` once so Chromium doesn't clear the cache on its own.
- **Invalidation.** Photo ids never change, so there is nothing to invalidate. A deleted photo simply stops appearing in playlists; the SW drops entries not seen in any playlist for 30 days.

Net transfer: roughly library size × number of frames, once, then a few MB a week. Well inside the droplet's included transfer.

## 9. Kiosk setup (Pi OS Bookworm/Trixie, Wayland/labwc)

`~/.config/labwc/autostart`:
```
chromium --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required \
  https://pictures.metaincognita.com &
```
Plus: disable screen blanking in `raspi-config`, hide cursor (`unclutter` or labwc's cursor timeout), and wrap the launch in a systemd user service with `Restart=always` so a browser crash doesn't leave a black screen.

Mini-PCs on Ubuntu: same Chromium flags from a GNOME autostart `.desktop` entry, or a dedicated kiosk user with auto-login. Windows: a shortcut in `shell:startup` with `--kiosk`.

## 10. Security (summary — see Doc 06)

The three that matter most: SSH/firewall hardening with Node bound to localhost; read-only device scope enforced by a single route-group middleware; a pairing approval screen that shows the requester's IP and screen size so you never approve a pairing you didn't start.

Also: Argon2id admin password with IP and global rate limits; server-side sessions with a revoke list; CSRF header on state-changing routes; device tokens hashed at rest, returned once, rotated with a 24-hour grace window; `orig/` never served over HTTP; EXIF stripped from variants; strict CSP since nothing third-party loads.

Backups: nightly `sqlite3 .backup` + rsync of `/var/pictures/orig/` to DO Spaces with a write-only key. Variants are regenerable.

Full threat model, controls, and the Phase 2 ship checklist are in Doc 06.

## 11. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Admin login, upload, variants, photo grid | You can upload from your PC and see thumbnails |
| 2 | Pairing flow, device tokens, bare slideshow | A Pi shows a code, you approve on phone, photos cycle |
| 3 | Tags at upload, bulk tagging, per-frame filter + presets on the phone, sleep window, SSE | Toggle "fall" on for the kitchen frame from your phone; it switches on the next slide |
| 4 | Service worker library cache + prefetch, auto-reload, heartbeat, token rotation | Unplug the router; frame keeps going. Reconnect; bandwidth graph on DO stays flat |
| 5 | Device admin page (last seen, revoke, rename), backups | You can retire a frame without touching it |

## 12. Open questions

- One admin user hard-coded, or a `users` table from the start? (Leaning: one user in `.env`, add table only if you ever share it.)
- Email-the-pairing-link convenience: worth it in Phase 2, or wait and see if typing a 6-char code is annoying enough?
- Scheduled filters ("Holidays" on weekends, "Everything" otherwise): same row shape as the sleep window; defer until a frame has been on the wall a month.
- Variant sizes: are any frames going to be portrait? If so, generate variants by longest edge (as planned) and let `contain` handle it — no separate portrait set needed.
- HEIC uploads from an iPhone: `sharp` needs libheif; the droplet build may need `apt install libheif-dev` or convert on the phone side.
