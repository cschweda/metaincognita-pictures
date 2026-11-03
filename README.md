![OpenMantel: your photos on every screen in the house](docs/og-image.png)

# OpenMantel

[OpenMantel](https://openmantel.com) is a free, open source picture frame you host yourself. Put a small computer behind a monitor on the kitchen counter, plug it in, and your photos are on display. Store-bought digital frames do the same thing for a lot more money, and often with a subscription or someone else's cloud.

OpenMantel is part of the [metaincognita](https://metaincognita.com) suite of simulations and tools, and it stands entirely on its own. Run it on a small VPS, with 1 GB of RAM and swap, or add it to your homelab. Your photos stay on your server. There are no accounts and no tracking, and the app makes no outside requests.

## What it does

- **Pairs like a Roku.** A frame shows a code, you enter it on your phone, and it never asks again. Frames need no keyboard and no password.
- **Runs from your phone.** Skip, go back, pause, or send a photo to any frame like a remote, and change what it shows, its matte color, timing, sleep hours, and a schedule for showing a preset on certain days. Frames update instantly. Add the admin to your home screen and it opens like an app.
- **Never crops.** Portrait, square, and panoramic photos all show in full, on a matte or a blurred backdrop, with optional captions.
- **Organizes by tag.** Upload in batches, tag photos, drag them into order, save presets like "Holidays", and search by name or caption.
- **Brings back memories.** Show photos from today's date in past years, on a frame or in a slideshow.
- **Keeps playing offline.** Each frame keeps a copy of the photos it has shown or fetched ahead, so it keeps going without a network, even after its page reloads.
- **Takes iPhone photos.** HEIC works, and photos are rotated correctly. Location data is removed from everything a frame receives.
- **Starts a slideshow anywhere.** Any logged-in browser can play one full screen, with no pairing.
- **Stays yours.** Download every original with its tags and captions at any time. It also takes daily database snapshots and shows server health and remaining space.

## Self-hosting

You need a server with Docker Compose and a domain name pointing at it, with ports 80 and 443 open. HTTPS is required, and the included setup gets the certificate for you. Passwords need at least 12 characters.

```bash
git clone https://github.com/cschweda/openmantel.git
cd openmantel
cp .env.example .env && chmod 600 .env
```

Set `DOMAIN` in `.env`, then create your admin password:

```bash
docker compose run --rm app node_modules/.bin/tsx scripts/hash-password.ts
```

Paste the line it prints into `.env`, replacing the empty `NUXT_ADMIN_PASSWORD_HASH=` line. Then start it:

```bash
docker compose up -d
```

Open `https://your-domain/login`. See [docs/self-hosting.md](docs/self-hosting.md) for homelab setups, updates, backups, and troubleshooting.

## Setting up a frame

Any computer with a browser and a monitor can be a frame. Open your site in a browser to try it. To run one full time, use the script for that machine. It starts the browser full screen at login, restarts it after a crash, and keeps the screen on. On a Mac, add `SLEEP_START=22:30 SLEEP_END=06:30` to turn the monitor off overnight.

```bash
# Mac (needs Google Chrome)
curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-mac.sh | FRAME_URL=https://your-domain bash
```

Ubuntu, Windows, and Raspberry Pi scripts are in [`scripts/`](scripts/). The frame shows a code. Log in on your phone, choose **Pair a frame**, enter the code, check the screen size and IP address, name the frame, and approve it.

The Mac script has only been dry-run, and the Ubuntu, Windows, and Raspberry Pi scripts haven't been run on real frames at all, so reports are welcome. A frame needs someone to log in after a power cut if its disk is encrypted, such as a Mac with FileVault.

## Development

Nuxt 4, Nuxt UI, TypeScript, and pnpm 12 on Node 22, with SQLite and `sharp`.

```bash
cp .env.example .env && chmod 600 .env
pnpm install
pnpm hash-password    # paste the printed line into .env
pnpm dev              # http://localhost:3100
```

Log in with Chrome or Firefox in dev. The session cookie is always `Secure`, and Safari refuses those over plain `http://localhost`.

| Command | Purpose |
|---|---|
| `pnpm test` | Run the API tests, using a throwaway database. Run `pnpm build` first |
| `pnpm typecheck` | Check types |
| `pnpm hash-password` | Print an argon2id hash for `.env` |
| `pnpm photos:compress` | Report how much large originals would shrink; add `--apply` to replace them, which can't be undone |
| `pnpm photos:rebuild` | Rebuild missing frame images from the originals; add `--all` to rebuild every one |
| `pnpm seed:fetch` | Download 50 sample photos into `seed/photos/` |
| `pnpm seed:ingest` | Upload those photos; needs the app running and `OPENMANTEL_PASSWORD` set |
| `pnpm seed:device` | Add a device named `test` and print its token; add `--remove` to delete it |

The design is in [docs/00-master-design.md](docs/00-master-design.md), and the threat model is in [docs/06-security.md](docs/06-security.md).

Sample photos come from [Lorem Picsum](https://picsum.photos), which sources them from Unsplash.

## License

[MIT](LICENSE)
