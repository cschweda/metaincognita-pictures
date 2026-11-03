-- Per-frame captions, and one preset a frame shows on chosen days and times.
ALTER TABLE devices ADD COLUMN show_captions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE devices ADD COLUMN schedule_preset_id TEXT REFERENCES presets(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN schedule_days TEXT NOT NULL DEFAULT '[]';   -- JSON, 0 is Sunday. Empty means every day.
ALTER TABLE devices ADD COLUMN schedule_start TEXT;                        -- "09:00" local. Empty means all day.
ALTER TABLE devices ADD COLUMN schedule_end TEXT;
