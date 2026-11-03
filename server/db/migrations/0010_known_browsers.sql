-- Browsers that have logged in before. Only a hash of each one's cookie is kept. During a flood of
-- wrong passwords from elsewhere, a known browser skips the flood limits, so attackers can't use
-- them to keep the owner out; it still has its own five tries.
CREATE TABLE known_browsers (
  hash        TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_used   TEXT NOT NULL DEFAULT (datetime('now'))
);
