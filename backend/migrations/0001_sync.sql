-- Independent CodeVault database. Never apply to the Guidy database.
CREATE TABLE sync_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sync_sessions_expiry ON sync_sessions(expires_at);
CREATE TABLE sync_documents (
  user_id TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  document TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, problem_id)
);
