-- Named, hand-picked playlists in their own order. A frame shows either its tag filter or one playlist.
CREATE TABLE playlists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE playlist_photos (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  photo_id    TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,   -- 1 is first.
  PRIMARY KEY (playlist_id, photo_id)
);
CREATE INDEX playlist_photos_order ON playlist_photos (playlist_id, position);

ALTER TABLE devices ADD COLUMN playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL;
