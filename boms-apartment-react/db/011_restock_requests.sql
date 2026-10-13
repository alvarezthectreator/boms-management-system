CREATE TABLE IF NOT EXISTS restock_requests (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  items_json TEXT NOT NULL,
  manager_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_restock_requests_property_status
  ON restock_requests(property_id, status, created_at);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);