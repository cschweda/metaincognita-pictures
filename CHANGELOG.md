# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Nightly checked SQLite snapshots kept for 14 days, with an optional off-site copy through rclone.
- Service worker library cache and prefetching, so each frame downloads each photo once and keeps playing offline, even after a restart.
- Small offline dot on frames, and a page reload every 6 hours.
- Silent device token rotation every 30 days, with a 24-hour grace window.
- Dark admin redesign with large type, library numbers, and a bar chart of photos by tag.
- Start slideshow button that plays full screen in any logged-in browser, with no pairing.
- Tag dropdown shared by the slideshow and grid. No tag plays every photo in random order.
- Tag picker at upload, bulk tagging, hiding, and deleting in the photo grid.
- Per-frame tag filters, presets, matte, blurred backdrop, interval, order, and sleep window, all changeable from a phone.
- Instant frame updates over Server-Sent Events.
- Frame cards with the photo showing now, online status, rename, reload, and remove.
- Roku-style pairing: frames show a code, and the admin approves it after checking the screen size and IP address.
- Slideshow at `/` with cross-fades, the matte color, whole-photo display, and optional captions.
- Device config and playlist routes, with `manual`, `random`, `taken_at`, and `uploaded_at` order.
- Login session list with a sign-out button for each session.
- Minute-by-minute expiry of old pairing codes.
- HEIC uploads. The original is kept, and frame images are made from a converted copy.
- Automatic compression of originals over 8 MB, and `pnpm photos:compress` for the existing library.
- Photo upload with streaming to disk, duplicate detection, EXIF rotation, and four WebP sizes with metadata removed.
- Admin grid with cached thumbnails, a Show on frames checkbox, optional captions, and delete.
- Drag handle on each thumbnail to rearrange photos, which also works with the arrow keys.
- `/v/` image route that requires an admin session or a valid device, and `/api/auth/image` for nginx.
- `pnpm seed:ingest` to load the sample photos through the real upload route.
- `pnpm seed:fetch` for 25 sample photos in five aspect ratios.
- Phase 0 security checklist status in the README.
- pm2 ecosystem file, password hash and test device scripts, and droplet setup steps.
- `/api/health` endpoint.
- Home, login, and protected admin pages.
- Admin login, logout, and session check, with rate limiting.
- Default-deny auth middleware for admin sessions and device tokens.
- SQLite database with a migration runner and the initial schema.
- Nuxt 4 scaffold with Nuxt UI, `nuxt-security`, SQLite, and pinned pnpm 12.16.1.
- Master design (Doc 00), security design (Doc 06), and the Phase 0 kickoff prompt.
- `rebuild.sh` deploy script.
- README, MIT license, `.nvmrc`, and this changelog.

### Changed

- Subresource integrity is off, because it blocked the page and adds nothing for self-hosted files.
- File types are read by `sharp` from the file's bytes, in place of the `file-type` package.
- Icons are bundled into the client, so the browser never calls the Iconify API.
- Frames and the admin grid load images from `/v/<id>-<variant>.webp`, so the service worker can cache them. `/api/img` is removed from the design and from device routes.
- Image URLs now require an admin session or a valid device, using nginx `auth_request`. This is planned for Phase 1.
- Photos start on the droplet's disk, with a DO Volume at `/var/pictures` once disk use passes 80%.
- Root SSH login is key-only (`prohibit-password`) instead of off, because Forge may need it.
- Pairing now mints the device token on the first poll after approval and delivers it with `Set-Cookie`.
- The CSP moved from nginx to the app, using per-request nonces.
- `rebuild.sh` builds into `.output.new` and swaps it in after a successful build.
- `rebuild.sh` creates database backups with owner-only permissions.
- Phase 0 pins pnpm 12.16.1 and declares its build script policy.
- Original photos are protected by nginx config, because Forge runs nginx as the app user.
- `.gitignore` allows `.env.sample` and `.env.local`.

### Fixed

- `/api/pair/approve` is no longer covered by the public route exemption.
- `rebuild.sh` no longer exits when its log or backup folder is empty.
