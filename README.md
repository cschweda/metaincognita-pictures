# pictures

A self-hosted, cloud-based digital picture frame for one user. A single Nuxt app serves two audiences:

- **Admin:** log in from a computer or phone to upload and tag photos, pair frames, and change what each frame shows.
- **Frames:** a Raspberry Pi or mini-PC running a full-screen browser. Each frame pairs once with a Roku-style code and then runs on its own.

All logic lives on the server. The frame is a kiosk that shows what it's told, and it keeps running from its local cache if the network drops.

**Status:** Phase 0. This is a deployable skeleton with login and no photo features yet.

## Stack

Nuxt 4, Nuxt UI v4, TypeScript, and pnpm on Node 22, with SQLite (`better-sqlite3`) and `sharp`. It runs under pm2 behind nginx on a DigitalOcean droplet, at `pictures.metaincognita.com`.

## Documentation

| File | Contents |
|---|---|
| [`docs/00-master-design.md`](docs/00-master-design.md) | Architecture, data model, API, frame client, and phases |
| [`docs/06-security.md`](docs/06-security.md) | Threat model, controls, and the ship checklist |
| [`docs/phase-0-kickoff-prompt.md`](docs/phase-0-kickoff-prompt.md) | Build instructions for Phase 0 |

## Local development

```bash
cp .env.example .env && chmod 600 .env
pnpm install
pnpm hash-password    # paste the printed line into .env
pnpm dev              # http://localhost:3100
```

| Command | Purpose |
|---|---|
| `pnpm hash-password` | Print an argon2id hash for `.env` |
| `pnpm seed:device` | Add a device named `test` and print its token; add `--remove` to delete it |
| `pnpm seed:fetch` | Download the 25 sample photos into `seed/photos/` |

Log in with Chrome or Firefox in dev. The session cookie is always `Secure`, and Safari refuses those over plain `http://localhost`.

## Deploying

Run `./rebuild.sh` on the droplet. It pulls `origin/main`, builds beside the live site, backs up SQLite, swaps in the new build, reloads pm2, and checks `/api/health`. A failed build leaves the running site in place.

### First-time droplet setup

The target is a 1 GiB DigitalOcean droplet managed by Forge, with the site at `/home/forge/pictures.metaincognita.com`. Forge manages the nginx site and TLS certificate, so don't run certbot or replace its site file. Edit nginx from the site's Nginx page in Forge.

1. Create a 2 GiB swapfile, replacing any smaller one, so `pnpm build` can't trigger the OOM killer:
   ```bash
   sudo swapoff /swapfile
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```
2. Install `sqlite3`, which `rebuild.sh` needs for backups: `sudo apt install sqlite3`.
3. Create the data folder:
   ```bash
   sudo install -d -o forge -g forge -m 750 /var/pictures
   ```
4. Clone the repo:
   ```bash
   cd /home/forge/pictures.metaincognita.com
   git clone https://github.com/cschweda/metaincognita-pictures.git .
   ```
5. Create `.env`, using absolute paths:
   ```bash
   cp .env.example .env && chmod 600 .env
   ```
   Set `NUXT_DB_PATH=/var/pictures/pictures.db`, `NUXT_PICTURES_DIR=/var/pictures`, and the `NUXT_ADMIN_PASSWORD_HASH` line from `pnpm hash-password`.
6. Install and build, then start the app and keep it running after a reboot:
   ```bash
   pnpm install --frozen-lockfile
   ./rebuild.sh
   pm2 startup    # run the command it prints
   pm2 save
   ```
7. Check that the site's Nginx config contains these, then add the missing nginx headers below:
   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3100;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }

   location /api/frame/events {
       proxy_pass http://127.0.0.1:3100;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header Connection '';
       proxy_buffering off;
       proxy_cache off;
       proxy_read_timeout 1h;
   }
   ```
   ```nginx
   add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
   add_header Referrer-Policy no-referrer;
   ```
   Set `client_max_body_size` when upload arrives in Phase 1. Uptime monitors must use `GET` on `/api/health`, because it doesn't answer `HEAD`.

### Security checklist

From Doc 06 §12:

| Item | Status |
|---|---|
| SSH password login off | Verify on each droplet with `sudo sshd -T \| grep -i passwordauthentication` |
| Root login off | Verify with `sudo sshd -T \| grep -i permitrootlogin` |
| `ufw` allows only 22, 80, and 443 | Verify with `sudo ufw status` |
| Node bound to `127.0.0.1` | Set in `ecosystem.config.cjs` |
| `.env` mode 600, not in git | Setup step 5 |
| Nginx headers and the app's nonce CSP present | Check with `curl -I`; CSP is set by the app |
| Argon2id hash in place; rate limiter tested | Done in Phase 0 |
| Device cookie rejected on `/api/photos` | Done in Phase 0 |
| No nginx path reaches `orig/` | Deferred to Phase 2 |
| Session list and revoke button | Deferred to Phase 2 |
| Pairing approval screen shows IP and screen size | Deferred to Phase 2 |
| Token returned once; second poll logged | Deferred to Phase 2 |

## License

[MIT](LICENSE)
