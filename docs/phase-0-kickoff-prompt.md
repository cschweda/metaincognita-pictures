# pictures.metaincognita.com — Phase 0 Kickoff Prompt

Before pasting, do these by hand:

1. Upgrade pnpm on this machine to 12.16.1 to match the droplet. A pnpm 10 install can't switch itself to the pinned version, and a lockfile made by pnpm 10 can fail pnpm 12's checks.
2. Check that `origin` points to `https://github.com/cschweda/metaincognita-pictures`. `rebuild.sh` deploys from `origin/main`.
3. Commit the existing files (`docs/`, `rebuild.sh`, `README.md`, `CHANGELOG.md`, `LICENSE`, `.nvmrc`, `.gitignore`) and push to `main`.
4. Decide how the droplet steps get done. Either give Claude Code SSH access, or run the README's droplet steps yourself once the local work is finished.

Then paste everything below the line into Claude Code at the start of a fresh session.

---

You are building **pictures**, a self-hosted digital picture frame server for one user. Read `docs/00-master-design.md` and `docs/06-security.md` before writing any code; they are the spec. Where this prompt and those docs disagree, the docs win.

## Phase 0 goal

A running, deployable skeleton with no features: the repo, the stack, the database, the auth middleware shapes, and a deploy path that works end to end. When Phase 0 is done, `pnpm dev` serves a page that says "pictures" and a login form that accepts the one admin password, and `pm2 reload` on the droplet serves the same thing over HTTPS. Nothing else.

Phase 0 exists so that every later phase is adding features to something that already deploys, not fighting setup.

## Stack (fixed)

- Nuxt 4, Nuxt UI v4, TypeScript, pnpm. Nitro server routes under `server/api/`.
- `better-sqlite3` with WAL mode. Migrations are plain SQL files in `server/db/migrations/`, applied in order at startup by a tiny runner (no ORM, no Drizzle, no Prisma).
- `sharp` for images (install now, use in Phase 1).
- `argon2` for the admin password hash.
- `nuxt-security` for the nonce-based CSP in Doc 06 §9. Nginx does not set the CSP.
- `@iconify-json/lucide` for locally bundled icons, and `tsx` to run the TypeScript files in `scripts/`.
- pm2 with `ecosystem.config.cjs` at the repo root, `instances: 1`, fork mode, bound to `127.0.0.1:3100`. All paths and secrets come from `.env` via `dotenv`, never inline in the ecosystem file (Doc 00 §2).
- nginx in front with Let's Encrypt. Node never listens on a public interface.

## Repo layout to create

```
./                           # this repo root; see "already here" below
  docs/                      # 00 and 06 already here
  server/
    api/
      auth/login.post.ts
      auth/logout.post.ts
      auth/session.get.ts
      health.get.ts
    db/
      index.ts               # opens DB, runs migrations, exports `db`
      migrations/
        0001_init.sql        # all tables from Doc 00 §5, plus `sessions`
    middleware/
      auth.ts                # sets event.context.admin / event.context.device
    utils/
      session.ts             # create/read/destroy admin sessions
      tokens.ts              # random bytes, sha256 helpers
    types.ts                 # Photo, Tag, Device, Pairing, Session
  app/
    pages/
      index.vue              # "pictures" and nothing else
      admin/index.vue        # placeholder, requires admin
      login.vue
    middleware/
      admin.ts               # client-side redirect to /login
  scripts/
    hash-password.ts
    seed-test-device.ts
    fetch-seed-photos.ts
  seed/
    manifest.json            # committed; seed/photos/ is gitignored
  ecosystem.config.cjs
  rebuild.sh                 # already here, do not modify
  LICENSE, .nvmrc            # already here, do not modify
  CHANGELOG.md               # already here; add an entry for each numbered step
  .env.example
  nuxt.config.ts
  package.json
  README.md                  # already here; extend it, do not replace it
```

## What to build in Phase 0

