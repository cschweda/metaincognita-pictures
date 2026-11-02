#!/usr/bin/env bash
#
# Nightly backup: a SQLite snapshot on the droplet, and an off-site copy once one is set up.
# Set BACKUP_REMOTE in .env to an rclone remote, for example spaces:my-bucket/pictures, to enable
# the off-site copy of the database and originals. Variants can be regenerated, so they're skipped.
#
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

setting() { grep -E "^$1=" .env | cut -d= -f2- | tr -d '"' || true; }

DB_PATH="$(setting NUXT_DB_PATH)"
PICTURES_DIR="$(setting NUXT_PICTURES_DIR)"
BACKUP_REMOTE="$(setting BACKUP_REMOTE)"
KEEP_DAYS=14

[[ -f "$DB_PATH" ]] || { echo "No database at $DB_PATH"; exit 1; }

# Backups hold session ids and device token hashes, so they're owner-only.
umask 077
BACKUP_DIR="$(dirname "$DB_PATH")/backups"
mkdir -p "$BACKUP_DIR"
SNAPSHOT="$BACKUP_DIR/nightly-$(date +%Y%m%d).db"

sqlite3 "$DB_PATH" ".backup '$SNAPSHOT'"
RESULT="$(sqlite3 "$SNAPSHOT" 'PRAGMA integrity_check;')"
[[ "$RESULT" == "ok" ]] || { echo "Snapshot failed its integrity check: $RESULT"; exit 1; }

find "$BACKUP_DIR" -name 'nightly-*.db' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) snapshot ok: $SNAPSHOT"

if [[ -z "$BACKUP_REMOTE" ]]; then
  echo "$(date -Is) off-site copy skipped: BACKUP_REMOTE is not set"
  exit 0
fi

# --immutable never overwrites or deletes, so it works with a write-only key.
rclone copy --immutable "$SNAPSHOT" "$BACKUP_REMOTE/db"
rclone copy --immutable "$PICTURES_DIR/orig" "$BACKUP_REMOTE/orig"
echo "$(date -Is) off-site copy ok: $BACKUP_REMOTE"
