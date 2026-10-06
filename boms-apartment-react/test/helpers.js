import Database from "better-sqlite3";

export function createTestDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE properties (id TEXT PRIMARY KEY);
    INSERT INTO properties VALUES ('property_boms');
    CREATE TABLE users (
      id TEXT PRIMARY KEY, property_id TEXT, name TEXT, email TEXT, role TEXT,
      active INTEGER DEFAULT 1, password_hash TEXT, last_login TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, property_id TEXT, user_id TEXT, token_hash TEXT UNIQUE,
      created_at TEXT, expires_at TEXT
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, property_id TEXT, user_id TEXT, type TEXT, title TEXT,
      body TEXT, read_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, property_id TEXT, user_id TEXT, entity TEXT, entity_id TEXT,
      action TEXT, old_json TEXT, new_json TEXT, created_at TEXT
    );
    CREATE TABLE housekeeping_tasks (id TEXT PRIMARY KEY, assigned_to_label TEXT);
    CREATE TABLE property_settings (
      property_id TEXT, key TEXT, value_json TEXT, updated_at TEXT, updated_by TEXT,
      PRIMARY KEY (property_id, key)
    );
    CREATE TABLE guests (id TEXT PRIMARY KEY, property_id TEXT, full_name TEXT, deleted_at TEXT);
    CREATE TABLE units (id TEXT PRIMARY KEY, property_id TEXT, number TEXT, deleted_at TEXT);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, property_id TEXT, guest_id TEXT, unit_id TEXT, status TEXT,
      subtotal_kobo INTEGER DEFAULT 0, discount_kobo INTEGER DEFAULT 0,
      service_kobo INTEGER DEFAULT 0, vat_kobo INTEGER DEFAULT 0, total_kobo INTEGER DEFAULT 0,
      updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY, property_id TEXT, booking_id TEXT, total_kobo INTEGER,
      paid_kobo INTEGER DEFAULT 0, status TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE booking_extras (
      id TEXT PRIMARY KEY, property_id TEXT, booking_id TEXT, description TEXT,
      qty REAL, unit_price_kobo INTEGER, source TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY, property_id TEXT, booking_id TEXT, invoice_id TEXT, method TEXT,
      amount_kobo INTEGER, reference TEXT, status TEXT, original_payment_id TEXT,
      paid_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE inventory_items (
      id TEXT PRIMARY KEY, property_id TEXT, name TEXT, category TEXT, unit TEXT,
      qty REAL DEFAULT 0, min_qty REAL DEFAULT 0, cost_kobo INTEGER DEFAULT 0,
      supplier_id TEXT, deleted_at TEXT, updated_at TEXT
    );
    CREATE TABLE inventory_batches (
      id TEXT PRIMARY KEY, property_id TEXT, item_id TEXT, batch_code TEXT,
      received_qty REAL, remaining_qty REAL, unit_cost_kobo INTEGER,
      received_at TEXT, expiry_date TEXT, deleted_at TEXT, updated_at TEXT
    );
    CREATE TABLE stock_movements (
      id TEXT PRIMARY KEY, property_id TEXT, item_id TEXT, type TEXT, qty REAL,
      reason TEXT, ref TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE menu_categories (
      id TEXT PRIMARY KEY, property_id TEXT, name TEXT, station TEXT, active INTEGER DEFAULT 1
    );
    CREATE TABLE menu_items (
      id TEXT PRIMARY KEY, property_id TEXT, category_id TEXT, name TEXT, description TEXT,
      price_kobo INTEGER, station TEXT, available INTEGER DEFAULT 1,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE menu_recipe_lines (
      id TEXT PRIMARY KEY, property_id TEXT, menu_item_id TEXT, inventory_item_id TEXT,
      modifier_id TEXT, qty REAL, unit TEXT, deleted_at TEXT
    );
    CREATE TABLE menu_modifiers (
      id TEXT PRIMARY KEY, property_id TEXT, menu_item_id TEXT, name TEXT,
      price_delta_kobo INTEGER, active INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE fnb_orders (
      id TEXT PRIMARY KEY, property_id TEXT, order_number TEXT, status TEXT, source TEXT,
      room_unit_id TEXT, booking_id TEXT, guest_name TEXT, payment_method TEXT,
      subtotal_kobo INTEGER, discount_kobo INTEGER, tax_kobo INTEGER, service_kobo INTEGER,
      total_kobo INTEGER, notes TEXT, created_by_label TEXT, billed_at TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE fnb_order_items (
      id TEXT PRIMARY KEY, property_id TEXT, order_id TEXT, menu_item_id TEXT,
      item_name TEXT, station TEXT, qty INTEGER, unit_price_kobo INTEGER,
      modifiers_json TEXT, recipe_snapshot_json TEXT, stock_posted INTEGER DEFAULT 0,
      item_status TEXT DEFAULT 'new', created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE fnb_order_payments (
      id TEXT PRIMARY KEY, property_id TEXT, order_id TEXT, method TEXT, amount_kobo INTEGER,
      status TEXT, original_payment_id TEXT, reference TEXT, reason TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE minibar_movements (
      id TEXT PRIMARY KEY, property_id TEXT, unit_id TEXT, booking_id TEXT, item_id TEXT,
      qty REAL, unit_price_kobo INTEGER, movement_type TEXT, reason TEXT, created_at TEXT
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, property_id TEXT, guest_id TEXT, booking_id TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, property_id TEXT, conversation_id TEXT, guest_id TEXT,
      booking_id TEXT, sender_type TEXT, sender_id TEXT, body TEXT, read_at TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE reviews (
      id TEXT PRIMARY KEY, property_id TEXT, booking_id TEXT, guest_id TEXT,
      rating_overall INTEGER, comment TEXT, reply TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE concierge_requests (
      id TEXT PRIMARY KEY, property_id TEXT, booking_id TEXT, unit_id TEXT, guest_id TEXT,
      type TEXT, details TEXT, cost_kobo INTEGER, status TEXT, assigned_to TEXT,
      assigned_to_label TEXT, completed_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE daily_closings (
      property_id TEXT, close_date TEXT, expected_json TEXT, counted_json TEXT,
      difference_kobo INTEGER, note TEXT, closed_by TEXT, closed_at TEXT,
      UNIQUE (property_id, close_date)
    );
  `);
  return database;
}

export function createRouteApp() {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    app[method] = (path, handler) => routes.push({ method: method.toUpperCase(), path, handler });
  }
  return {
    ...app,
    call(method, path, { body = {}, headers = {} } = {}) {
      const route = routes.find((candidate) => {
        if (candidate.method !== method.toUpperCase()) return false;
        const names = [];
        const pattern = candidate.path.replace(/:[^/]+/g, (token) => {
          names.push(token.slice(1));
          return "([^/]+)";
        });
          return new RegExp(`^${pattern}$`).test(path);
      });
      if (!route) throw new Error(`Route not registered: ${method} ${path}`);
      const names = [];
      const pattern = route.path.replace(/:[^/]+/g, (token) => {
        names.push(token.slice(1));
        return "([^/]+)";
      });
      const match = path.match(new RegExp(`^${pattern}$`));
      const response = {
        code: 200,
        body: undefined,
        headers: {},
        status(code) { this.code = code; return this; },
        json(value) { this.body = value; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
        end() { this.ended = true; return this; },
      };
      route.handler({
        body,
        path,
        ip: "test",
        secure: false,
        user: {
          id: headers["x-test-user-id"] || `test-${headers["x-test-role"] || "worker"}`,
          name: headers["x-test-user-name"] || "Test User",
          role: headers["x-test-role"] || "worker",
        },
        params: Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])])),
        get(name) { return headers[name.toLowerCase()] || headers[name] || undefined; },
      }, response);
      return response;
    },
  };
}

export function seedFnb(database, { withBooking = false } = {}) {
  database.prepare("INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("stock-rice", "property_boms", "Rice", "Food", "kg", 5, 1, 100);
  database.prepare("INSERT INTO menu_categories (id, property_id, name, station, active) VALUES (?, ?, ?, ?, 1)")
    .run("cat-food", "property_boms", "Food", "kitchen");
  database.prepare("INSERT INTO menu_items (id, property_id, category_id, name, description, price_kobo, station, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    .run("menu-rice", "property_boms", "cat-food", "Rice plate", "", 1000, "kitchen");
  database.prepare("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, qty, unit) VALUES (?, ?, ?, ?, ?, ?)")
    .run("recipe-rice", "property_boms", "menu-rice", "stock-rice", 0.5, "kg");
  if (withBooking) {
    database.prepare("INSERT INTO guests (id, property_id, full_name) VALUES (?, ?, ?)").run("guest-1", "property_boms", "Guest One");
    database.prepare("INSERT INTO units (id, property_id, number) VALUES (?, ?, ?)").run("unit-1", "property_boms", "101");
    database.prepare("INSERT INTO bookings (id, property_id, guest_id, unit_id, status, subtotal_kobo, total_kobo) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("booking-1", "property_boms", "guest-1", "unit-1", "checked_in", 5000, 5000);
    database.prepare("INSERT INTO invoices (id, property_id, booking_id, total_kobo, paid_kobo, status) VALUES (?, ?, ?, ?, ?, ?)")
      .run("invoice-1", "property_boms", "booking-1", 5000, 0, "issued");
  }
}