CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  UNIQUE (property_id, name)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  category_id TEXT NOT NULL REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS menu_items_property_station_idx ON menu_items(property_id, station, available);

CREATE TABLE IF NOT EXISTS menu_recipe_lines (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  modifier_id TEXT,
  qty REAL NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS menu_recipe_item_idx ON menu_recipe_lines(property_id, menu_item_id);

CREATE TABLE IF NOT EXISTS menu_modifiers (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  price_delta_kobo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS menu_modifiers_item_idx ON menu_modifiers(property_id, menu_item_id, active);

CREATE TABLE IF NOT EXISTS fnb_orders (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  order_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'accepted', 'preparing', 'ready', 'served', 'billed', 'cancelled')),
  source TEXT NOT NULL CHECK (source IN ('room_service', 'restaurant', 'bar', 'counter', 'poolside')),
  room_unit_id TEXT REFERENCES units(id),
  booking_id TEXT REFERENCES bookings(id),
  guest_name TEXT,
  payment_method TEXT CHECK (payment_method IN ('room_charge', 'cash', 'card', 'transfer')),
  subtotal_kobo INTEGER NOT NULL CHECK (subtotal_kobo >= 0),
  discount_kobo INTEGER NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0),
  tax_kobo INTEGER NOT NULL DEFAULT 0 CHECK (tax_kobo >= 0),
  total_kobo INTEGER NOT NULL CHECK (total_kobo >= 0),
  notes TEXT,
  created_by_label TEXT,
  billed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT,
  UNIQUE (property_id, order_number)
);
CREATE INDEX IF NOT EXISTS fnb_orders_queue_idx ON fnb_orders(property_id, status, created_at);
CREATE INDEX IF NOT EXISTS fnb_orders_booking_idx ON fnb_orders(property_id, booking_id, created_at);

CREATE TABLE IF NOT EXISTS fnb_order_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  order_id TEXT NOT NULL REFERENCES fnb_orders(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
  modifiers_json TEXT NOT NULL DEFAULT '[]',
  recipe_snapshot_json TEXT NOT NULL DEFAULT '[]',
  stock_posted INTEGER NOT NULL DEFAULT 0 CHECK (stock_posted IN (0, 1)),
  item_status TEXT NOT NULL DEFAULT 'new' CHECK (item_status IN ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS fnb_order_items_order_idx ON fnb_order_items(property_id, order_id, station);

CREATE TABLE IF NOT EXISTS fnb_order_payments (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  order_id TEXT NOT NULL REFERENCES fnb_orders(id),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'room_charge', 'refund')),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo != 0),
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded')),
  original_payment_id TEXT REFERENCES fnb_order_payments(id),
  reference TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS fnb_order_payments_order_idx ON fnb_order_payments(property_id, order_id);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  batch_code TEXT,
  received_qty REAL NOT NULL CHECK (received_qty > 0),
  remaining_qty REAL NOT NULL CHECK (remaining_qty >= 0),
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_kobo >= 0),
  received_at TEXT NOT NULL,
  expiry_date TEXT,
  supplier_id TEXT REFERENCES suppliers(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS inventory_batches_expiry_idx ON inventory_batches(property_id, item_id, expiry_date, remaining_qty);

CREATE TABLE IF NOT EXISTS minibar_movements (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  booking_id TEXT REFERENCES bookings(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  qty REAL NOT NULL CHECK (qty > 0),
  unit_price_kobo INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_kobo >= 0),
  booking_extra_id TEXT REFERENCES booking_extras(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('consume', 'restock', 'count')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS minibar_movements_unit_idx ON minibar_movements(property_id, unit_id, booking_id, created_at);
