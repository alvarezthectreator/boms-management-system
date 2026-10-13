CREATE TABLE IF NOT EXISTS restock_requests (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'requested',
  items_json TEXT NOT NULL,
  manager_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_restock_requests_property_status
  ON restock_requests(property_id, status, created_at);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);