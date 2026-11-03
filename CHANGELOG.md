# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Playlists: named, hand-picked sets of photos in their own order. Drag photos in from the library, drag to reorder, and drag one back out, with tap buttons on phones. Add selected photos from the grid, or start a new playlist from them. A frame shows either its tags or a playlist, in playlist order or shuffled, and playlists appear in the Show dropdown.
- Start slideshow plays on all frames, one frame, or this screen, and leaves other frames as they are. A remote beside it works the chosen frames.
- A large Deactivate button on each frame, with an "are you sure" dialog. A deactivated frame goes back to its pairing screen.
- Technical details page in the admin, showing the version, commit, build time, Node, SQLite and schema migrations, library versions, and storage paths, with a summary to copy into bug reports. The Docker image records its commit for it.
- GitHub link in the admin navigation.
- Order for the admin slideshow, next to the tag dropdown: Random, the default, or Sequential, in your arranged order.
- Rearrange view: a compact grid where you hold and drag, or tap a photo and tap where it goes. It replaces the drag handle on phones.
- Captions on or off for each frame.
- Schedules: a frame can switch to a preset on chosen days and times, using its own clock.
- Show on a frame: send any photo to an online frame from the grid.
- Monitor off overnight on Macs, with `SLEEP_START` and `SLEEP_END`.
- Option to skip photos that don't suit a frame's screen shape.
- On this day, in the tag dropdown and as a frame option.
- Download all photos, as a .tar file with a manifest.
- Add-to-home-screen support for the admin.
- Upload progress bar, photo dates, Arrange by date, and bulk captions and dates.
- `SECURITY.md` and Dependabot.
- Clicking a thumbnail opens that photo in the full screen slideshow.
- Project site for openmantel.com, published with GitHub Pages.
- Phone remote on each online frame: previous, pause, resume, and next.
- Docker Compose self-hosting with automatic HTTPS, nightly backups, and a prebuilt image.
- Self-hosting guide, and the OpenMantel name, README, social image, and openmantel.com.
- Tags tab for renaming and deleting tags, and search by file name or caption in the photo grid.
- Frame setup scripts for Mac, Ubuntu, Windows, and Raspberry Pi.
- `pnpm photos:rebuild` to recreate frame images from originals.
- API tests, type checking, and a GitHub Actions workflow that runs both.
- The Frames page says how many frames are online, and lists online frames first.
- 25 more sample photos, tagged by what they show, with 14 new tags.
- Stats tab with library totals, live CPU, memory, swap, and disk use, and roughly how many more photos will fit.
- Left and right arrow keys to change photos in the slideshow.
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
- pm2 ecosystem file, password hash and test device scripts, and server setup steps.
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

- `rebuild.sh` refuses to start while another rebuild is running in the same folder, and stops before restarting if a build is missing its server dependencies. Two overlapping runs had swapped in a broken build.
- README rewritten for accuracy and clarity.
- Slideshows never stop. After the last photo they start again, with a fresh shuffle each time round in random order, and a new round never opens on the photo that just ended the last one.
- A tagged admin slideshow now plays at random unless you choose Sequential. Before, it always played in your arranged order.
- Frame setup scripts use OpenMantel names for their launch agents, services, and shortcuts, and clean up installs made under the old names. A Mac frame keeps its pairing.
- `pnpm seed:ingest` reads `OPENMANTEL_PASSWORD` and `OPENMANTEL_SESSION`. The old `PICTURES_` names still work.
- The prebuilt image builds each architecture on its own native runner, with a 30-minute limit, and is also tagged with the commit. Emulated arm64 builds were hanging, so `latest` had stopped updating.
- Dependabot no longer proposes TypeScript or Node major versions; those move by hand.
- Tested 48-megapixel HEIC uploads: about 27 seconds on a 1 GB server, with no app restart.
- Prebuilt image builds now cancel when a newer commit arrives, so older code can't overwrite `latest`.
- Passwords need at least 12 characters.
- The Docker backup service takes its first snapshot at start.
- Frame setup no longer suggests automatic login, because FileVault prevents it.
- The project is now named OpenMantel, along with its repository and Docker image.
- Scripts and docs no longer assume one particular server or domain.
- Captions sit on a semi-transparent, edge-to-edge band, so they read on the lightest photos.
- The admin opens on the photo library, with frames on their own tab.
- Session ids are stored as hashes, so database backups can't be used to log in. Everyone logs in again once.
- Subresource integrity is off, because it blocked the page and adds nothing for self-hosted files.
- File types are read by `sharp` from the file's bytes, in place of the `file-type` package.
- Icons are bundled into the client, so the browser never calls the Iconify API.
- Frames and the admin grid load images from `/v/<id>-<variant>.webp`, so the service worker can cache them. `/api/img` is removed from the design and from device routes.
- Image URLs now require an admin session or a valid device, using nginx `auth_request`. This is planned for Phase 1.
- Pairing now mints the device token on the first poll after approval and delivers it with `Set-Cookie`.
- The CSP moved from nginx to the app, using per-request nonces.
- `rebuild.sh` builds into `.output.new` and swaps it in after a successful build.
- `rebuild.sh` creates database backups with owner-only permissions.
- Phase 0 pins pnpm 12.16.1 and declares its build script policy.
- The proxy config, not file permissions, keeps original photos private.
- `.gitignore` allows `.env.sample` and `.env.local`.

### Fixed

- Dragging photos works on touch screens, and phones also get Earlier and Later buttons.
- Builds on 1 GB servers no longer run out of Node heap.
- Esc now leaves the slideshow in full screen, where the browser would otherwise keep the key.
- Frame cards no longer overflow on phones, and a new frame's thumbnail appears right away.
- `/api/pair/approve` is no longer covered by the public route exemption.
- `rebuild.sh` no longer exits when its log or backup folder is empty.