1. **Scaffold.** The repo root already has files, so run `pnpm dlx nuxi@latest init` in a temporary folder and copy the result in without overwriting `docs/`, `rebuild.sh`, `README.md`, `CHANGELOG.md`, `LICENSE`, `.nvmrc`, or `.git`. Merge any new entries from the scaffold's `.gitignore` into the existing one. Add Nuxt UI v4, nuxt-security, better-sqlite3, sharp, argon2, dotenv, ulid, `@iconify-json/lucide`, and `tsx`. `nuxt.config.ts` must contain:
   ```ts
   devServer: { port: 3100, host: '127.0.0.1' },
   ui: { fonts: false },
   icon: { provider: 'server', fallbackToApi: false, serverBundle: { collections: ['lucide'] } },
   nitro: { output: { dir: process.env.BUILD_OUTPUT_DIR || '.output' } },   // rebuild.sh builds to .output.new
   runtimeConfig: { adminPasswordHash: '', dbPath: '', picturesDir: '' },
   security: {
     nonce: true,
     headers: {
       strictTransportSecurity: false,   // nginx sets these three
       xContentTypeOptions: false,
       referrerPolicy: false,
       contentSecurityPolicy: {
         'default-src': ["'self'"], 'base-uri': ["'none'"], 'object-src': ["'none'"],
         'img-src': ["'self'", 'blob:', 'data:'], 'style-src': ["'self'", "'unsafe-inline'"],
         'font-src': ["'self'"], 'connect-src': ["'self'"],
         'script-src': ["'self'", "'nonce-{{nonce}}'"], 'upgrade-insecure-requests': false,
       },
     },
     rateLimiter: false, requestSizeLimiter: false, xssValidator: false, corsHandler: false,
   },
   ```
   Set `"packageManager": "pnpm@12.16.1"` in `package.json`, and generate `pnpm-lock.yaml` with that version. pnpm 12 fails the install on unreviewed build scripts, which would stop `rebuild.sh`, so commit a `pnpm-workspace.yaml` that declares them. All of these ship prebuilt binaries, so none need to run:
   ```yaml
   allowBuilds:
     argon2: false
     better-sqlite3: false
     esbuild: false
     vue-demi: false
   ```
   If an install reports another ignored build script, add it here with `false` unless that package needs the script to work. pnpm 12 also rejects packages published in the last 24 hours, so a lockfile made by pnpm 12 will resolve around them. Do not turn that check off.

   `.env.example` lists `NUXT_ADMIN_PASSWORD_HASH`, `NUXT_DB_PATH`, and `NUXT_PICTURES_DIR`, with local paths such as `./data/pictures.db` as the dev defaults.
2. **Database.** `server/db/index.ts` opens `NUXT_DB_PATH`, sets `journal_mode = WAL` and `foreign_keys = ON`, runs any unapplied migrations from a `_migrations` table. `0001_init.sql` creates every table in Doc 00 §5 verbatim, plus:
   ```sql
   CREATE TABLE sessions (
     id            TEXT PRIMARY KEY,
     created_at    TEXT NOT NULL DEFAULT (datetime('now')),
     last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
     user_agent    TEXT,
     ip            TEXT
   );
   ```
