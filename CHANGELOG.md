# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Master design (Doc 00), security design (Doc 06), and the Phase 0 kickoff prompt.
- `rebuild.sh` deploy script.
- README, MIT license, `.nvmrc`, and this changelog.

### Changed

- Pairing now mints the device token on the first poll after approval and delivers it with `Set-Cookie`.
- The CSP moved from nginx to the app, using per-request nonces.
- `rebuild.sh` builds into `.output.new` and swaps it in after a successful build.

### Fixed

- `/api/pair/approve` is no longer covered by the public route exemption.
- `rebuild.sh` no longer exits when its log or backup folder is empty.
