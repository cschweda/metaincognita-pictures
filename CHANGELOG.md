# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Default-deny auth middleware for admin sessions and device tokens.
- SQLite database with a migration runner and the initial schema.
- Nuxt 4 scaffold with Nuxt UI, `nuxt-security`, SQLite, and pinned pnpm 12.16.1.
- Master design (Doc 00), security design (Doc 06), and the Phase 0 kickoff prompt.
- `rebuild.sh` deploy script.
- README, MIT license, `.nvmrc`, and this changelog.

### Changed

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
