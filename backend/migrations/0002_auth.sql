-- Forward migration for the isolated CodeVault database only.
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  deletion_nonce TEXT
);
ALTER TABLE sync_sessions ADD COLUMN issued_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX sync_sessions_user ON sync_sessions(user_id);
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 3),
  delivered INTEGER NOT NULL DEFAULT 0,
  consumed_by TEXT
);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires_at);
CREATE TABLE auth_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_limits_expiry ON auth_limits(expires_at);
