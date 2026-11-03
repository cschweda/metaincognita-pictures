![OpenMantel: your photos on every screen in the house](docs/og-image.png)

# OpenMantel

[OpenMantel](https://openmantel.com) is a free, open source digital picture frame that you host yourself. Put a small computer behind a monitor, point it at your server, and your photos are on display.

Store-bought frames do much the same, but they often lock you into an app, a subscription, or someone else's cloud. OpenMantel runs on a small VPS or a homelab server. Your photos stay on your own server, there are no sign-ups and no tracking, and the app makes no outside requests.

OpenMantel is part of the [metaincognita](https://metaincognita.com) collection of simulations and tools. It doesn't depend on any of them.

## What it does

- **Pairs like a TV streaming stick.** A new frame shows a code. Enter it on your phone and the frame is set up for good, with no keyboard and no password on the frame.
- **Works as a remote.** From your phone, start a slideshow on every frame or just one, leaving the others as they are. Skip, go back, pause, or send any photo to a frame. Change what a frame shows, its matte color, timing, captions, and sleep hours, or schedule a preset for certain days and times. Frames update immediately. Add the admin to your home screen and it opens like an app.
- **Never crops.** Portrait, square, and panoramic photos always show in full, on a matte or a blurred backdrop, with optional captions.
- **Plays forever, in your choice of order.** Slideshows start again after the last photo. In random order, each pass is reshuffled. In sequence, they follow the order you arranged, or the playlist's order.
- **Organizes by tag.** Upload in batches, tag photos, save presets such as "Holidays", and search by file name or caption. Arrange photos by dragging, or on a phone by tapping a photo and then tapping where it goes.
- **Builds playlists.** Drag photos from your library into a playlist such as "Kitchen", in the order you want. Give each frame its own playlist, or share one between frames. A playlist isn't tied to a frame, so it survives moving a frame to another room.
- **Brings back memories.** Show photos taken on today's date in past years, on a frame or in a slideshow.
- **Keeps playing offline.** Each frame keeps a copy of the photos it has shown or fetched ahead, so it carries on without a network, even after a restart.
- **Handles iPhone photos.** Upload straight from your phone: open the admin in Safari, tap the upload area, and choose **Photo Library**. HEIC files work, photos are rotated correctly, and location data is stripped from everything a frame receives.
- **Plays anywhere you're logged in.** Any browser where you're logged in can run a full-screen slideshow, with no pairing.
- **Stays yours.** Download every original, with its tags and captions, at any time. The Stats page shows server health and roughly how many more photos will fit, and the Technical details page shows the exact version running.

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

Open `https://your-domain/login` to sign in. With Docker, a database snapshot is taken every day and kept for 14 days.

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

## License

[MIT](LICENSE)
