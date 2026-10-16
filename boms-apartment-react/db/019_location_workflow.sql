CREATE TABLE IF NOT EXISTS property_locations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  has_kitchen INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, name)
);

INSERT OR IGNORE INTO property_locations (id, property_id, name, kind, has_kitchen, active, sort_order)
VALUES
  ('location-building-1', 'property_boms', 'Building 1', 'accommodation', 0, 1, 1),
  ('location-building-2', 'property_boms', 'Building 2', 'accommodation', 1, 1, 2),
  ('location-bar', 'property_boms', 'Bar & Lounge', 'bar', 0, 1, 3);

CREATE INDEX IF NOT EXISTS idx_property_locations_property
  ON property_locations(property_id, active, sort_order);