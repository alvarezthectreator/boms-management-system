CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (property_id, user_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS api_idempotency_created_at
  ON api_idempotency_keys (created_at);