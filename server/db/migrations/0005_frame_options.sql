-- Per-frame options: skip photos that don't suit the screen's shape, and put memories first.
ALTER TABLE devices ADD COLUMN match_shape INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN memories_first INTEGER NOT NULL DEFAULT 0;
