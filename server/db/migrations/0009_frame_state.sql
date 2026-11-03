-- What a frame reports about itself: whether its slideshow is paused, and since when it has been
-- online without a gap, for "online for" on its card.
ALTER TABLE devices ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN online_since TEXT;
