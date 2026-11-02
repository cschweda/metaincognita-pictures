-- Session ids are now stored as SHA-256 hashes, so a database backup can't be used to log in.
-- Plain ids can't be hashed in SQL, so existing sessions end and everyone logs in again.
DELETE FROM sessions;
