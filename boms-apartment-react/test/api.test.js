import assert from "node:assert/strict";
import test from "node:test";
import { createAuthMiddleware, hashPassword, registerAuthRoutes, verifyPassword } from "../auth-api.js";
import { registerFnbRoutes } from "../fnb-api.js";
import { syncLowStockNotifications } from "../inventory-alerts.js";
import { registerOperationsRoutes } from "../operations-api.js";
import { registerWorkspaceRoutes } from "../workspace-api.js";
import { createRouteApp, createTestDatabase, seedFnb } from "./helpers.js";

const propertyId = "property_boms";

function headers(role = "worker", name = "Test User") {
  return { "x-test-role": role, "x-test-user-name": name };
}

function createCashFnbOrder(app) {
  const created = app.call("POST", "/api/fnb/orders", {
    headers: headers(),
    body: { items: [{ menuItemId: "menu-rice", quantity: 2 }], paymentMethod: "cash" },
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

  const repeated = app.call("PATCH", `/api/fnb/orders/${order.id}/status`, {
    headers: headers(), body: { status: "accepted" },
  });
  assert.equal(repeated.code, 409);
  assert.equal(database.prepare("SELECT qty FROM inventory_items WHERE id = 'stock-rice'").get().qty, 4);
  database.close();
});

test("billed room-charge order updates the folio without cash payment", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  seedFnb(database, { withBooking: true });
  registerFnbRoutes(app, database, propertyId);
  const created = app.call("POST", "/api/fnb/orders", {
    headers: headers(),
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

test("room payment refunds create a linked reversal and update paid balance", () => {
  const database = createTestDatabase();
  const app = createRouteApp();
  database.prepare("INSERT INTO users (id, property_id, name, email, role, active) VALUES ('manager-1', ?, 'Manager', 'manager@example.test', 'manager', 1)").run(propertyId);
  database.prepare("INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, paid_at) VALUES ('payment-1', ?, 'booking-1', 'invoice-1', 'cash', 10000, 'ref-1', 'paid', '2026-10-05')").run(propertyId);
  database.prepare("INSERT INTO invoices (id, property_id, booking_id, total_kobo, paid_kobo, status) VALUES ('invoice-1', ?, 'booking-1', 10000, 10000, 'paid')").run(propertyId);
  registerOperationsRoutes(app, database, propertyId);

  const refund = app.call("POST", "/api/payments/payment-1/refunds", {
    headers: headers("manager", "Manager"), body: { amountKobo: 2500, reason: "Guest cancellation" },
  });
  assert.equal(refund.code, 201, refund.body?.error);
  assert.equal(refund.body.amountKobo, -2500);
  assert.equal(database.prepare("SELECT paid_kobo FROM invoices WHERE id = 'invoice-1'").get().paid_kobo, 7500);
  assert.equal(database.prepare("SELECT original_payment_id FROM payments WHERE id = ?").get(refund.body.id).original_payment_id, "payment-1");
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