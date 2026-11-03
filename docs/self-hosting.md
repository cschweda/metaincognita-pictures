# Self-hosting OpenMantel

OpenMantel runs as one Node process with SQLite. Everything it stores lives in one Docker volume.

## What you need

- A server with Docker and Docker Compose. 1 GB of RAM with 2 GB of swap works, and more helps with large HEIC photos.
- A domain or subdomain pointing at the server.
- Room for your photos, at roughly 7 MB each, plus 2 GB for the image.
- Ports 80 and 443 open, so Caddy can get a certificate.

Follow the steps in the [README](../README.md#self-hosting) to install it. `docker compose up -d` uses the prebuilt image for `linux/amd64` and `linux/arm64`. Run `docker compose build` to build your own.

## HTTPS is required

Login cookies are `Secure`, and the offline photo cache needs a secure connection. A bare address like `http://192.168.1.50` won't work, because login fails.

## In a homelab

You have a few ways to give OpenMantel a real HTTPS address at home:

- **Your existing reverse proxy.** Remove the `caddy` service from `compose.yaml`, publish the `app` service's port 3000 to your proxy, and point the proxy at it. Don't expose port 3000 to the network directly. The proxy must:
  - Set `X-Real-IP` to the client's address, overwriting anything the client sent. Rate limiting depends on this.
  - Turn off response buffering for `/api/frame/events`, or live frame updates are delayed.
  - Allow request bodies of at least 60 MB.
- **A private network.** Tailscale can issue certificates for machines on your tailnet, and it keeps OpenMantel off the public internet. Frames must be on the tailnet too.
- **A tunnel.** Cloudflare Tunnel gives a public HTTPS address with no open ports.

Whatever sits in front, it must set `X-Real-IP` to the real client address, overwriting any value the client sent. OpenMantel believes that header only from a proxy on the same machine or a private network, and uses it for login and pairing limits and for the IP shown when you approve a frame. `cloudflared` and `tailscale serve` don't set it themselves, so put Caddy or nginx between them and the app, or the limits work per proxy rather than per visitor. Keep request bodies small everywhere except `POST /api/photos`, which needs about 1 GB for 20 photos at once; the app refuses other bodies over 64 KB (256 KB for playlists) itself.
- **A real domain with a DNS challenge.** Point a domain at the private address and use your proxy's DNS challenge support.

Internal certificates work too, as long as every frame and phone trusts your certificate authority.

## Updating

```bash
git pull
docker compose pull
docker compose up -d
```

Database migrations run at startup.

## Backups

Your data is in the `pictures` volume: `pictures.db`, `orig/` for original photos, and `v/` for frame images.

The `backup` service takes a checked database snapshot a minute after it starts and every 24 hours after that, in `/data/backups`, and keeps 14 days. Those snapshots are on the same disk as your photos, so back up the volume or the whole server as well. A VPS provider's backup feature does this, unless the data is on a separate attached volume.

To restore:

1. Run `docker compose stop app`.
2. Restore the volume, or restore one snapshot, using its real file name:

   ```bash
   docker compose exec backup sh -c 'cp /data/backups/nightly-YYYYMMDD.db /data/pictures.db && rm -f /data/pictures.db-wal /data/pictures.db-shm'
   ```

3. Run `docker compose start app`.
4. If `v/` was lost, recreate the frame images:

   ```bash
   docker compose exec app node_modules/.bin/tsx scripts/rebuild-variants.ts
   ```

## Changing the password

Run the password command from the README, put the new line in `.env`, and run `docker compose up -d`. Existing logins stay active until you sign them out on the **Sessions** page. Frames aren't affected.

## Troubleshooting

| Problem | What to check |
|---|---|
| The certificate isn't issued | Check that DNS points at the server and ports 80 and 443 are open. See `docker compose logs caddy`. |
| Login gives an error | `NUXT_ADMIN_PASSWORD_HASH` is probably empty. Keep the single quotes around it in `.env`. |
| Login does nothing on a home address | The site isn't on HTTPS. |
| Frames don't update instantly | A proxy is buffering `/api/frame/events`. |
| "Too many attempts" | Wait, up to 5 minutes. If everyone is affected, your proxy may not be setting `X-Real-IP`. |

## Without Docker

Run Node 22 and pnpm behind any HTTPS reverse proxy, with the same proxy settings as above:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Set absolute paths in `.env`, then start it with `pm2 start ecosystem.config.cjs`. That binds to `127.0.0.1:3100`. `./rebuild.sh` pulls, builds, backs up, restarts, and checks the health route. On a small server, a 2 GB swapfile plus `NODE_OPTIONS=--max-old-space-size=1536` lets the build finish; `rebuild.sh` sets that option for you. Schedule `scripts/backup.sh` with cron.
