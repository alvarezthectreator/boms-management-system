BEGIN;

CREATE TABLE IF NOT EXISTS property_locations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('accommodation', 'bar')),
  has_kitchen INTEGER NOT NULL DEFAULT 0 CHECK (has_kitchen IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, name)
);

INSERT INTO property_locations (id, property_id, name, kind, has_kitchen, active, sort_order)
VALUES
  ('location-building-1', 'property_boms', 'Building 1', 'accommodation', 0, 1, 1),
  ('location-building-2', 'property_boms', 'Building 2', 'accommodation', 1, 1, 2),
  ('location-bar', 'property_boms', 'Bar & Lounge', 'bar', 0, 1, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  has_kitchen = EXCLUDED.has_kitchen,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES property_locations(id);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES property_locations(id);
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES property_locations(id);
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES property_locations(id);
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS fulfillment_location_id TEXT REFERENCES property_locations(id);
ALTER TABLE fnb_orders
  ADD COLUMN IF NOT EXISTS origin_location_id TEXT REFERENCES property_locations(id),
  ADD COLUMN IF NOT EXISTS service_mode TEXT NOT NULL DEFAULT 'lounge';
ALTER TABLE fnb_order_items
  ADD COLUMN IF NOT EXISTS fulfillment_location_id TEXT REFERENCES property_locations(id);

UPDATE inventory_items
SET location_id = 'location-building-2'
WHERE location_id IS NULL;

UPDATE menu_items
SET fulfillment_location_id = CASE WHEN station = 'bar' THEN 'location-bar' ELSE 'location-building-2' END
WHERE fulfillment_location_id IS NULL;

UPDATE fnb_orders
SET service_mode = CASE WHEN room_unit_id IS NULL THEN 'lounge' ELSE 'room' END,
    origin_location_id = CASE
      WHEN room_unit_id IS NOT NULL THEN (SELECT units.location_id FROM units WHERE units.id = fnb_orders.room_unit_id)
      ELSE 'location-bar'
    END
WHERE origin_location_id IS NULL;

UPDATE fnb_order_items
SET fulfillment_location_id = menu_items.fulfillment_location_id
FROM menu_items
WHERE menu_items.id = fnb_order_items.menu_item_id
  AND fnb_order_items.fulfillment_location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_units_property_location ON units(property_id, location_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_fnb_orders_origin_location ON fnb_orders(property_id, origin_location_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fnb_order_items_fulfillment_location ON fnb_order_items(property_id, fulfillment_location_id, item_status);

COMMIT;