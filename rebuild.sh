#!/usr/bin/env bash
#
# rebuild.sh — pull, build, and restart pictures under pm2, for installs without Docker
#
# Usage (on the server):
#   cd /path/to/pictures && ./rebuild.sh
#
# Env overrides:
#   SMOKE_URL        default PUBLIC_URL from .env, then http://127.0.0.1:3100
#   REBUILD_LOG_DIR  default ~/deploy-logs
#   SKIP_SMOKE=1     skip the post-restart health check
#
set -Eeuo pipefail

# ---------------------------------------------------------------- config ----
APP_NAME="pictures"
BRANCH="main"
SMOKE_URL="${SMOKE_URL:-}"
REBUILD_LOG_DIR="${REBUILD_LOG_DIR:-$HOME/deploy-logs}"
KEEP_LOGS=30
MIN_NODE_MAJOR=22

cd "$(dirname "${BASH_SOURCE[0]}")"
REPO_DIR="$(pwd)"

# --------------------------------------------------------------- logging ----
mkdir -p "$REBUILD_LOG_DIR"
LOG_FILE="$REBUILD_LOG_DIR/rebuild-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
# prune old logs
ls -1t "$REBUILD_LOG_DIR"/rebuild-*.log 2>/dev/null | tail -n +$((KEEP_LOGS + 1)) | xargs -r rm -f || true

STAGE="init"
PREV_HEAD="$(git rev-parse HEAD)"
START_TS=$(date +%s)

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ok: %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    warn: %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m    error: %s\033[0m\n' "$*"; exit 1; }

on_exit() {
  local code=$?
  if [[ $code -ne 0 ]]; then
    printf '\n\033[1;31m################################################\033[0m\n'
    printf '\033[1;31m# REBUILD FAILED during stage: %s\033[0m\n' "$STAGE"
    printf '\033[1;31m################################################\033[0m\n'
    local cur_head
    cur_head="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    if [[ "$cur_head" != "$PREV_HEAD" ]]; then
      echo
      echo "HEAD moved from $PREV_HEAD to $cur_head."
      echo "To return to the last deployed commit and rebuild:"
      echo
      echo "    git reset --hard $PREV_HEAD && ./rebuild.sh"
      echo
      echo "(This script never rolls back on its own.)"
    fi
    echo "Log: $LOG_FILE"
  else
    printf '\n\033[1;32mRebuild complete in %ss. Log: %s\033[0m\n' "$(( $(date +%s) - START_TS ))" "$LOG_FILE"
  fi
}
trap on_exit EXIT

# ------------------------------------------------------------- preflight ----
STAGE="preflight"
say "Preflight"

command -v git  >/dev/null || die "git not found"
command -v node >/dev/null || die "node not found"
command -v pnpm >/dev/null || die "pnpm not found (corepack enable && corepack prepare pnpm@latest --activate)"
command -v pm2  >/dev/null || die "pm2 not found (pnpm add -g pm2)"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ]] || die "Node $MIN_NODE_MAJOR+ required, found $(node -v)"
ok "node $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v)"

[[ -f .env ]] || die ".env missing — copy .env.example and fill it in"
[[ -f ecosystem.config.cjs ]] || die "ecosystem.config.cjs missing"
if [[ -z "$SMOKE_URL" ]]; then
  SMOKE_URL="$(grep -E '^PUBLIC_URL=' .env | cut -d= -f2- | tr -d '"' || true)"
  SMOKE_URL="${SMOKE_URL:-http://127.0.0.1:3100}"
fi
ok "repo: $REPO_DIR @ ${PREV_HEAD:0:8}"

# ---------------------------------------------------------------- update ----
STAGE="git pull"
say "Updating from origin/$BRANCH"

if [[ -n "$(git status --porcelain)" ]]; then
  warn "working tree has local changes; discarding tracked-file edits"
  git checkout -- .
