![OpenMantel: your photos on every screen in the house](docs/og-image.png)

# OpenMantel

[OpenMantel](https://openmantel.com) is a free, open source digital picture frame that you host yourself. Put a small computer behind a monitor, point it at your server, and your photos are on display.

Store-bought frames do much the same, but they often lock you into an app, a subscription, or someone else's cloud. OpenMantel runs on a small VPS or a homelab server. Your photos stay on your own server, there are no sign-ups and no tracking, and the app never sends anything out. Its only outside request is fetching sample photos for demo mode, and only if you use it.

OpenMantel is part of the [metaincognita](https://metaincognita.com) collection of simulations and tools. It doesn't depend on any of them.

## What it does

- **Works straight away.** A new install opens in demo mode, with 15 tagged sample photos, two playlists, and some captions, so you can try everything before adding your own. Your first upload switches it to live.
- **Pairs like a TV streaming stick.** A new frame shows a code. Enter it on your phone and the frame is set up for good, with no keyboard and no password on the frame.
- **Works as a remote.** From your phone, start a slideshow on every frame or just one, leaving the others as they are. Skip, go back, pause, or send any photo to a frame. Change what a frame shows, its matte color, timing, captions, and sleep hours, or schedule a preset for certain days and times. Frames update immediately, and each frame's card shows the photo on it now, whether it's playing or paused, and how long it's been online. New photos play next, rather than waiting their turn. Add the admin to your home screen and it opens like an app.
- **Never crops.** Portrait, square, and panoramic photos always show in full, on a matte or a blurred backdrop, with optional captions.
- **Tells you about a photo.** Tap or click a frame to see the photo's caption, date, and camera settings, and to hold it on screen. Each frame sets how long a photo stays up, a minute by default.
- **Plays forever, in your choice of order.** Slideshows start again after the last photo. In random order, each pass is reshuffled. In sequence, they follow the order you arranged, or the playlist's order.
- **Organizes by tag.** Upload in batches, tag photos, save presets such as "Holidays", and search by file name or caption. Arrange photos by dragging, or on a phone by tapping a photo and then tapping where it goes.
- **Builds playlists.** Drag photos from your library into a playlist such as "Kitchen", in the order you want. Give each frame its own playlist, or share one between frames. A playlist isn't tied to a frame, so it survives moving a frame to another room.
- **Brings back memories.** Show photos taken on today's date in past years, on a frame or in a slideshow.
- **Keeps playing offline.** Each frame keeps a copy of the photos it has shown or fetched ahead, so it carries on without a network, even after a restart.
- **Handles iPhone photos.** Upload straight from your phone: open the admin in Safari, tap the upload area, and choose **Photo Library**. HEIC files work, photos are rotated correctly, and location data is stripped from everything a frame receives.
- **Plays anywhere you're logged in.** Any browser where you're logged in can run a full-screen slideshow, with no pairing.
- **Shows what's in each photo.** The ⋮ button on any photo shows its original format, file size, compression, colour profile, camera and lens settings, location if the camera recorded one, and the frame images made from it.
- **Guards the login.** Five wrong passwords lock that address out for five minutes, and the page says how many tries are left. Browsers you've logged in from are remembered, so a flood of guesses from elsewhere can't keep you out. Logging out never stops a frame.
- **Hard to delete by accident.** One photo takes one confirmation. Deleting several needs the count typed by hand and your password. **Start over**, which deletes everything, takes four confirmations, a 10-second wait, a sentence you have to type yourself, and your password.
- **Stays yours.** Download every original, with its tags and captions, at any time. The Stats page shows server health and roughly how many more photos will fit, and the Technical details page shows the exact version running.

## Screenshots

All screenshots use the sample photos from `pnpm seed:fetch`, with two demo frames running.

**First run.** A new install opens in demo mode, with sample photos already tagged, captioned, and in two playlists. Upload a photo of your own and it goes live; any demo photos left over can then be removed in one step.

![The Photos page in demo mode: a Demo mode banner explaining the sample photos, with New demo photos and Clear everything buttons, above Start slideshow](docs/screenshots/demo.webp)

**Photos.** The admin home. Start a slideshow on every frame, one frame, or this screen, from all photos, a playlist, or a tag, in random or sequential order. A remote works the chosen frames. Below it, upload and browse the library.

![The Photos page: a large Start slideshow banner with Playlist, Tag, Order, and Play on dropdowns, a remote for both frames, an upload area, and a grid of square photo tiles](docs/screenshots/photos.webp)

**Photo details.** The ⋮ on any photo. Turn it on or off for frames, set its caption and date, send it to a frame now, or delete it. Below that: the original file's format, size, compression, and camera data, location if the camera recorded it, and the frame images made from it.

![The photo details panel: a preview, a Show on frames switch, caption and date fields, Show on a frame now and Delete buttons, then the photo's details](docs/screenshots/photo-details.webp)

**Frames.** Each frame on its own card: what it's showing now, a remote, what it shows (tags, a preset, or a playlist), how long each photo stays up (a minute by default), and its matte, backdrop, captions, sleep hours, and schedule. **Deactivate** retires it, and it has to be paired again.

![The Frames page: cards for Kitchen, showing a playlist, and Living room, showing photos tagged landscape, each with a remote, matte colours, and display options](docs/screenshots/frames.webp)

**Playlists.** The playlist beside your library. Drag photos in, drag to reorder, and drag one back to take it out. On a phone, tap Add, tap to move, and tap Take out.

![The Kitchen playlist page: numbered photos in order on the left, and the library with Add buttons on the right](docs/screenshots/playlist.webp)

**Pairing.** Open your site on the frame, and it shows a code. Enter it here, check the screen size and IP address, name the frame, and approve.

![The Pair a frame page: a code entered, the frame's screen size, IP address, and request time, a name field, and help on where the code comes from](docs/screenshots/pair.webp)

**On the wall.** A panorama in full on a 16:9 screen, with a blurred copy of the photo filling the bars and its caption.

![A frame showing a lake panorama in full, with blurred bars above and below and the caption Evening at the reservoir](docs/screenshots/frame.webp)

**Tap the frame.** A tap or click shows the photo's caption, date, camera settings, size, and tags, and holds the slideshow on it. Tap again to carry on. A frame never shows where a photo was taken.

![The same frame with a details panel in the corner: the caption, the photo's size, and its tags](docs/screenshots/frame-details.webp)

**On your phone.** The same admin, built for a phone first. Add it to your home screen and it opens like an app.

<img src="docs/screenshots/phone.webp" alt="The Photos page on a phone: the Start slideshow banner, then the Playlist, Tag, Order, and Play on dropdowns and the remote" width="320">

## Why host it yourself?

### Why isn't there a free hosted version?

Because hosting other people's family photos for free is the deal that leaves you worse off.

- **Somebody pays for every photo.** A photo and its four frame sizes take about 7 MB, so a 10,000-photo family library is about 70 GB before backups, and every frame downloads every photo it shows. A service that charges nothing pays for that some other way: ads, selling or mining what's in your photos, a subscription later, or shutting down. When a free service shuts down, the frames in your house go dark with it.
- **A service holding thousands of families' photos is a target.** It needs accounts, password resets, abuse handling, legal requests, and someone on call when it breaks. OpenMantel is built the other way: one owner and one server, with no accounts to steal and no shared database of everyone's pictures. That's a large part of why it's small enough to audit (see [Security audits](#security-audits)).
- **It's free, just not hosted.** The code is MIT licensed and always will be. What it costs you is a few dollars a month of server, which you control, instead of your photos, which you'd give up.

### Why is self-hosting the better route?

- **Your photos stay yours.** They live on a server you control. Nothing is scanned, analysed, used for training, or shown to anyone else, and location data never reaches a frame.
- **It costs less than a store-bought frame's subscription.** A VPS at about $6 a month, or a computer you already own, runs it with room for thousands of photos. There's no per-frame fee, and nobody can raise the price or switch off your frames.
- **It keeps working.** Frames keep a copy of their photos and play on without the internet, and the code can't disappear, because you have it.
- **You can see how it works.** Every line is open, it's tested, and its security audits are published below.
- **You can leave whenever you like.** Download every original with its tags and captions at any time.

The honest trade-off: you look after the server. Updating is one command, HTTPS is set up for you, and the database is snapshotted daily with Docker, but keeping an off-site backup is up to you. The [self-hosting guide](docs/self-hosting.md) covers it.

## Self-hosting

You need a server with Docker Compose, a domain name pointing at it, and ports 80 and 443 open. HTTPS is required, and the included Caddy setup gets the certificate for you.

```bash
git clone https://github.com/cschweda/openmantel.git
cd openmantel
cp .env.example .env && chmod 600 .env
```

Set `DOMAIN` in `.env`, then create the admin password. It must be at least 12 characters.

```bash
docker compose run --rm app node_modules/.bin/tsx scripts/hash-password.ts
```

Paste the line it prints into `.env`, in place of the empty `NUXT_ADMIN_PASSWORD_HASH=` line, and start OpenMantel:

```bash
docker compose up -d
```

Open `https://your-domain/login` to sign in. The first time it starts, OpenMantel fetches 15 sample photos from [Lorem Picsum](https://picsum.photos), which sources them from Unsplash, so you can try it right away. Set `NUXT_DEMO_AUTOLOAD=false` in `.env` to start with an empty library instead. With Docker, a database snapshot is taken every day and kept for 14 days.

The [self-hosting guide](docs/self-hosting.md) covers homelab setups, updating, backups and restores, running without Docker under pm2, and troubleshooting.

## Setting up a frame

Any computer with a browser and a monitor can be a frame. To try it, open your site in a browser. To run a frame full time, use the setup script for that machine. It opens the browser full screen at login, restarts it if it crashes, and keeps the screen awake.

```bash
# Mac (needs Google Chrome)
curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-mac.sh | FRAME_URL=https://your-domain bash
```

On a Mac, add `SLEEP_START=22:30 SLEEP_END=06:30` to turn the monitor off overnight. Scripts for Ubuntu, Windows, and Raspberry Pi are in [`scripts/`](scripts/).

The frame then shows a code. On your phone, log in, choose **Pair a frame**, and enter the code. Check that the screen size and IP address match the frame, give it a name, and approve it.

To retire a frame, or before moving it to another server, press **Deactivate** on its card in **Frames**. It goes back to showing a code, and has to be paired again to show photos.

So far the Mac script has only been dry-run, and the Ubuntu, Windows, and Raspberry Pi scripts haven't been tried on real frames, so reports are welcome. If a frame's disk is encrypted, as on a Mac with FileVault, someone has to log in after a power cut before it shows photos.

## Development

OpenMantel is built with Nuxt 4, Nuxt UI, and TypeScript, on Node 22 with pnpm 12, SQLite, and `sharp`.

```bash
cp .env.example .env && chmod 600 .env
pnpm install
pnpm hash-password    # paste the printed line into .env
pnpm dev              # http://localhost:3100
```

In development, log in with Chrome or Firefox. The session cookie is always `Secure`, and Safari refuses those over plain `http://localhost`.

| Command | What it does |
|---|---|
| `pnpm test` | Runs the API tests against a throwaway database. Run `pnpm build` first. |
| `pnpm typecheck` | Checks types. |
| `pnpm hash-password` | Prints an argon2id password hash for `.env`. |
| `pnpm photos:compress` | Reports how much large originals would shrink. Add `--apply` to replace them, which can't be undone. |
| `pnpm photos:rebuild` | Recreates missing frame images from the originals. Add `--all` to recreate all of them. |
| `pnpm seed:fetch` | Downloads 50 sample photos into `seed/photos/`. |
| `pnpm seed:ingest` | Uploads the sample photos. Needs the app running and `OPENMANTEL_PASSWORD` set. |
| `pnpm seed:device` | Adds a test device named `test` and prints its token. Add `--remove` to delete it. |

The design is described in [docs/00-master-design.md](docs/00-master-design.md), and the threat model in [docs/06-security.md](docs/06-security.md). Changes are listed in the [changelog](CHANGELOG.md). To report a security problem, see [SECURITY.md](SECURITY.md).

The sample photos come from [Lorem Picsum](https://picsum.photos), which sources them from Unsplash.

## Security audits

Every red/blue team audit is recorded here, newest first. The latest is listed in full. When a new one is added, the one before it is compressed to a summary under **Earlier audits**, so the record is permanent and stays short. Fixes are covered by the `audit …` regression tests in `tests/api.test.ts`. The threat model is in [docs/06-security.md](docs/06-security.md), and problems can be reported as described in [SECURITY.md](SECURITY.md).

### 2026-11-03: Red/blue team audit 1 (latest)

**Scope:** the whole app at commit `7e67c19`, plus deployment files, frame setup scripts, CI, dependencies, git history, and the production server's headers and nginx settings, which were read only.

**Method:** three red teams each attacked a throwaway local copy in one area: logins, sessions and pairing (RA); uploads, images and file serving (RF); and API logic, frames, and infrastructure (RX). Each finding needed a working proof. A separate blue team then tried every attack again on the fixed build, looked for ways around each fix, and checked for regressions. It found one bypass and two regressions, and all three were then fixed. An automated review of the fix commit found one more bypass (RX-6b), also fixed. Production was never attacked.

**Result:** 1 High, 4 Medium, 12 Low, and 6 informational findings. All are fixed except the two marked as accepted.

| ID | Finding | Severity | Mitigation |
|---|---|---|---|
| RX-1 | Anyone, without logging in, could send huge request bodies to login and pairing and run the server out of memory | High | Fixed: bodies over 64 KB (256 KB for playlists) are refused before any route reads them, and bodies with no declared length are refused. Only the photo upload, which streams with its own limits, is exempt. Caddy caps bodies too. |
| RX-2 | A frame could store any value, of any size, as the photo it was showing | Medium | Fixed: only the id of a photo that exists is stored. |
| RX-4 | A frame could hold open unlimited live connections, enough to use up nginx's connection limit | Medium | Fixed: at most two per frame; the oldest is closed. |
| RF-1 | No limit on image dimensions, so one huge image could exhaust memory | Medium | Fixed: photos over 100 megapixels are refused from the file header, before decoding. A 48-megapixel iPhone photo is accepted. |
| RF-2 | HEIC photos were decoded with no size check, and the blue team then showed the first check could be bypassed with a file whose header describes a different, smaller image | Medium | Fixed: the decoder checks the size of the image it is about to decode, before allocating any memory for it. |
| RA-1 | The client IP header was believed from anyone, letting someone dodge the per-IP login and pairing limits and fake the IP shown when approving a frame | Low | Fixed: the header is believed only from a proxy on the same machine or a private network. Login has a global limit as well. |
| RA-2 | With RA-1, the 100-pending-pairings cap could be filled to block new frames | Low | Fixed along with RA-1. |
| RX-3 | The admin's browser built an image address from a value the frame supplied | Low | Fixed: checked on the server (RX-2) and in the page. |
| RX-5 | The rate limiter never forgot an address, so a flood of addresses grew memory | Low | Fixed: swept every minute and capped. IPv6 is limited per /64, since one IPv6 host can use 2^64 addresses. |
| RX-6 | A frame could still fetch a photo after it was hidden, by its id | Low | Fixed: hidden photos are refused to frames, through `/v/` and through nginx's optional image check. |
| RX-6b | The first fix for RX-6 in nginx's image check matched a photo id anywhere in the address, so a visible photo's id in the query string could unlock a hidden one. This only affects the optional nginx image setup, which wasn't in use. | Low | Fixed: the check accepts exactly one image path and nothing else, and nginx should pass `$uri`. |
| RX-7 | One admin request could freeze the server with thousands of tag changes | Low | Fixed: at most 100 tags added or removed at a time. |
| RF-3 | An interrupted or rejected upload could leave temporary files on disk | Low | Fixed: a failed upload stops reading at once, and leftovers over an hour old are swept away. |
| RF-4 | Tags sent with an upload skipped the 40-character rule | Low | Fixed: the same checks as the Tags page, and at most 20 tags. |
| RX-9a | `.gitignore` allowed `.env.local` to be committed | Low | Fixed. No secrets were ever committed. |
| RX-9b | GitHub Actions were pinned to version tags that could be moved, while the image workflow can publish to the registry | Low | Fixed: every action is pinned to a commit. |
| OPS-1 | The production nginx config, installed by Laravel Forge, trusts `X-Forwarded-For` from Cloudflare's addresses although the site isn't behind Cloudflare. A request sent through Cloudflare could set its own client IP and undo RA-1 there. It allowed 200 MB request bodies on every path, and 768 connections per worker. | Low | Fixed by the owner on 2026-11-03: the Cloudflare file is disabled, bodies are capped at 64 KB except uploads (1 GB) and playlists (256 KB), and nginx allows 4096 connections. Checked from outside. |
| RA-3 | The frame heartbeat doesn't require the CSRF header | Info | Accepted: the frame cookie is `SameSite=Lax`, so other sites can't send it, and a heartbeat only updates that frame's own record. |
| RA-4 | Route checks used the path before `..` segments were resolved. No working bypass was found. | Info | Fixed: paths with dot segments or encoded slashes are refused. |
| RX-8 | Frame setup scripts wrote `FRAME_URL` and sleep times into launch files without checking them | Info | Fixed: only a plain `https://` address and HH:MM times are accepted. |
| RX-9c | The database file was readable by other users on the server | Info | Fixed: the database and its WAL files are created private to the app user. |
| RX-9d | In Docker, the off-site backup failed silently every night because the image has no `rclone` | Info | Fixed: it now fails with a clear message. Install `rclone` on the host, or run the backup from there. |
| RX-9e | Base images aren't pinned by digest, and `pnpm audit` reports four moderate or low issues | Info | Accepted: Dependabot updates the images, and the four advisories are in build tools only, not in what the server runs. |

**Server settings (OPS-1), applied by the owner.** If you run OpenMantel behind nginx, use the same settings:
- `client_max_body_size 64k;` for the site, raised to `1g` in `location = /api/photos` and `256k` in `location /api/playlists`.
- `client_body_timeout 30s;`
- `proxy_set_header X-Real-IP $remote_addr;`
- No `real_ip_header` that trusts a CDN you don't use.

**Held up under attack:** CSRF on every admin change; default-deny route checks, including path tricks; frames kept out of admin routes; revoking a frame takes effect at once, including live connections; logout and per-session sign-out; `HttpOnly`, `Secure`, `SameSite=Lax` cookies; fresh session ids at each login; the pairing code design and its replay check; no SQL injection anywhere; no mass assignment; frames can't use the admin preview options; no stack traces in production; location and other metadata stripped from frame images; originals never served; image file names validated; caption, file name and tag text escaped; strict CSP with nonces, HSTS, and TLS 1.3 in production; no secrets in git history.

### Earlier audits

None. This is the first red/blue team audit.

## License

[MIT](LICENSE)
