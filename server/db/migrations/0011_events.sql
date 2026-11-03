-- The Activity log: security-relevant events, kept 90 days and capped at 20,000 rows.
CREATE TABLE events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  level   TEXT NOT NULL CHECK (level IN ('info', 'warn')),
  kind    TEXT NOT NULL,   -- login, frame, delete, pair, photo, demo, session
  message TEXT NOT NULL,
  ip      TEXT,
  agent   TEXT
);
CREATE INDEX events_at ON events (at);
CREATE INDEX events_kind ON events (kind, at);
