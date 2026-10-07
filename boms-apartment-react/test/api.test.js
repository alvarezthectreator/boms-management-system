import assert from "node:assert/strict";
import test from "node:test";
import { createAuthMiddleware, hashPassword, registerAuthRoutes, verifyPassword } from "../auth-api.js";
import { registerFnbRoutes } from "../fnb-api.js";
import { syncLowStockNotifications } from "../inventory-alerts.js";
import { registerOperationsRoutes } from "../operations-api.js";
import { registerWorkspaceRoutes } from "../workspace-api.js";
import { registerReservationWorkflowRoutes, workerMayCheckOut } from "../reservation-workflow-api.js";
import { createRouteApp, createTestDatabase, seedFnb } from "./helpers.js";

const propertyId = "property_boms";

function headers(role = "worker", name = "Test User", idempotencyKey = "") {
  return {
    "x-test-role": role,
    "x-test-user-name": name,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

function createCashFnbOrder(app, extra = {}, idempotencyKey = "create-cash-order") {
  const created = app.call("POST", "/api/fnb/orders", {
    headers: headers("worker", "Test User", idempotencyKey),
    body: { items: [{ menuItemId: "menu-rice", quantity: 2 }], paymentMethod: "cash", ...extra },
  });
  assert.equal(created.code, 201);
  return created.body;
}

test("F&B acceptance deducts recipe stock exactly once", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerFnbRoutes(app, database, propertyId);

  const order = createCashFnbOrder(app);
  assert.equal(order.serviceKobo, 0);
  assert.equal(order.taxKobo, 0);
  assert.equal(order.totalKobo, order.subtotalKobo - order.discountKobo);
  const accepted = app.call("PATCH", `/api/fnb/orders/${order.id}/status`, {
    headers: headers(), body: { status: "accepted" },
  });
  assert.equal(accepted.code, 200);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4);
  assert.equal(database.prepare("SELECT count(*) AS count FROM stock_movements WHERE ref = ?").get(order.id).count, 1);
  assert.equal(database.prepare("SELECT user_id FROM audit_logs WHERE entity_id = ? AND action = 'accepted'").get(order.id).user_id, "test-worker");

  const retry = app.call("POST", "/api/fnb/orders", {
    headers: headers("worker", "Test User", "create-cash-order"),
    body: { items: [{ menuItemId: "menu-rice", quantity: 2 }], paymentMethod: "cash" },
  });
  assert.equal(retry.code, 200);
  assert.equal(retry.body.id, order.id);
  assert.equal(database.prepare("SELECT count(*) AS count FROM fnb_orders").get().count, 1);

  const repeated = app.call("PATCH", `/api/fnb/orders/${order.id}/status`, {
    headers: headers(), body: { status: "accepted" },
  });
  assert.equal(repeated.code, 409);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4);
  database.close();
});

test("inventory movement audit records the authenticated actor", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerOperationsRoutes(app, database, propertyId);

  const result = app.call("POST", "/api/inventory/stock-rice/movements", {
    headers: headers("worker", "Stock Worker", "stock-out-1"),
    body: { type: "out", quantity: 1, reason: "Kitchen usage" },
  });

  assert.equal(result.code, 201, result.body?.error);
  const audit = database.prepare("SELECT user_id, entity, action FROM audit_logs WHERE entity_id = ?").get(result.body.movement.id);
  assert.deepEqual(audit, { user_id: "test-worker", entity: "stock_movement", action: "out" });
  const retry = app.call("POST", "/api/inventory/stock-rice/movements", {
    headers: headers("worker", "Stock Worker", "stock-out-1"),
    body: { type: "out", quantity: 1, reason: "Kitchen usage" },
  });
  assert.equal(retry.code, 200);
  assert.equal(retry.body.movement.id, result.body.movement.id);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4);
  assert.equal(database.prepare("SELECT count(*) AS count FROM stock_movements WHERE item_id = 'stock-rice'").get().count, 1);
  database.close();
});