fi
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
NEW_HEAD="$(git rev-parse HEAD)"

if [[ "$NEW_HEAD" != "$PREV_HEAD" ]]; then
  ok "updated ${PREV_HEAD:0:8} → ${NEW_HEAD:0:8}"
  git --no-pager log --oneline "$PREV_HEAD..$NEW_HEAD" | sed 's/^/    /'
  if ! git diff --quiet "$PREV_HEAD" "$NEW_HEAD" -- rebuild.sh; then
    say "rebuild.sh itself changed; re-running the new version"
    exec env REBUILD_REEXEC=1 "$0" "$@"
  fi
else
  ok "already at ${NEW_HEAD:0:8}; rebuilding anyway"
fi

# ----------------------------------------------------------------- build ----
STAGE="pnpm install"
say "Installing dependencies"
pnpm install --frozen-lockfile

STAGE="build"
say "Building"
# Build beside the live .output: the running app still needs those files, and
# Nitro empties its output directory during a build. A failed build stops here.
rm -rf .nuxt .output.new
# Node's default heap on a 1 GiB server is too small for this build, so it needs room in swap.
NODE_OPTIONS=--max-old-space-size=1536 BUILD_OUTPUT_DIR=.output.new pnpm build
[[ -f .output.new/server/index.mjs ]] || die "build produced no .output.new/server/index.mjs"
ok "build ok"

# ------------------------------------------------------------- migrations ----
# Migrations run on app start (server/db/index.ts); nothing to do here.
# A backup first is cheap insurance.
STAGE="db backup"
say "Backing up SQLite before restart"
DB_PATH="$(grep -E '^NUXT_DB_PATH=' .env | cut -d= -f2- | tr -d '"' || true)"
if [[ -n "${DB_PATH:-}" && -f "$DB_PATH" ]]; then
  # Backups hold session ids and device token hashes: owner-only from creation.
  (
    umask 077
    mkdir -p "$(dirname "$DB_PATH")/backups"
    sqlite3 "$DB_PATH" ".backup '$(dirname "$DB_PATH")/backups/pre-rebuild-$(date +%Y%m%d-%H%M%S).db'"
  ) && ok "backup written" || warn "sqlite3 backup failed (is sqlite3 installed?)"
  ls -1t "$(dirname "$DB_PATH")"/backups/pre-rebuild-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f || true
else
  warn "NUXT_DB_PATH not set or DB not created yet; skipping backup"
fi

# --------------------------------------------------------------- restart ----
STAGE="pm2 restart"
say "Restarting $APP_NAME under pm2"
rm -rf .output.prev
if [[ -d .output ]]; then mv .output .output.prev; fi
mv .output.new .output
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  warn "$APP_NAME not registered with pm2 yet; starting"
  pm2 start ecosystem.config.cjs
fi
pm2 save >/dev/null
ok "pm2: $(pm2 jlist | node -e 'const a=JSON.parse(require("fs").readFileSync(0));const p=a.find(x=>x.name===process.argv[1]);console.log(p?`${p.pm2_env.status}, pid ${p.pid}, restarts ${p.pm2_env.restart_time}`:"not found")' "$APP_NAME")"

# ----------------------------------------------------------------- smoke ----
if [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
  warn "SKIP_SMOKE=1; skipping health check"
  exit 0
fi

STAGE="smoke"
say "Waiting for $SMOKE_URL/api/health"
for i in $(seq 1 20); do
  if body="$(curl -fsS --max-time 5 "$SMOKE_URL/api/health" 2>/dev/null)" && [[ "$body" == *'"ok":true'* ]]; then
    ok "health: $body"
    exit 0
  fi
  sleep 1
done

echo
warn "health check did not pass within 20s"
echo "    Try:  pm2 logs $APP_NAME --lines 50"
echo "          curl -i http://127.0.0.1:3100/api/health   (bypasses nginx)"
echo "    The previous build is in .output.prev."
exit 1
