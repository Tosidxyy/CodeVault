CREATE TABLE asset_objects (
  object_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 2097152),
  state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting')),
  touched_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX asset_active_hash ON asset_objects(user_id,hash) WHERE state IN ('pending','ready');
CREATE INDEX asset_cleanup ON asset_objects(state,touched_at);
CREATE INDEX asset_owner ON asset_objects(user_id);
CREATE TABLE sync_asset_refs (
  user_id TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  PRIMARY KEY(user_id,problem_id,object_key)
);
CREATE INDEX asset_ref_object ON sync_asset_refs(object_key);
-- R2-list reconciliation cursor: never rely solely on successful request cleanup.
CREATE TABLE asset_cleanup_cursor (id INTEGER PRIMARY KEY CHECK(id=1), cursor TEXT NOT NULL);
