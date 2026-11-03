-- Warnings and ordinary events are pruned separately, so a flood of wrong passwords can't push
-- logins and deletes out of the Activity log.
CREATE INDEX events_level ON events (level, id);
-- Two-factor login keeps its secret and recovery code hashes in settings, under totp_*. It is
-- off until the owner turns it on, so there is nothing to add here.