3. **Auth middleware** (`server/middleware/auth.ts`). On every request: read the `admin_session` cookie, look it up, set `event.context.admin = true` and bump `last_seen_at`. Read the `device_token` cookie, hash it, look up a non-revoked device, set `event.context.device = row`. Then enforce scope per Doc 06 §6, for `/api/*` paths only, in this order:
   1. **Public routes pass.** The list is exact method-and-path matches: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/health`, `POST /api/pair/start`, `GET /api/pair/poll`. The one prefix match is `GET /api/_nuxt_icon/*`, which Nuxt UI needs for icons. `/api/pair/approve` is deliberately not public.
   2. **Device routes** (`/api/frame/*`) need a valid device; otherwise 401.
   3. **Every other `/api/*` route:** an admin session passes, a valid device token gets 403, and anything else gets 401. An unrecognized or revoked token counts as no token, so it gets 401.

   This is the only place scope is checked. Write it so adding a route later cannot accidentally bypass it.
4. **Login.** `POST /api/auth/login` takes `{ password }`, verifies against `NUXT_ADMIN_PASSWORD_HASH` with argon2, creates a session row, sets the cookie (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600`). Rate limit per Doc 06 §4 with an in-memory map (good enough for one process), keyed on the `X-Real-IP` header set by nginx, falling back to the socket address in dev. `POST /api/auth/logout` deletes the session and clears the cookie. Require `X-Requested-With: fetch` on both. `GET /api/auth/session` returns `{ admin: boolean }`.
5. **Pages.** `/` shows the word "pictures" and nothing else. `/login` is a Nuxt UI form with one password field. `/admin` says "admin". `app/middleware/admin.ts` calls `GET /api/auth/session` and redirects to `/login` when `admin` is false. It runs during server rendering too, so forward the request cookies with `useRequestFetch()`.
6. **Health.** `GET /api/health` returns `{ ok: true, db: true }` after a `SELECT 1`. pm2 and UptimeRobot will hit this.
7. **Deploy.** `ecosystem.config.cjs` per Doc 00 §2. `rebuild.sh` is already at the repo root; leave it unchanged and commit it with its executable bit. It is the only deploy path (pull → install → build to `.output.new` → SQLite backup → swap into `.output` → `pm2 reload` → health check). Add the exact droplet steps to `README.md`, under its Deploying section (target: the $6 Basic droplet, 1 GiB RAM; the first step is a 2 GiB swapfile, replacing any smaller one, so `pnpm build` can't trigger the OOM killer, and the second is `apt install sqlite3`, which `rebuild.sh` needs for backups): clone, `pnpm install --frozen-lockfile`, `cp .env.example .env` and fill it, `pnpm build`, `pm2 start ecosystem.config.cjs`, `pm2 save`, nginx site block (`proxy_set_header X-Real-IP $remote_addr` on every proxied location, and the SSE `proxy_buffering off` location now even though SSE comes later), certbot. Also add `scripts/hash-password.ts`, which prints an argon2 hash for `.env`, and `scripts/seed-test-device.ts`, which inserts a device named `test` and prints its raw token, or deletes that device when run with `--remove`. Pairing doesn't exist yet, so the middleware test below needs this script. Add `pnpm` script entries for all three files in `scripts/`, run with `tsx`.
8. **Security checklist** from Doc 06 §12: do the items that apply to Phase 0 (SSH, ufw, localhost bind, `.env` mode, nginx headers) and note in the README which ones are deferred to Phase 2.
9. **Seed photos.** `scripts/fetch-seed-photos.ts` downloads 25 sample photos into `seed/photos/` (gitignored) and writes `seed/manifest.json`. Source is Lorem Picsum (`https://picsum.photos/id/<id>/<w>/<h>`), which serves Unsplash-licensed photos at any requested size with no API key. Use fixed ids (e.g. 10, 11, 12, 15, 16, 20, 22, 24, 26, 27, 28, 29, 30, 37, 42, 48, 49, 54, 58, 60, 64, 65, 76, 83, 96) so runs are reproducible, and request a deliberate mix of shapes so the frame's letterbox and matte code get exercised:
   - 10 landscape `2400/1600` (3:2)
   - 6 portrait `1600/2400` (2:3)
   - 4 square `2000/2000`
   - 3 panoramic `3000/1000` (3:1)
   - 2 tall `1000/2400` (5:12)

   Each manifest entry: `{ "file": "seed-010.jpg", "tags": [...] }`. Spread tags across `travel`, `fall`, `family`, `landscape`, `city`, `test` so Phase 3 filters have something to match (e.g. landscapes get `travel`+`landscape`, portraits get `family`, squares get `city`, everything gets `test`). Skip a download that already exists; retry once on failure; print a one-line summary. Run with `pnpm seed:fetch`.

   This step only downloads. Phase 1 adds `pnpm seed:ingest`, which pushes `seed/photos/` through the real upload pipeline with the manifest's tags, so you can test everything without touching your own photos.

## Rules

- No features beyond the list above. No upload, no pairing, no slideshow. If you find yourself writing `sharp(...)`, stop.
- No ORM. SQL in `.sql` files and tagged-template strings; `better-sqlite3` prepared statements.
- Every server route has a one-line comment at the top saying which role may call it.
- Types: a `server/types.ts` with `Photo`, `Tag`, `Device`, `Pairing`, `Session` matching the schema exactly.
- Commit after each numbered step with a message like `phase0: 3 auth middleware`. `seed/photos/` is gitignored; `seed/manifest.json` is committed.
- Network fetches are allowed only in `scripts/fetch-seed-photos.ts`; the app itself makes no outbound requests in Phase 0.
- Do not add Tailwind config beyond what Nuxt UI needs. Do not add ESLint/Prettier config beyond Nuxt's defaults.

## Done when

- `pnpm dev` → `/` renders, `/login` accepts the password, `/admin` is reachable after login and redirects before.
- `curl -H 'Cookie: device_token=garbage' localhost:3100/api/photos` → 401 (route doesn't exist yet; middleware must still reject before 404).
- `curl -H 'Cookie: device_token=<token from seed-test-device>' localhost:3100/api/photos` → 403. Run `seed-test-device --remove` afterwards.
- `curl -X POST localhost:3100/api/pair/approve` with no cookie → 401.
- `curl localhost:3100/api/health` → `{"ok":true,"db":true}`.
- The same checks pass on `https://pictures.metaincognita.com` after `./rebuild.sh`, and `/login` works there with no CSP errors in the browser console. If you have no droplet access, say so and list these as not done.
- `pnpm seed:fetch` leaves 25 files in `seed/photos/` with the five aspect ratios above, and `seed/manifest.json` lists all 25 with tags.
- `git log` shows one commit per numbered step.

When finished, print a short summary of what exists and list anything from this prompt you could not do, with the reason. Do not start Phase 1.