test("audit log is append-only and visible only to CEOs", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action) VALUES ('audit-1', ?, 'ceo-1', 'expense', 'exp-1', 'approved')").run(propertyId);
  registerWorkspaceRoutes(app, database, propertyId);

  const managerWorkspace = app.call("GET", "/api/workspace", { headers: headers("manager", "Manager") });
  const ceoWorkspace = app.call("GET", "/api/workspace", { headers: headers("ceo", "CEO") });
  assert.deepEqual(managerWorkspace.body.auditLogs, []);
  assert.equal(ceoWorkspace.body.auditLogs.length, 1);
  assert.throws(() => database.prepare("UPDATE audit_logs SET action = 'changed' WHERE id = 'audit-1'").run(), /append-only/);
  assert.throws(() => database.prepare("DELETE FROM audit_logs WHERE id = 'audit-1'").run(), /append-only/);
  database.close();
});

test("minibar consumption retry posts stock and movement once", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  database.prepare("INSERT INTO units (id, property_id, number) VALUES ('unit-1', ?, '101')").run(propertyId);
  registerFnbRoutes(app, database, propertyId);
  const request = {
    headers: headers("worker", "Stock Worker", "minibar-consume-1"),
    body: { unitId: "unit-1", quantity: 1, reason: "Guest minibar" },
  };

  const first = app.call("POST", "/api/inventory/stock-rice/minibar", request);
  const retry = app.call("POST", "/api/inventory/stock-rice/minibar", request);
  assert.equal(first.code, 201, first.body?.error);
  assert.equal(retry.code, 200);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4);
  assert.equal(database.prepare("SELECT count(*) AS count FROM minibar_movements").get().count, 1);
  database.close();
});

test("lounge orders save a personal guest name and cash payment method", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerFnbRoutes(app, database, propertyId);

  const order = createCashFnbOrder(app, { source: "lounge", guestName: "Lounge guest" });

  assert.equal(order.source, "lounge");
  assert.equal(order.guestName, "Lounge guest");
  assert.equal(order.paymentMethod, "cash");
  database.close();
});

test("cancelled accepted order restores stock and clears the order total", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerFnbRoutes(app, database, propertyId);

  const created = createCashFnbOrder(app);
  const accepted = app.call("PATCH", `/api/fnb/orders/${created.id}/status`, {
    headers: headers("manager", "Manager"), body: { status: "accepted" },
  });
  assert.equal(accepted.code, 200, accepted.body?.error);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4);

  const cancelled = app.call("PATCH", `/api/fnb/orders/${created.id}/status`, {
    headers: headers("manager", "Manager"), body: { status: "cancelled", reason: "Guest changed mind" },
  });
  assert.equal(cancelled.code, 200, cancelled.body?.error);
  assert.equal(cancelled.body.status, "cancelled");
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 5);
  assert.equal(database.prepare("SELECT count(*) AS count FROM stock_movements WHERE ref = ? AND type = 'in'").get(created.id).count, 1);
  database.close();
});

test("accepted order quantity changes only apply the stock and price delta", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerFnbRoutes(app, database, propertyId);

  const order = createCashFnbOrder(app);
  let accepted = app.call("PATCH", `/api/fnb/orders/${order.id}/status`, {
    headers: headers(), body: { status: "accepted" },
  });
  assert.equal(accepted.code, 200, accepted.body?.error);

  const changed = app.call("PATCH", `/api/fnb/orders/${order.id}`, {
    headers: headers("manager", "Manager"),
    body: {
      items: [{ id: order.items[0].id, quantity: 3 }],
    },
  });
  assert.equal(changed.code, 200, changed.body?.error);
  assert.equal(changed.body.items[0].quantity, 3);
  assert.equal(changed.body.totalKobo, 3000);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4 - 1);
  database.close();
});

