CREATE TABLE photos (
  id            TEXT PRIMARY KEY,          -- ulid
  filename      TEXT NOT NULL,             -- original name
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  taken_at      TEXT,                      -- from EXIF if present
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
  hash          TEXT NOT NULL UNIQUE,      -- sha256 of original, dedupe
  hidden        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE   -- "travel", "fall", "italy 2024"
);

CREATE TABLE photo_tags (
  photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
  tag_id   TEXT REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);
CREATE INDEX photo_tags_tag ON photo_tags(tag_id);

-- A saved filter you can apply to a frame with one tap.
CREATE TABLE presets (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,                     -- "Holidays", "Grandkids", "Everything"
  filter  TEXT NOT NULL                      -- JSON, same shape as devices.filter
);

CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,             -- "Kitchen", "Office Pi"
  token_hash    TEXT NOT NULL UNIQUE,
  prev_token_hash       TEXT UNIQUE,         -- previous token, valid during rotation grace
  prev_token_expires_at TEXT,                -- 24 hours after rotation
  filter        TEXT NOT NULL DEFAULT '{"tags":[],"mode":"any"}',  -- JSON, see below
  sort          TEXT NOT NULL DEFAULT 'random',   -- random | taken_at | uploaded_at
  screen_w      INTEGER, screen_h INTEGER, dpr REAL,
  interval_sec  INTEGER NOT NULL DEFAULT 30,
  matte         TEXT NOT NULL DEFAULT '#000000',  -- CSS color behind the photo
  backdrop      TEXT NOT NULL DEFAULT 'solid',    -- solid (matte fills bars) | blur
  sleep_start   TEXT, sleep_end TEXT,      -- "23:00", "06:30" local
  paired_at     TEXT NOT NULL,
  last_seen_at  TEXT,
  token_rotated_at TEXT,
  revoked       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pairings (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT,                             -- set by approve; becomes devices.name
  ip          TEXT,                             -- requester, shown on the approval screen
  screen_w    INTEGER, screen_h INTEGER, dpr REAL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | claimed | expired
  device_id   TEXT REFERENCES devices(id),      -- set when claimed
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  claimed_at  TEXT                              -- kept 24 hours to detect replayed polls
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent    TEXT,
  ip            TEXT
);
