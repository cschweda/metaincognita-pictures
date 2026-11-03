-- Demo mode. A fresh install loads a few sample photos to show how things work. The first photo
-- the owner uploads switches the app to live for good, until Start over empties it again.
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- What the demo added, so it can be told apart from the owner's own photos and removed.
ALTER TABLE photos ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE playlists ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE presets ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;

-- An install that already has photos is already live, and never loads the demo by itself.
INSERT INTO settings (key, value) SELECT 'mode', 'live' WHERE EXISTS (SELECT 1 FROM photos);
INSERT INTO settings (key, value) SELECT 'demo_autoload', 'done' WHERE EXISTS (SELECT 1 FROM photos);
