# OpenMantel — Doc 06: Security

**Project:** Self-hosted digital picture frame
**Status:** Draft v0.1 — 2026-11-02
**Depends on:** Doc 00 (Master Design)

---

## 1. Threat model

This is a single-user personal app. The realistic threats, in order:

1. **Opportunistic scanning** of the server (SSH brute force, known CVEs in exposed services).
2. **Admin credential compromise** — the one door that allows upload, delete, and pairing approval.
3. **Physical access to a frame** — SD card pulled from a Pi, giving the attacker that frame's device token.
4. **Pairing abuse** — someone starts a pairing and tricks you into approving it, or guesses a code.
5. **URL leakage** — a variant URL copied from a frame's network traffic.

Out of scope: DDoS, targeted attackers with server root, nation-states. Nobody is going to burn a zero-day on a picture frame.

## 2. Priority order

If only three things get done, do these:

1. SSH hardening and firewall (§3).
2. Read-only device scope enforced by one route-group middleware (§6).
3. Pairing approval screen that shows what you're approving (§5).

Everything else is hygiene.

## 3. Server hardening

| Control | How |
|---|---|
| SSH key auth only, root by key only | `PasswordAuthentication no` and `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config.d/40-root-login.conf`. Root stays key-accessible if your server manager needs it. Verify with `sudo sshd -T`. |
| Firewall | `ufw` allowing only 22, 80, 443. Node binds `127.0.0.1:3100` only (`HOST` in the ecosystem file). |
| Patching | `unattended-upgrades` enabled for security updates. |
| Brute-force | `fail2ban` with the default sshd jail. |
| File permissions | The pictures folder is owned by the app user, mode 750. Don't rely on file permissions to keep a reverse proxy out of `orig/` if it runs as the same user. |
| Original photos | The nginx config is the control: the proxy must never serve the pictures folder or `orig/` directly. Images reach clients only through the app's `/v/` route. |
| Secrets | `.env` mode 600, never committed. Ecosystem file loads it; no secrets inline. |
| Backups | Keep backups somewhere a compromised server can't delete them, such as a VPS provider's backup feature. |

## 4. Admin authentication

