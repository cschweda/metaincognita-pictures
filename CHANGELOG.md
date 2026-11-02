# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