test("weekly accounting report summarizes room, F&B, and expenses for the Lagos week", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, property_id TEXT, category TEXT, amount_kobo INTEGER,
      note TEXT, receipt_url TEXT, status TEXT, expense_date TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY, property_id TEXT, supplier_id TEXT, status TEXT,
      ordered_at TEXT, received_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY, property_id TEXT, purchase_order_id TEXT, item_id TEXT,
      qty INTEGER, cost_kobo INTEGER, expiry_date TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY, property_id TEXT, name TEXT,
      phone TEXT, email TEXT, address TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
  `);
  database.prepare("INSERT INTO units (id, property_id, number, deleted_at) VALUES (?, ?, ?, NULL)").run("unit-1", propertyId, "101");
  database.prepare("INSERT INTO guests (id, property_id, full_name, deleted_at) VALUES (?, ?, ?, NULL)").run("guest-1", propertyId, "Guest One");
  database.prepare("INSERT INTO bookings (id, property_id, guest_id, unit_id, status, check_in, check_out, nights, subtotal_kobo, discount_kobo, service_kobo, vat_kobo, total_kobo, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
    .run("booking-1", propertyId, "guest-1", "unit-1", "checked_in", "2026-10-05", "2026-10-12", 7, 70000, 0, 0, 0, 70000);
  database.prepare("INSERT INTO invoices (id, property_id, booking_id, total_kobo, paid_kobo, status, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)")
    .run("invoice-1", propertyId, "booking-1", 70000, 35000, "issued");
  database.prepare("INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, paid_at, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)")
    .run("pay-1", propertyId, "booking-1", "invoice-1", "cash", 20000, "REF-1", "paid", "2026-10-08T15:00:00Z");
  database.prepare("INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)")
    .run("stock-rice", propertyId, "Rice", "Food", "kg", 25, 5, 2000);
  database.prepare("INSERT INTO menu_categories (id, property_id, name, station, active) VALUES (?, ?, ?, ?, 1)")
    .run("cat-food", propertyId, "Food", "kitchen");
  database.prepare("INSERT INTO menu_items (id, property_id, category_id, name, description, price_kobo, station, available, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)")
    .run("menu-rice", propertyId, "cat-food", "Rice plate", "", 2000, "kitchen");
  database.prepare("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, modifier_id, qty, unit, deleted_at) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL)")
    .run("recipe-rice", propertyId, "menu-rice", "stock-rice", 1, "kg");
  database.prepare("INSERT INTO fnb_orders (id, property_id, order_number, status, source, room_unit_id, booking_id, guest_name, payment_method, subtotal_kobo, discount_kobo, tax_kobo, service_kobo, total_kobo, notes, created_by_label, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
    .run("fnb-1", propertyId, "FNB-1001", "billed", "restaurant", "unit-1", "booking-1", "Guest One", "cash", 2000, 0, 0, 0, 2000, null, "Test", "2026-10-07T19:30:00Z", "2026-10-07T19:30:00Z");
  database.prepare("INSERT INTO fnb_order_items (id, property_id, order_id, menu_item_id, item_name, station, qty, unit_price_kobo, modifiers_json, recipe_snapshot_json, stock_posted, item_status, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
    .run("fnb-line-1", propertyId, "fnb-1", "menu-rice", "Rice plate", "kitchen", 1, 2000, "[]", "[{\"inventoryItemId\":\"stock-rice\",\"quantity\":1}]", 1, "served", "2026-10-07T19:30:00Z", "2026-10-07T19:30:00Z");
  database.prepare("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, original_payment_id, reference, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("fnb-pay-1", propertyId, "fnb-1", "cash", 2000, "paid", null, "POS-1", "", "2026-10-07T19:35:00Z", "2026-10-07T19:35:00Z");
  database.prepare("INSERT INTO expenses (id, property_id, category, amount_kobo, note, receipt_url, status, expense_date, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)")
    .run("exp-1", propertyId, "Utilities", 50000, "Power", "approved", "2026-10-07");
  registerOperationsRoutes(app, database, propertyId);

  const report = app.call("GET", "/api/weekly-accounting?startDate=2026-10-05&endDate=2026-10-12", {
    headers: { ...headers("manager", "Manager") },
  });
  assert.equal(report.code, 200, report.body?.error);
  assert.equal(report.body.meta.timeZone, "Africa/Lagos");
  assert.equal(report.body.roomActivity.roomNightsSold, 7);
  assert.equal(report.body.fnb.grossSalesKobo, 2000);
  assert.equal(report.body.reconciliation.expensesKobo, 50000);
  database.close();
});

test("manager can update menu items and menu availability recalculates from stock", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerFnbRoutes(app, database, propertyId);

  const before = app.call("GET", "/api/fnb");
  const rice = before.body.menuItems.find((item) => item.id === "menu-rice");
  assert.equal(rice.available, true);

  const updated = app.call("PATCH", "/api/fnb/menu-items/menu-rice", {
    headers: headers("manager", "Manager"),
    body: {
      name: "Rice bowl",
      category: "Food",
      station: "kitchen",
      priceKobo: 1500,
      description: "Updated rice bowl",
      recipe: [{ inventoryItemId: "stock-rice", quantity: 2 }],
    },
  });
  assert.equal(updated.code, 200, updated.body?.error);
  assert.equal(updated.body.name, "Rice bowl");
  assert.equal(updated.body.priceKobo, 1500);
  assert.equal(updated.body.recipe[0].quantity, 2);

  database.prepare("UPDATE inventory_items SET qty = 1 WHERE id = 'stock-rice'").run();
  const refreshed = app.call("GET", "/api/fnb");
  const stale = refreshed.body.menuItems.find((item) => item.id === "menu-rice");
  assert.equal(stale.available, false);

  const ordered = app.call("POST", "/api/fnb/orders", {
    headers: headers("worker", "Test User", "out-of-stock-order"),
    body: { items: [{ menuItemId: "menu-rice", quantity: 1 }], paymentMethod: "cash" },
  });
  assert.equal(ordered.code, 409);
  assert.match(ordered.body.error, /unavailable|stock/i);
  database.close();
});

test("menu price and recipe changes do not alter historical order snapshots", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database);
  registerFnbRoutes(app, database, propertyId);

  const created = createCashFnbOrder(app);
  assert.equal(created.items[0].unitPriceKobo, 1000);

  const updated = app.call("PATCH", "/api/fnb/menu-items/menu-rice", {
    headers: headers("manager", "Manager"),
    body: {
      priceKobo: 1750,
      recipe: [{ inventoryItemId: "stock-rice", quantity: 1 }],
    },
  });
  assert.equal(updated.code, 200, updated.body?.error);

  const refreshed = app.call("GET", "/api/fnb");
  const order = refreshed.body.orders.find((entry) => entry.id === created.id);
  assert.equal(order.items[0].unitPriceKobo, 1000);
  assert.equal(order.items[0].name, "Rice plate");
  database.close();
});

test("billed room-charge order updates the folio without cash payment", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database, { withBooking: true });
  registerFnbRoutes(app, database, propertyId);
  const created = app.call("POST", "/api/fnb/orders", {
    headers: headers("worker", "Test User", "room-charge-order"),
    body: {
      items: [{ menuItemId: "menu-rice", quantity: 1 }],
      paymentMethod: "room_charge", bookingId: "booking-1", unitId: "unit-1",
    },
  });
  assert.equal(created.code, 201);
  const order = created.body;
  for (const status of ["accepted", "preparing", "ready", "served", "billed"]) {
    const result = app.call("PATCH", `/api/fnb/orders/${order.id}/status`, { headers: headers(), body: { status } });
    assert.equal(result.code, 200, result.body?.error);
  }

  assert.equal(order.serviceKobo, 0);
  assert.equal(order.taxKobo, 0);
  assert.equal(database.prepare("SELECT total_kobo FROM invoices WHERE id = 'invoice-1'").get().total_kobo, 6000);
  assert.equal(database.prepare("SELECT total_kobo FROM bookings WHERE id = 'booking-1'").get().total_kobo, 6000);
  assert.equal(database.prepare("SELECT method FROM fnb_order_payments WHERE order_id = ?").get(order.id).method, "room_charge");
  assert.equal(database.prepare("SELECT count(*) AS count FROM payments").get().count, 0);
  database.close();
});

test("worker can extend a checked-in stay by one night between 11 and noon", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO units (id, property_id, number) VALUES ('unit-1', ?, '101')").run(propertyId);
  database.prepare(`
    INSERT INTO bookings (
      id, property_id, unit_id, status, check_in, check_out, nights, rate_kobo,
      subtotal_kobo, service_kobo, vat_kobo, total_kobo
    ) VALUES ('booking-1', ?, 'unit-1', 'checked_in', '2026-10-05', '2026-10-06', 1, 10000, 10000, 0, 0, 10000)
  `).run(propertyId);
  database.prepare("INSERT INTO invoices (id, property_id, booking_id, total_kobo, paid_kobo, status) VALUES ('invoice-1', ?, 'booking-1', 10000, 10000, 'paid')").run(propertyId);
  registerReservationWorkflowRoutes(app, database, propertyId, {
    getDateTime: () => ({ date: "2026-10-06", time: "11:15" }),
  });

  const extended = app.call("PATCH", "/api/reservations/booking-1/extend", { headers: headers() });

  assert.equal(extended.code, 200, extended.body?.error);
  assert.equal(extended.body.checkOut, "2026-10-07");
  assert.equal(extended.body.nights, 2);
  assert.equal(extended.body.totalKobo, 20000);
  assert.equal(database.prepare("SELECT total_kobo FROM invoices WHERE id = 'invoice-1'").get().total_kobo, 20000);
  assert.equal(database.prepare("SELECT action FROM audit_logs WHERE entity_id = 'booking-1'").get().action, "extended_one_night");
  database.close();
});

test("worker stay extension is limited to the call window and rejects overlaps", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO units (id, property_id, number) VALUES ('unit-1', ?, '101')").run(propertyId);
  database.prepare(`
    INSERT INTO bookings (
      id, property_id, unit_id, status, check_in, check_out, nights, rate_kobo,
      subtotal_kobo, total_kobo
    ) VALUES ('booking-1', ?, 'unit-1', 'checked_in', '2026-10-05', '2026-10-06', 1, 10000, 10000, 10000)
  `).run(propertyId);
  database.prepare(`
    INSERT INTO bookings (id, property_id, unit_id, status, check_in, check_out)
    VALUES ('booking-2', ?, 'unit-1', 'confirmed', '2026-10-06', '2026-10-07')
  `).run(propertyId);
  registerReservationWorkflowRoutes(app, database, propertyId, {
    getDateTime: () => ({ date: "2026-10-06", time: "11:30" }),
  });

  const conflict = app.call("PATCH", "/api/reservations/booking-1/extend", { headers: headers() });
  assert.equal(conflict.code, 409);
  assert.match(conflict.body.error, /already booked/);
  assert.equal(database.prepare("SELECT check_out FROM bookings WHERE id = 'booking-1'").get().check_out, "2026-10-06");
  database.close();

  const beforeWindowDatabase = createTestDatabase();
  const beforeWindowApp = createRouteApp();
  beforeWindowDatabase.prepare("INSERT INTO units (id, property_id, number) VALUES ('unit-1', ?, '101')").run(propertyId);
  beforeWindowDatabase.prepare(`
    INSERT INTO bookings (
      id, property_id, unit_id, status, check_in, check_out, nights, rate_kobo,
      subtotal_kobo, total_kobo
    ) VALUES ('booking-1', ?, 'unit-1', 'checked_in', '2026-10-05', '2026-10-06', 1, 10000, 10000, 10000)
  `).run(propertyId);
  registerReservationWorkflowRoutes(beforeWindowApp, beforeWindowDatabase, propertyId, {
    getDateTime: () => ({ date: "2026-10-06", time: "10:59" }),
  });
  assert.equal(beforeWindowApp.call("PATCH", "/api/reservations/booking-1/extend", { headers: headers() }).code, 409);
  beforeWindowDatabase.close();
});

test("worker can check out only after noon on the due date with no balance", () => {
  assert.equal(workerMayCheckOut("checked_in", "2026-10-06", "2026-10-06", "12:00", 0), true);
  assert.equal(workerMayCheckOut("checked_in", "2026-10-06", "2026-10-06", "11:59", 0), false);
  assert.equal(workerMayCheckOut("checked_in", "2026-10-06", "2026-10-07", "12:00", 0), false);
  assert.equal(workerMayCheckOut("checked_in", "2026-10-06", "2026-10-06", "12:00", 100), false);
  assert.equal(workerMayCheckOut("cancelled", "2026-10-06", "2026-10-06", "12:00", 0), false);
});

test("room payment refunds create a linked reversal and update paid balance", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('manager-1', ?, 'Manager', 'manager@example.test', 'manager', 1)").run(propertyId);
  database.prepare("INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, paid_at) VALUES ('payment-1', ?, 'booking-1', 'invoice-1', 'cash', 10000, 'ref-1', 'paid', '2026-10-05')").run(propertyId);
  database.prepare("INSERT INTO invoices (id, property_id, booking_id, total_kobo, paid_kobo, status) VALUES ('invoice-1', ?, 'booking-1', 10000, 10000, 'paid')").run(propertyId);
  registerOperationsRoutes(app, database, propertyId);

  const refund = app.call("POST", "/api/payments/payment-1/refunds", {
    headers: headers("manager", "Manager", "payment-refund-1"), body: { amountKobo: 2500, reason: "Guest cancellation" },
  });
  assert.equal(refund.code, 201, refund.body?.error);
  assert.equal(refund.body.amountKobo, -2500);
  assert.equal(database.prepare("SELECT paid_kobo FROM invoices WHERE id = 'invoice-1'").get().paid_kobo, 7500);
  assert.equal(database.prepare("SELECT original_payment_id FROM payments WHERE id = ?").get(refund.body.id).original_payment_id, "payment-1");
  const retry = app.call("POST", "/api/payments/payment-1/refunds", {
    headers: headers("manager", "Manager", "payment-refund-1"), body: { amountKobo: 2500, reason: "Guest cancellation" },
  });
  assert.equal(retry.code, 200);
  assert.equal(retry.body.id, refund.body.id);
  assert.equal(database.prepare("SELECT count(*) AS count FROM payments WHERE original_payment_id = 'payment-1'").get().count, 1);
  database.close();
});

test("payment posting retry records one receipt and rejects key reuse with a different request", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO bookings (id, property_id, status, total_kobo) VALUES ('booking-1', ?, 'confirmed', 10000)").run(propertyId);
  database.prepare("INSERT INTO invoices (id, property_id, booking_id, total_kobo, paid_kobo, status) VALUES ('invoice-1', ?, 'booking-1', 10000, 0, 'issued')").run(propertyId);
  registerOperationsRoutes(app, database, propertyId);
  const request = {
    headers: headers("manager", "Manager", "payment-create-1"),
    body: { bookingId: "booking-1", amountKobo: 2500, method: "cash" },
  };

  const first = app.call("POST", "/api/payments", request);
  const retry = app.call("POST", "/api/payments", request);
  assert.equal(first.code, 201, first.body?.error);
  assert.equal(retry.code, 200);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(database.prepare("SELECT paid_kobo FROM invoices WHERE id = 'invoice-1'").get().paid_kobo, 2500);
  assert.equal(database.prepare("SELECT count(*) AS count FROM payments WHERE booking_id = 'booking-1'").get().count, 1);

  const mismatchedRetry = app.call("POST", "/api/payments", {
    headers: headers("manager", "Manager", "payment-create-1"),
    body: { bookingId: "booking-1", amountKobo: 3000, method: "cash" },
  });
  assert.equal(mismatchedRetry.code, 409);
  database.close();
});

test("worker role cannot create team members or manager-only menu items", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  registerWorkspaceRoutes(app, database, propertyId);
  registerFnbRoutes(app, database, propertyId);

  const userResult = app.call("POST", "/api/users", {
    headers: headers(), body: { name: "Unauthorized", email: "unauthorized@example.test", role: "manager" },
  });
  const menuResult = app.call("POST", "/api/fnb/menu-items", {
    headers: headers(), body: { name: "Dish", category: "Food", station: "kitchen", priceKobo: 100, recipe: [] },
  });
  assert.equal(userResult.code, 403);
  assert.equal(menuResult.code, 403);
  assert.equal(database.prepare("SELECT count(*) AS count FROM users").get().count, 0);
  database.close();
});

test("concierge folio charge posts once when a request is completed", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database, { withBooking: true });
  registerWorkspaceRoutes(app, database, propertyId);

  const created = app.call("POST", "/api/concierge", {
    headers: headers(),
    body: { guestId: "guest-1", unitId: "unit-1", type: "Laundry", details: "Express service", costKobo: 1000 },
  });
  assert.equal(created.code, 201, created.body?.error);
  assert.equal(database.prepare("SELECT count(*) AS count FROM booking_extras").get().count, 0);
  assert.equal(app.call("PATCH", `/api/concierge/${created.body.id}/status`, { headers: headers(), body: { status: "pending" } }).code, 200);
  assert.equal(app.call("PATCH", `/api/concierge/${created.body.id}/status`, { headers: headers(), body: { status: "done" } }).code, 200);
  assert.equal(database.prepare("SELECT total_kobo FROM invoices WHERE id = 'invoice-1'").get().total_kobo, 6000);
  assert.equal(database.prepare("SELECT count(*) AS count FROM booking_extras").get().count, 1);
  assert.equal(app.call("PATCH", `/api/concierge/${created.body.id}/status`, { headers: headers(), body: { status: "done" } }).code, 409);
  assert.equal(database.prepare("SELECT count(*) AS count FROM booking_extras").get().count, 1);
  database.close();
});

test("daily close uses persisted receipts and enforces manager access", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('manager-1', ?, 'Manager', 'manager@example.test', 'manager', 1)").run(propertyId);
  database.prepare("INSERT INTO payments (id, property_id, booking_id, method, amount_kobo, status, paid_at) VALUES ('payment-1', ?, 'booking-1', 'cash', 1000, 'paid', '2026-10-05')").run(propertyId);
  registerWorkspaceRoutes(app, database, propertyId);

  const denied = app.call("POST", "/api/daily-closings", {
    headers: headers(), body: { date: "2026-10-05", counted: { cash: 1000 }, note: "" },
  });
  assert.equal(denied.code, 403);
  const discrepancy = app.call("POST", "/api/daily-closings", {
    headers: headers("manager", "Manager"), body: { date: "2026-10-05", counted: { cash: 900 }, note: "" },
  });
  assert.equal(discrepancy.code, 400);
  const saved = app.call("POST", "/api/daily-closings", {
    headers: headers("manager", "Manager"), body: { date: "2026-10-05", counted: { cash: 1000 }, note: "" },
  });
  assert.equal(saved.code, 201, saved.body?.error);
  assert.equal(saved.body.expected.cash, 1000);
  assert.equal(saved.body.differenceKobo, 0);
  assert.equal(app.call("POST", "/api/daily-closings", {
    headers: headers("manager", "Manager"), body: { date: "2026-10-05", counted: { cash: 1000 }, note: "" },
  }).code, 409);
  database.close();
});

test("password login creates an HttpOnly session and role headers cannot authenticate", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  const password = "correct-horse-battery-staple";
  const passwordHash = hashPassword(password);
  database.prepare("INSERT INTO users (id, property_id, name, email, role, password_hash, active) VALUES ('worker-1', ?, 'Front Desk', 'desk@example.test', 'worker', ?, 1)")
    .run(propertyId, passwordHash);
  registerAuthRoutes(app, database, propertyId);

  const invalid = app.call("POST", "/api/auth/login", { body: { email: "desk@example.test", password: "wrong-password" } });
  assert.equal(invalid.code, 401);
  const login = app.call("POST", "/api/auth/login", { body: { email: "desk@example.test", password } });
  assert.equal(login.code, 200);
  assert.match(login.headers["set-cookie"], /HttpOnly/);
  assert.match(login.headers["set-cookie"], /SameSite=Strict/);
  assert.equal(login.body.user.role, "worker");
  assert.equal(verifyPassword(password, passwordHash), true);
  assert.equal(verifyPassword("incorrect", passwordHash), false);

  const middleware = createAuthMiddleware(database, propertyId);
  const denied = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  let nextCalled = false;
  middleware({ get: (name) => name === "x-boms-role" ? "ceo" : "", ip: "test" }, denied, () => { nextCalled = true; });
  assert.equal(denied.code, 401);
  assert.equal(nextCalled, false);

  const cookie = login.headers["set-cookie"].split(";")[0];
  const authenticated = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const authenticatedRequest = { get: (name) => name === "cookie" ? cookie : "", ip: "test" };
  middleware(authenticatedRequest, authenticated, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(authenticatedRequest.user.role, "worker");
  database.close();
});

test("manager can reset a staff password", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO users (id, property_id, name, email, role, password_hash, active) VALUES ('manager-1', ?, 'Manager', 'manager@example.test', 'manager', ?, 1)").run(propertyId, hashPassword("old-password"));
  database.prepare("INSERT INTO users (id, property_id, name, email, role, password_hash, active) VALUES ('worker-1', ?, 'Desk', 'desk@example.test', 'worker', ?, 1)").run(propertyId, hashPassword("old-password"));
  registerWorkspaceRoutes(app, database, propertyId);

  const updated = app.call("PUT", "/api/users/worker-1/password", {
    headers: headers("manager", "Manager"),
    body: { password: "manager-set-test-password" },
  });

  assert.equal(updated.code, 200, updated.body?.error);
  assert.equal(verifyPassword("manager-set-test-password", database.prepare("SELECT password_hash FROM users WHERE id = 'worker-1'").get().password_hash), true);
  database.close();
});

test("low-stock notifications alert management roles without duplicate active alerts", () => {
  const database = createTestDatabase();
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('worker-1', ?, 'Desk', 'desk@example.test', 'worker', 1)").run(propertyId);
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('manager-1', ?, 'Manager', 'manager@example.test', 'manager', 1)").run(propertyId);
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('ceo-1', ?, 'Admin', 'admin@example.test', 'ceo', 1)").run(propertyId);
  database.prepare("INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo) VALUES ('item-1', ?, 'Rice', 'Food', 'kg', 5, 5, 100)").run(propertyId);

  syncLowStockNotifications(database, propertyId);
  syncLowStockNotifications(database, propertyId);
  assert.equal(database.prepare("SELECT count(*) AS count FROM notifications WHERE type = 'low_stock:item-1' AND deleted_at IS NULL").get().count, 2);
  assert.equal(database.prepare("SELECT count(*) AS count FROM notifications WHERE user_id = 'worker-1'").get().count, 0);

  database.prepare("UPDATE inventory_items SET qty = 6 WHERE id = 'item-1'").run();
  syncLowStockNotifications(database, propertyId);
  assert.equal(database.prepare("SELECT count(*) AS count FROM notifications WHERE type = 'low_stock:item-1' AND deleted_at IS NULL").get().count, 0);
  database.prepare("UPDATE inventory_items SET qty = 4 WHERE id = 'item-1'").run();
  syncLowStockNotifications(database, propertyId);
  assert.equal(database.prepare("SELECT count(*) AS count FROM notifications WHERE type = 'low_stock:item-1' AND deleted_at IS NULL").get().count, 2);
  database.close();
});

test("purchase orders support multi-line drafts and partial receiving without increasing stock early", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, property_id TEXT, name TEXT, phone TEXT, email TEXT,
      address TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE purchase_orders (
      id TEXT PRIMARY KEY, property_id TEXT, supplier_id TEXT, status TEXT,
      ordered_at TEXT, received_at TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE purchase_order_lines (
      id TEXT PRIMARY KEY, property_id TEXT, purchase_order_id TEXT, item_id TEXT,
      qty REAL, cost_kobo INTEGER, expiry_date TEXT, created_at TEXT, updated_at TEXT,
      deleted_at TEXT
    );
  `);
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('manager-1', ?, 'Manager', 'manager@example.test', 'manager', 1)").run(propertyId);
  database.prepare("INSERT INTO suppliers (id, property_id, name) VALUES ('supplier-1', ?, 'Fresh Foods')").run(propertyId);
  database.prepare("INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo) VALUES ('item-1', ?, 'Rice', 'Food', 'kg', 10, 2, 250)").run(propertyId);
  database.prepare("INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo) VALUES ('item-2', ?, 'Beans', 'Food', 'kg', 3, 1, 300)").run(propertyId);
  registerOperationsRoutes(app, database, propertyId);

  const created = app.call("POST", "/api/purchase-orders", {
    headers: headers("manager", "Manager"),
    body: {
      supplierId: "supplier-1",
      lines: [
        { itemId: "item-1", quantity: 8, costKobo: 250, expiryDate: "2026-12-31" },
        { itemId: "item-2", quantity: 5, costKobo: 300 },
      ],
    },
  });

  assert.equal(created.code, 201, created.body?.error);
  assert.equal(created.body.status, "draft");
  assert.equal(created.body.lines.length, 2);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'item-1'").get().qty, 10);

  const approved = app.call("PATCH", `/api/purchase-orders/${created.body.id}/status`, {
    headers: headers("manager", "Manager"),
    body: { status: "approved" },
  });
  assert.equal(approved.code, 200, approved.body?.error);

  const partial = app.call("PATCH", `/api/purchase-orders/${created.body.id}/status`, {
    headers: headers("manager", "Manager", "receive-partial-1"),
    body: { status: "received", lineQty: { "item-1": 5 } },
  });
  assert.equal(partial.code, 200, partial.body?.error);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'item-1'").get().qty, 15);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'item-2'").get().qty, 3);
  assert.equal(database.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(created.body.id).status, "approved");

  const partialRetry = app.call("PATCH", `/api/purchase-orders/${created.body.id}/status`, {
    headers: headers("manager", "Manager", "receive-partial-1"),
    body: { status: "received", lineQty: { "item-1": 5 } },
  });
  assert.equal(partialRetry.code, 200);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'item-1'").get().qty, 15);

  const fullyReceived = app.call("PATCH", `/api/purchase-orders/${created.body.id}/status`, {
    headers: headers("manager", "Manager", "receive-final-1"),
    body: { status: "received" },
  });
  assert.equal(fullyReceived.code, 200, fullyReceived.body?.error);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'item-2'").get().qty, 8);
  assert.equal(database.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(created.body.id).status, "received");

  database.close();
});