- One user. Password hashed with **Argon2id** (memory 64 MB, iterations 3, parallelism 1). Store the hash in `.env` or a one-row `users` table.
- **Rate limiting:** 5 attempts per 15 minutes per IP (taken from nginx's `X-Real-IP`, see Doc 00 §2) *and* 20 per hour globally on the account, so a distributed attempt doesn't bypass the IP limit. After the limit, add exponential delay rather than a hard lockout, so you can't be locked out of your own app.
- **Sessions are server-side.** A `sessions` table (`id`, `created_at`, `last_seen_at`, `user_agent`, `ip`). The cookie carries a random 32-byte value, and `id` stores only its SHA-256 hash, so a database backup can't be used to log in. This makes logout and "sign out everywhere" real.
- **Cookie flags:** `HttpOnly; Secure; SameSite=Lax; Path=/`. 14-day sliding expiry.
- **CSRF:** every state-changing admin route requires a custom header (`X-Requested-With: fetch`) that a cross-site form cannot set. `SameSite=Lax` alone does not cover every case.
- **Session list** in the admin UI with a revoke button per session, for the stolen-phone case.
- Passkeys: optional later. For one user, a long random password in a password manager is equivalent.

## 5. Pairing flow

| Risk | Control |
|---|---|
| Code guessing | 6 chars from a 32-symbol alphabet (no `0 O 1 I`) ≈ 10⁹ combinations. 10-minute expiry. `approve` rate-limited to 5 per minute per admin session. Do not shrink to 4 chars. |
| Approving a pairing you didn't start | Approval screen shows the pending frame's reported screen size, IP address, and age of the request. If a code appears that you didn't request, don't approve it. |
| Token interception via `poll` | `pairing_id` (long random, used for polling) is separate from `code` (short, typed by you). Seeing the code on a screen does not let you poll. |
| Token replay | Token is minted and set as a cookie exactly once, on the first poll after approval, and is never stored raw or returned in a response body. The row is marked `claimed` and kept for 24 hours, so a later poll with the same id is recognized and logged as suspicious. |
| Stale rows | Cron every minute expires `pending` and `approved` rows past `expires_at`, not only on read, and deletes `claimed` rows older than 24 hours. |

## 6. Device tokens

- 32 random bytes, base64url. Stored as SHA-256 hash. Raw token lives only in the frame's cookie.
- **Scope enforced in one place.** A Nitro middleware accepts device tokens only for `/api/frame/*`; every other non-public route rejects them. The public list is exact method-and-path matches, and `/api/pair/approve` is not on it. New routes are denied by default. No per-handler checks.
- **Rotation:** on heartbeat, if `token_rotated_at` is older than 30 days, issue a new token via `Set-Cookie`, move the old hash to `prev_token_hash`, and set `prev_token_expires_at` 24 hours ahead so a frame that drops the response isn't locked out. Device lookup accepts either hash while the old one is in its grace window.
- **Revocation:** `revoked = 1` is checked on every device request. Revoked frames get a `401` and fall back to the pairing screen. Photos in a frame's cache are cleared when it reaches the pairing screen. An offline removed frame keeps them until then, and can't download anything new.
- **Physical compromise:** someone with the SD card gets a read-only token to your photos. Accept this; revoke from the admin page. Encrypting the card isn't worth it for a frame.
- **Dormant devices:** `last_seen_at` shown in the admin list; a frame silent for 30+ days is flagged as a candidate for revocation.

## 7. Image serving

- Variant URLs (`/v/<ulid>-<size>.webp`) are unguessable but not secret, so a URL alone must not be enough to see a photo.
- **Required:** `/v/` needs an admin session or a valid device, and the admin grid needs thumbnails too, so both roles pass. The auth middleware enforces this, and a Nitro route serves the files, so this holds with no nginx changes.
- **Optional, for speed:** nginx can serve `/v/` itself with `auth_request` calling `GET /api/auth/image`, which returns 204, 401, or 403. The auth location must pass `proxy_set_header X-Original-URI $uri;` (the normalized path nginx serves, not `$request_uri`), because a device is refused a hidden photo by its id, and without the header a device is refused everything. Never add a `/v/` location without `auth_request`. Photo files must be readable by the nginx user.
- **Originals are never served over HTTP.** An admin "download original" button, if wanted, streams through a Nitro handler that checks the admin session.
- Nginx `location /v/` sets `Cache-Control: private, max-age=31536000, immutable`; no directory listing.

## 8. Upload

- Admin session required. Max 50 MB per file, 20 files per request. Uploads stream to disk. Nginx is set to `client_max_body_size 200M`; the 50 MB limit is enforced by the app.
- File type is read from the bytes by `sharp`, and only JPEG, PNG, WebP, TIFF, AVIF, and HEIC are accepted. The filename and declared type are ignored.
- Original filename is stored in the DB for display only and never used in a path. Files are named by ULID.
- Variants are generated without `.withMetadata()`, so EXIF (including GPS) is stripped from everything frames ever see. Originals keep EXIF but never leave the server.
- Processing is sequential (concurrency 1–2) to bound memory on a small server.

## 9. Headers and transport

nginx:
```
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Content-Type-Options nosniff;
add_header Referrer-Policy no-referrer;
```
TLS via Let's Encrypt, auto-renewed. HTTP → HTTPS redirect.

The CSP is set by the app, not nginx. Subresource integrity is off: every script is self-hosted, so it adds no protection, and a stale hash blocks the whole page. Nuxt's server-rendered pages include inline scripts (runtime config, color mode, importmap), so a static `script-src 'self'` stops the page hydrating, and this only shows up in production. `nuxt-security` issues a per-request nonce instead:

```
default-src 'self'; base-uri 'none'; object-src 'none'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; script-src 'self' 'nonce-…'
```

The CSP is strict because the app loads nothing third-party: icons are bundled and served from `/api/_nuxt_icon/*` with the Iconify API fallback off, and Nuxt UI's font fetching is disabled. `'unsafe-inline'` for styles is acceptable; do not loosen `script-src` beyond the nonce.

## 10. Logging

Log to stdout (pm2 captures it): admin logins (success/fail, IP), pairing start/approve/expire, device revocations, token rotations, and any `poll` after approval. No photo access logs; they'd be noise. Rotate with `pm2-logrotate`.

## 11. Explicitly not doing

- WAF, Cloudflare, DDoS protection.
- Encrypting the SQLite file at rest.
- 2FA on the admin account.
- Encrypting frame SD cards.

Each adds maintenance for a threat that doesn't apply to a one-person picture frame.

## 12. Checklist (ship gate for Phase 2)

- [ ] `sshd_config` verified; `ufw` shows only 22/80/443
- [ ] Node bound to `127.0.0.1`
- [ ] `.env` mode 600, not in git
- [ ] No nginx `location`, `root`, or `alias` reaches `orig/`, and a request for a known original's path returns 404
- [ ] Argon2id hash in place; rate limiter tested by hand
- [ ] Session table + revoke button working
- [ ] Device middleware rejects a device cookie on `/api/photos` (test it)
- [ ] A `/v/` URL returns 401 with no cookies
- [ ] Pairing approval screen shows IP and screen size
- [ ] Token returned once; second poll logged
- [ ] nginx headers and the app's nonce CSP present (check with `curl -I`); `/login` hydrates over HTTPS with no CSP errors in the console
