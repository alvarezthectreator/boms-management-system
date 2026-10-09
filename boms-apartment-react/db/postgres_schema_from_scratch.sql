-- Fresh PostgreSQL schema for the BOMS apartment app
-- Safe to run in a new Supabase project.
-- This creates the tables needed by the app and inserts the default property + room seed data.

BEGIN;

DROP TABLE IF EXISTS daily_closings CASCADE;
DROP TABLE IF EXISTS concierge_requests CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS minibar_movements CASCADE;
DROP TABLE IF EXISTS fnb_order_payments CASCADE;
DROP TABLE IF EXISTS fnb_order_items CASCADE;
DROP TABLE IF EXISTS fnb_orders CASCADE;
DROP TABLE IF EXISTS menu_modifiers CASCADE;
DROP TABLE IF EXISTS menu_recipe_lines CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS inventory_batches CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS booking_extras CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS out_of_order_blocks CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS property_settings CASCADE;
DROP TABLE IF EXISTS housekeeping_tasks CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS api_idempotency_keys CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS properties CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS purchase_order_lines CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE room_types (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  size_m2 REAL DEFAULT 0,
  bed_type TEXT,
  max_guests INTEGER NOT NULL DEFAULT 2,
  description TEXT,
  base_rate_kobo INTEGER NOT NULL DEFAULT 0,
  photos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT,
  email TEXT,
  role TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  password_hash TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE api_idempotency_keys (
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, user_id, scope, idempotency_key)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT,
  title TEXT,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  user_id TEXT REFERENCES users(id),
  entity TEXT,
  entity_id TEXT,
  action TEXT,
  old_json JSONB,
  new_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log records are append-only';
END;
$$;

CREATE TRIGGER audit_logs_reject_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_reject_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TABLE housekeeping_tasks (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  assigned_to_label TEXT,
  title TEXT,
  details TEXT,
  status TEXT,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE property_settings (
  property_id TEXT NOT NULL REFERENCES properties(id),
  key TEXT NOT NULL,
  value_json TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  PRIMARY KEY (property_id, key)
);

CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  nationality TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT,
  number TEXT,
  floor INTEGER,
  room_type_id TEXT REFERENCES room_types(id),
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE out_of_order_blocks (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  unit_id TEXT REFERENCES units(id),
  start_date DATE,
  end_date DATE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  guest_id TEXT REFERENCES guests(id),
  unit_id TEXT REFERENCES units(id),
  status TEXT,
  check_in DATE,
  check_out DATE,
  nights INTEGER NOT NULL DEFAULT 0,
  rate_kobo INTEGER NOT NULL DEFAULT 0,
  subtotal_kobo INTEGER NOT NULL DEFAULT 0,
  discount_kobo INTEGER NOT NULL DEFAULT 0,
  service_kobo INTEGER NOT NULL DEFAULT 0,
  vat_kobo INTEGER NOT NULL DEFAULT 0,
  total_kobo INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  booking_id TEXT REFERENCES bookings(id),
  total_kobo INTEGER,
  paid_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE booking_extras (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  booking_id TEXT REFERENCES bookings(id),
  description TEXT,
  qty REAL,
  unit_price_kobo INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  booking_id TEXT REFERENCES bookings(id),
  invoice_id TEXT REFERENCES invoices(id),
  method TEXT,
  amount_kobo INTEGER,
  reference TEXT,
  status TEXT,
  original_payment_id TEXT REFERENCES payments(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  qty REAL NOT NULL DEFAULT 0,
  min_qty REAL NOT NULL DEFAULT 0,
  cost_kobo INTEGER NOT NULL DEFAULT 0,
  supplier_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE inventory_batches (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  batch_code TEXT,
  received_qty REAL NOT NULL CHECK (received_qty > 0),
  remaining_qty REAL NOT NULL CHECK (remaining_qty >= 0),
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date DATE,
  supplier_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  type TEXT,
  qty REAL,
  reason TEXT,
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE menu_categories (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ,
  UNIQUE (property_id, name)
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  category_id TEXT NOT NULL REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price_kobo INTEGER NOT NULL CHECK (price_kobo >= 0),
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE menu_recipe_lines (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  modifier_id TEXT,
  qty REAL NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE menu_modifiers (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  price_delta_kobo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE fnb_orders (
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
  service_kobo INTEGER NOT NULL DEFAULT 0 CHECK (service_kobo >= 0),
  total_kobo INTEGER NOT NULL CHECK (total_kobo >= 0),
  notes TEXT,
  created_by_label TEXT,
  billed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ,
  UNIQUE (property_id, order_number)
);

CREATE TABLE fnb_order_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  order_id TEXT NOT NULL REFERENCES fnb_orders(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
  modifiers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock_posted INTEGER NOT NULL DEFAULT 0 CHECK (stock_posted IN (0, 1)),
  item_status TEXT NOT NULL DEFAULT 'new' CHECK (item_status IN ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE fnb_order_payments (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  order_id TEXT NOT NULL REFERENCES fnb_orders(id),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'room_charge', 'refund')),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo != 0),
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded')),
  original_payment_id TEXT REFERENCES fnb_order_payments(id),
  reference TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE minibar_movements (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  guest_id TEXT REFERENCES guests(id),
  booking_id TEXT REFERENCES bookings(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  guest_id TEXT REFERENCES guests(id),
  booking_id TEXT REFERENCES bookings(id),
  sender_type TEXT,
  sender_id TEXT,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  booking_id TEXT REFERENCES bookings(id),
  guest_id TEXT REFERENCES guests(id),
  rating_overall INTEGER,
  comment TEXT,
  reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE concierge_requests (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  booking_id TEXT REFERENCES bookings(id),
  unit_id TEXT REFERENCES units(id),
  guest_id TEXT REFERENCES guests(id),
  type TEXT,
  details TEXT,
  cost_kobo INTEGER,
  status TEXT,
  assigned_to TEXT,
  assigned_to_label TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE daily_closings (
  property_id TEXT NOT NULL REFERENCES properties(id),
  close_date DATE NOT NULL,
  expected_json JSONB,
  counted_json JSONB,
  difference_kobo INTEGER,
  note TEXT,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (property_id, close_date)
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  supplier_id TEXT REFERENCES suppliers(id),
  status TEXT,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE purchase_order_lines (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  qty INTEGER,
  cost_kobo INTEGER,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  category TEXT,
  amount_kobo INTEGER,
  note TEXT,
  receipt_url TEXT,
  status TEXT,
  expense_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_created_at ON api_idempotency_keys(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(property_id, item_id, expiry_date, remaining_qty);
CREATE INDEX IF NOT EXISTS idx_menu_items_property_station ON menu_items(property_id, station, available);
CREATE INDEX IF NOT EXISTS idx_menu_items_property ON menu_items(property_id, category_id, available);
CREATE INDEX IF NOT EXISTS idx_menu_recipe_item ON menu_recipe_lines(property_id, menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_modifiers_item ON menu_modifiers(property_id, menu_item_id, active);
CREATE INDEX IF NOT EXISTS idx_fnb_orders_queue ON fnb_orders(property_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_fnb_orders_booking ON fnb_orders(property_id, booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fnb_order_items_order ON fnb_order_items(property_id, order_id, station);
CREATE INDEX IF NOT EXISTS idx_fnb_order_payments_order ON fnb_order_payments(property_id, order_id);
CREATE INDEX IF NOT EXISTS idx_minbar_movements_unit ON minibar_movements(property_id, unit_id, booking_id, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_room_types_updated_at
BEFORE UPDATE ON room_types
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_housekeeping_tasks_updated_at
BEFORE UPDATE ON housekeeping_tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_guests_updated_at
BEFORE UPDATE ON guests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_units_updated_at
BEFORE UPDATE ON units
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_out_of_order_blocks_updated_at
BEFORE UPDATE ON out_of_order_blocks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_booking_extras_updated_at
BEFORE UPDATE ON booking_extras
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_items_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_batches_updated_at
BEFORE UPDATE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_stock_movements_updated_at
BEFORE UPDATE ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_categories_updated_at
BEFORE UPDATE ON menu_categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_items_updated_at
BEFORE UPDATE ON menu_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_recipe_lines_updated_at
BEFORE UPDATE ON menu_recipe_lines
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_modifiers_updated_at
BEFORE UPDATE ON menu_modifiers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fnb_orders_updated_at
BEFORE UPDATE ON fnb_orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fnb_order_items_updated_at
BEFORE UPDATE ON fnb_order_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fnb_order_payments_updated_at
BEFORE UPDATE ON fnb_order_payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_minibar_movements_updated_at
BEFORE UPDATE ON minibar_movements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_concierge_requests_updated_at
BEFORE UPDATE ON concierge_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_purchase_order_lines_updated_at
BEFORE UPDATE ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO properties (id, name) VALUES ('property_boms', 'BOMS')
ON CONFLICT (id) DO NOTHING;

WITH room_names(name, slug) AS (
  VALUES
    ('Pearl', 'pearl'),
    ('Silver', 'silver'),
    ('Gold', 'gold'),
    ('Royal', 'royal'),
    ('Diamond', 'diamond'),
    ('Emerald', 'emerald'),
    ('Ruby', 'ruby'),
    ('Oasis', 'oasis'),
    ('Harmony', 'harmony'),
    ('Azure', 'azure'),
    ('Prestige', 'prestige'),
    ('Comfort', 'comfort'),
    ('Grand', 'grand')
)
INSERT INTO room_types (id, property_id, name, created_at, updated_at)
SELECT
  'room_type_' || room_names.slug,
  'property_boms',
  room_names.name,
  NOW(),
  NOW()
FROM room_names
ON CONFLICT (id) DO NOTHING;

WITH room_names(name, slug) AS (
  VALUES
    ('Pearl', 'pearl'),
    ('Silver', 'silver'),
    ('Gold', 'gold'),
    ('Royal', 'royal'),
    ('Diamond', 'diamond'),
    ('Emerald', 'emerald'),
    ('Ruby', 'ruby'),
    ('Oasis', 'oasis'),
    ('Harmony', 'harmony'),
    ('Azure', 'azure'),
    ('Prestige', 'prestige'),
    ('Comfort', 'comfort'),
    ('Grand', 'grand')
)
INSERT INTO units (id, property_id, name, number, room_type_id, status, created_at, updated_at)
SELECT
  'unit_' || room_names.slug,
  'property_boms',
  room_names.name,
  room_names.name,
  'room_type_' || room_names.slug,
  'available',
  NOW(),
  NOW()
FROM room_names
ON CONFLICT (id) DO NOTHING;

UPDATE units
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = 'unit_rugby';

UPDATE room_types
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = 'room_type_rugby';

COMMIT;
