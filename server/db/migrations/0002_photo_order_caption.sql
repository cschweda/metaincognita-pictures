-- Display order for the admin grid and `manual` sort, highest first, plus an optional caption.
ALTER TABLE photos ADD COLUMN position REAL NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN caption TEXT;
UPDATE photos SET position = rowid;
CREATE INDEX photos_position ON photos(position);
