import crypto from "node:crypto";
import { syncLowStockNotifications } from "./inventory-alerts.js";

const nowSql = "CURRENT_TIMESTAMP";
const managerRoles = ["manager", "ceo"];

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function sendError(response, error) {
  response.status(error.status || 500).json({ error: error.message || "Request failed." });
}

function requireRole(request, response, roles) {
  if (!roles.includes(request.user?.role)) {
    response.status(403).json({ error: "Your role cannot perform this action." });
    return false;
  }
  return true;
}

function mapGuest(row) {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone,
    email: row.email || "",
    nationality: row.nationality || "—",
    idNumber: row.id_number || "",
    tier: row.loyalty_tier,
    points: row.points,
  };
}

function mapInventory(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    quantity: row.qty,
    minimum: row.min_qty,
    costKobo: row.cost_kobo,
    supplierId: row.supplier_id || "",
    databaseItem: true,
  };
}

function mapBatch(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    batchCode: row.batch_code || "",
    receivedQuantity: row.received_qty,
    remainingQuantity: row.remaining_qty,
    unitCostKobo: row.unit_cost_kobo,
    receivedAt: row.received_at,
    expiryDate: row.expiry_date || "",
    databaseBatch: true,
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    type: row.type,
    quantity: row.qty,
    reason: row.reason,
    date: row.created_at?.slice(0, 10),
    databaseMovement: true,
  };
}

function mapTask(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    bookingId: row.booking_id || "",
    type: row.type,
    status: row.status,
    priority: row.priority[0].toUpperCase() + row.priority.slice(1),
    assignedTo: row.assigned_to_name || row.assigned_to_label || "Unassigned",
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    inspectedBy: row.inspected_by || "",
    inspectionNote: row.inspection_note || "",
    databaseTask: true,
  };
}

function mapExpense(row) {
  return {
    id: row.id,
    category: row.category,
    amountKobo: row.amount_kobo,
    note: row.note,
    status: row.status,
    date: row.expense_date,
    receiptUrl: row.receipt_url || "",
    databaseExpense: true,
  };
}

function mapPayment(row) {
  const labels = {
    cash: "Cash",
    transfer: "Transfer",
    card: "Card",
    online: "Online",
    bill_to_company: "Bill to company",
    refund: "Refund",
  };
  return {
    id: row.id,
    bookingId: row.booking_id,
    invoiceId: row.invoice_id || "",
    originalPaymentId: row.original_payment_id || "",
    method: labels[row.method] || row.method,
    amountKobo: row.amount_kobo,
    reference: row.reference || "",
    status: row.status,
    paidAt: row.paid_at?.slice(0, 10) || "",
    databasePayment: true,
  };
}

function mapInvoice(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    guestId: row.guest_id,
    totalKobo: row.total_kobo,
    paidKobo: row.paid_kobo,
    status: row.status,
    dueDate: row.due_date || "",
    databaseInvoice: true,
  };
}

function readOperations(database, propertyId) {
  const inventory = database.prepare(`
    SELECT * FROM inventory_items
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY name
  `).all(propertyId).map(mapInventory);
  const stockMovements = database.prepare(`
    SELECT * FROM stock_movements
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
  `).all(propertyId).map(mapMovement);
  const batches = database.prepare(`
    SELECT * FROM inventory_batches
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY expiry_date, received_at
  `).all(propertyId).map(mapBatch);
  const tasks = database.prepare(`
    SELECT housekeeping_tasks.*, users.name AS assigned_to_name
    FROM housekeeping_tasks
    LEFT JOIN users ON users.id = housekeeping_tasks.assigned_to
    WHERE housekeeping_tasks.property_id = ? AND housekeeping_tasks.deleted_at IS NULL
    ORDER BY housekeeping_tasks.created_at DESC
  `).all(propertyId).map(mapTask);
  const expenses = database.prepare(`
    SELECT * FROM expenses
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC
  `).all(propertyId).map(mapExpense);
  const payments = database.prepare(`
    SELECT * FROM payments
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
  `).all(propertyId).map(mapPayment);
  const invoices = database.prepare(`
    SELECT invoices.*, bookings.guest_id
    FROM invoices JOIN bookings ON bookings.id = invoices.booking_id
    WHERE invoices.property_id = ? AND invoices.deleted_at IS NULL
    ORDER BY invoices.created_at DESC
  `).all(propertyId).map(mapInvoice);
  const suppliers = database.prepare(`
    SELECT id, name, phone, email FROM suppliers
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY name
  `).all(propertyId).map((row) => ({ ...row, databaseSupplier: true }));
  const purchaseOrders = database.prepare(`
    SELECT purchase_orders.id, purchase_orders.supplier_id, purchase_orders.status,
           purchase_orders.ordered_at, purchase_orders.received_at,
           purchase_order_lines.item_id, purchase_order_lines.qty, purchase_order_lines.cost_kobo,
           purchase_order_lines.expiry_date
    FROM purchase_orders
    JOIN purchase_order_lines ON purchase_order_lines.purchase_order_id = purchase_orders.id
    WHERE purchase_orders.property_id = ? AND purchase_orders.deleted_at IS NULL
      AND purchase_order_lines.deleted_at IS NULL
    ORDER BY purchase_orders.created_at DESC
  `).all(propertyId).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    itemId: row.item_id,
    quantity: row.qty,
    costKobo: row.cost_kobo,
    status: row.status,
    date: row.ordered_at.slice(0, 10),
    expiryDate: row.expiry_date || "",
    receivedAt: row.received_at || "",
    databasePurchaseOrder: true,
  }));
  const minibarMovements = database.prepare(`
    SELECT minibar_movements.*, units.number AS room_number, inventory_items.name AS item_name
    FROM minibar_movements JOIN units ON units.id = minibar_movements.unit_id
    JOIN inventory_items ON inventory_items.id = minibar_movements.item_id
    WHERE minibar_movements.property_id = ? ORDER BY minibar_movements.created_at DESC LIMIT 200
  `).all(propertyId).map((row) => ({
    id: row.id,
    unitId: row.unit_id,
    roomNumber: row.room_number,
    bookingId: row.booking_id || "",
    itemId: row.item_id,
    itemName: row.item_name,
    quantity: row.qty,
    unitPriceKobo: row.unit_price_kobo,
    movementType: row.movement_type,
    reason: row.reason,
    createdAt: row.created_at,
  }));
  return { inventory, stockMovements, batches, minibarMovements, tasks, expenses, payments, invoices, suppliers, purchaseOrders };
}

function writeAudit(database, propertyId, entity, entityId, action, oldValue, newValue) {
  database.prepare(`
    INSERT INTO audit_logs (id, property_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ${nowSql})
  `).run(
    `AUD-${crypto.randomUUID()}`,
    propertyId,
    entity,
    entityId,
    action,
    oldValue == null ? null : JSON.stringify(oldValue),
    newValue == null ? null : JSON.stringify(newValue),
  );
}

function makePaymentReference() {
  return `REF-${crypto.randomUUID()}`;
}

export function registerOperationsRoutes(app, database, propertyId) {
  const assignmentColumns = database.pragma("table_info(housekeeping_tasks)");
  if (!assignmentColumns.some((column) => column.name === "assigned_to_label")) {
    database.exec("ALTER TABLE housekeeping_tasks ADD COLUMN assigned_to_label TEXT");
  }

  app.post("/api/operations/bootstrap", (request, response) => {
    try {
      const counts = {
        suppliers: database.prepare("SELECT count(*) AS n FROM suppliers WHERE property_id = ?").get(propertyId).n,
        guests: database.prepare("SELECT count(*) AS n FROM guests WHERE property_id = ?").get(propertyId).n,
        inventory: database.prepare("SELECT count(*) AS n FROM inventory_items WHERE property_id = ?").get(propertyId).n,
        expenses: database.prepare("SELECT count(*) AS n FROM expenses WHERE property_id = ?").get(propertyId).n,
        purchases: database.prepare("SELECT count(*) AS n FROM purchase_orders WHERE property_id = ?").get(propertyId).n,
      };
      const seed = database.transaction(() => {
        const timestamp = new Date().toISOString();
        if (!counts.suppliers) {
          const insert = database.prepare(`INSERT OR IGNORE INTO suppliers (id, property_id, name, phone, email, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const supplier of request.body.suppliers || []) {
            insert.run(supplier.id, propertyId, supplier.name, supplier.phone || null, supplier.email || null, supplier.address || null, timestamp, timestamp);
          }
        }
        if (!counts.guests) {
          const insert = database.prepare(`INSERT OR IGNORE INTO guests (id, property_id, full_name, phone, email, nationality, id_number, loyalty_tier, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const guest of request.body.guests || []) {
            insert.run(guest.id, propertyId, guest.name, guest.phone, guest.email || null, guest.nationality || null, guest.idNumber || null, guest.tier || "Silver", Number(guest.points || 0), timestamp, timestamp);
          }
        }
        if (!counts.inventory) {
          const insert = database.prepare(`INSERT OR IGNORE INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          const movement = database.prepare(`INSERT OR IGNORE INTO stock_movements (id, property_id, item_id, type, qty, reason, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, 'Opening balance', ?, ?)`);
          for (const item of request.body.inventory || []) {
            const supplierId = item.supplierId && database.prepare("SELECT id FROM suppliers WHERE id = ? AND property_id = ?").get(item.supplierId, propertyId) ? item.supplierId : null;
            insert.run(item.id, propertyId, item.name, item.category, item.unit, Number(item.quantity || 0), Number(item.minimum || 0), Number(item.costKobo || 0), supplierId, timestamp, timestamp);
            if (Number(item.quantity || 0) > 0) movement.run(`OPEN-${item.id}`, propertyId, item.id, Number(item.quantity), timestamp, timestamp);
          }
        }
        if (!counts.expenses) {
          const insert = database.prepare(`INSERT OR IGNORE INTO expenses (id, property_id, category, amount_kobo, note, status, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const expense of request.body.expenses || []) {
            insert.run(expense.id, propertyId, expense.category, Number(expense.amountKobo), expense.note, expense.status || "approved", expense.date || timestamp.slice(0, 10), timestamp, timestamp);
          }
        }
        if (!counts.purchases) {
          const insertOrder = database.prepare(`INSERT OR IGNORE INTO purchase_orders (id, property_id, supplier_id, status, ordered_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
          const insertLine = database.prepare(`INSERT OR IGNORE INTO purchase_order_lines (id, property_id, purchase_order_id, item_id, qty, cost_kobo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const order of request.body.purchaseOrders || []) {
            if (!database.prepare("SELECT id FROM suppliers WHERE id = ? AND property_id = ?").get(order.supplierId, propertyId) || !database.prepare("SELECT id FROM inventory_items WHERE id = ? AND property_id = ?").get(order.itemId, propertyId)) continue;
            insertOrder.run(order.id, propertyId, order.supplierId, order.status === "received" ? "received" : order.status || "draft", order.date || timestamp, timestamp, timestamp);
            insertLine.run(`${order.id}-LINE-1`, propertyId, order.id, order.itemId, Number(order.quantity), Number(order.costKobo), timestamp, timestamp);
          }
        }
      });
      seed.immediate();
      response.json({ ok: true, seeded: counts });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/guests", (_request, response) => {
    const guests = database.prepare(`SELECT * FROM guests WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`).all(propertyId).map(mapGuest);
    response.json(guests);
  });

  app.post("/api/guests", (request, response) => {
    const { name, phone } = request.body;
    if (!String(name || "").trim() || !String(phone || "").trim()) return response.status(400).json({ error: "Guest name and phone are required." });
    const duplicate = database.prepare("SELECT id FROM guests WHERE property_id = ? AND deleted_at IS NULL AND (phone = ? OR (? <> '' AND id_number = ?)) LIMIT 1").get(propertyId, phone, request.body.idNumber || "", request.body.idNumber || "");
    if (duplicate) return response.status(409).json({ error: "A guest with this phone or ID already exists." });
    const guest = {
      id: request.body.id || `G-${crypto.randomUUID()}`,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: request.body.email || "",
      nationality: request.body.nationality || "—",
      idNumber: request.body.idNumber || "",
      tier: "Silver",
      points: 0,
    };
    try {
      database.prepare(`INSERT INTO guests (id, property_id, full_name, phone, email, nationality, id_number, loyalty_tier, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Silver', 0, ${nowSql}, ${nowSql})`)
        .run(guest.id, propertyId, guest.name, guest.phone, guest.email || null, guest.nationality || null, guest.idNumber || null);
      writeAudit(database, propertyId, "guest", guest.id, "created", null, guest);
      response.status(201).json(guest);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/operations", (_request, response) => {
    syncLowStockNotifications(database, propertyId);
    response.json(readOperations(database, propertyId));
  });

  app.post("/api/payments", (request, response) => {
    const { bookingId, amountKobo, method, reference } = request.body;
    const methodMap = { Cash: "cash", Transfer: "transfer", Card: "card", Online: "online" };
    const dbMethod = methodMap[method] || method;
    const amount = Math.round(Number(amountKobo));
    if (!managerRoles.includes(request.user.role) && request.user.role !== "worker") return response.status(403).json({ error: "Your role cannot record payments." });
    if (!bookingId || !Number.isSafeInteger(amount) || amount <= 0 || !Object.values(methodMap).includes(dbMethod)) return response.status(400).json({ error: "Enter a valid booking, amount, and payment method." });
    try {
      const transaction = database.transaction(() => {
        const booking = database.prepare(`
          SELECT bookings.id, invoices.id AS invoice_id, invoices.total_kobo,
                 COALESCE(invoices.paid_kobo, 0) AS paid_kobo
          FROM bookings LEFT JOIN invoices ON invoices.booking_id = bookings.id
            AND invoices.deleted_at IS NULL
          WHERE bookings.id = ? AND bookings.property_id = ? AND bookings.deleted_at IS NULL
        `).get(bookingId, propertyId);
        if (!booking) throw fail("Only reservations saved in the database can have database payments.", 404);
        if (!booking.invoice_id) throw fail("This reservation has no database invoice.", 409);
        if (amount > booking.total_kobo - booking.paid_kobo) throw fail("Payment exceeds the outstanding invoice balance.", 409);
        const status = dbMethod === "online" ? "pending" : "paid";
        const id = `PAY-${crypto.randomUUID()}`;
        const paymentReference = String(reference || makePaymentReference());
        database.prepare(`INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'paid' THEN ${nowSql} ELSE NULL END, ${nowSql}, ${nowSql})`)
          .run(id, propertyId, bookingId, booking.invoice_id, dbMethod, amount, paymentReference, status, status);
        if (status === "paid") {
          const paid = booking.paid_kobo + amount;
          database.prepare("UPDATE invoices SET paid_kobo = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(paid, paid >= booking.total_kobo ? "paid" : "issued", booking.invoice_id);
        }
        const payment = database.prepare("SELECT * FROM payments WHERE id = ?").get(id);
        writeAudit(database, propertyId, "payment", id, "recorded", null, payment);
        return mapPayment(payment);
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/payments/:id/refunds", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const amount = Math.round(Number(request.body.amountKobo));
    const reason = String(request.body.reason || "").trim();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !reason) return response.status(400).json({ error: "Enter a valid refund amount and reason." });
    try {
      const transaction = database.transaction(() => {
        const original = database.prepare("SELECT * FROM payments WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!original || original.amount_kobo <= 0 || !["paid", "part_refunded"].includes(original.status)) throw fail("This payment is not refundable.", 409);
        const refunded = database.prepare("SELECT COALESCE(sum(-amount_kobo), 0) AS amount FROM payments WHERE original_payment_id = ? AND status = 'refunded' AND deleted_at IS NULL").get(original.id).amount;
        if (amount > original.amount_kobo - refunded) throw fail("Refund exceeds the remaining refundable amount.", 409);
        if (request.user.role === "manager" && amount > 5000000) throw fail("Manager refunds are limited to ₦50,000.", 403);
        const refundId = `PAY-${crypto.randomUUID()}`;
        database.prepare(`INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, original_payment_id, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'refund', ?, ?, 'refunded', ?, ${nowSql}, ${nowSql}, ${nowSql})`)
          .run(refundId, propertyId, original.booking_id, original.invoice_id, -amount, makePaymentReference(), original.id);
        const invoice = database.prepare("SELECT * FROM invoices WHERE id = ?").get(original.invoice_id);
        if (invoice) {
          const paid = Math.max(0, invoice.paid_kobo - amount);
          database.prepare("UPDATE invoices SET paid_kobo = ?, status = 'issued', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(paid, invoice.id);
        }
        const refund = database.prepare("SELECT * FROM payments WHERE id = ?").get(refundId);
        writeAudit(database, propertyId, "payment", refundId, "refunded", original, { ...refund, reason });
        return mapPayment(refund);
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/expenses", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const amount = Math.round(Number(request.body.amountKobo));
    const category = String(request.body.category || "").trim();
    const note = String(request.body.note || "").trim();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !category || !note) return response.status(400).json({ error: "Enter an expense category, amount, and description." });
    const expense = {
      id: request.body.id || `EXP-${crypto.randomUUID()}`,
      category,
      amountKobo: amount,
      note,
      status: request.body.status || (amount > 10000000 ? "pending" : "approved"),
      date: request.body.date || new Date().toISOString().slice(0, 10),
    };
    try {
      database.prepare(`INSERT INTO expenses (id, property_id, category, amount_kobo, note, receipt_url, status, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`)
        .run(expense.id, propertyId, expense.category, expense.amountKobo, expense.note, request.body.receiptUrl || null, expense.status, expense.date);
      writeAudit(database, propertyId, "expense", expense.id, "created", null, expense);
      response.status(201).json({ ...expense, databaseExpense: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/expenses/:id/status", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    if (!["approved", "rejected", "reversed"].includes(request.body.status)) return response.status(400).json({ error: "Invalid expense status." });
    const old = database.prepare("SELECT * FROM expenses WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!old) return response.status(404).json({ error: "Expense not found." });
    database.prepare("UPDATE expenses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?")
      .run(request.body.status, request.params.id, propertyId);
    const updated = database.prepare("SELECT * FROM expenses WHERE id = ?").get(request.params.id);
    writeAudit(database, propertyId, "expense", request.params.id, request.body.status, old, updated);
    response.json(mapExpense(updated));
  });

  app.post("/api/inventory/items", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const { name, category, unit } = request.body;
    const quantity = Number(request.body.quantity || 0);
    const minimum = Number(request.body.minimum || 0);
    const costKobo = Math.round(Number(request.body.costKobo || 0));
    if (!String(name || "").trim() || !category || !String(unit || "").trim() || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(minimum) || minimum < 0 || costKobo < 0) return response.status(400).json({ error: "Enter a valid item name, category, unit, quantity, and minimum." });
    const id = request.body.id || `IT-${crypto.randomUUID()}`;
    try {
      const transaction = database.transaction(() => {
        const supplierId = request.body.supplierId && database.prepare("SELECT id FROM suppliers WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.body.supplierId, propertyId) ? request.body.supplierId : null;
        database.prepare(`INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`)
          .run(id, propertyId, String(name).trim(), category, String(unit).trim(), quantity, minimum, costKobo, supplierId);
        if (quantity > 0) database.prepare(`INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, 'Opening balance', ${nowSql}, ${nowSql})`)
          .run(`OPEN-${id}`, propertyId, id, quantity);
        const item = database.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id);
        writeAudit(database, propertyId, "inventory_item", id, "created", null, item);
        return mapInventory(item);
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/inventory/:id/movements", (request, response) => {
    const role = request.user.role;
    const { type, reason = "", note = "" } = request.body;
    if (type === "out" && !["worker", ...managerRoles].includes(role)) return response.status(403).json({ error: "Your role cannot record stock usage." });
    if (["in", "adjust"].includes(type) && !requireRole(request, response, managerRoles)) return;
    if (!["in", "out", "adjust"].includes(type) || !String(reason).trim()) return response.status(400).json({ error: "Choose a movement type and enter a reason." });
    const quantity = Number(request.body.quantity);
    if (!Number.isFinite(quantity) || quantity === 0 || (type !== "adjust" && quantity < 0)) return response.status(400).json({ error: "Enter a non-zero valid quantity." });
    try {
      const transaction = database.transaction(() => {
        const item = database.prepare("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!item) throw fail("Inventory item not found.", 404);
        const delta = type === "out" ? -quantity : quantity;
        if (item.qty + delta < 0) throw fail("Quantity cannot reduce stock below zero.", 409);
        const id = `MOV-${crypto.randomUUID()}`;
        const detail = `${String(reason).trim()}${note ? ` · ${String(note).trim()}` : ""}`;
        database.prepare(`INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`)
          .run(id, propertyId, item.id, type, quantity, detail);
        const nextCost = request.body.costKobo ? Math.round(Number(request.body.costKobo)) : item.cost_kobo;
        database.prepare("UPDATE inventory_items SET qty = ?, cost_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(item.qty + delta, nextCost, item.id);
        const movement = database.prepare("SELECT * FROM stock_movements WHERE id = ?").get(id);
        let batch = null;
        if (type === "in") {
          const expiryDate = request.body.expiryDate || null;
          if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) throw fail("Enter the expiry date as YYYY-MM-DD.");
          const batchId = `BATCH-${crypto.randomUUID()}`;
          database.prepare(`
            INSERT INTO inventory_batches (
              id, property_id, item_id, batch_code, received_qty, remaining_qty,
              unit_cost_kobo, received_at, expiry_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(batchId, propertyId, item.id, request.body.batchCode || null, quantity, quantity, nextCost, expiryDate);
          batch = database.prepare("SELECT * FROM inventory_batches WHERE id = ?").get(batchId);
        }
        const updated = database.prepare("SELECT * FROM inventory_items WHERE id = ?").get(item.id);
        writeAudit(database, propertyId, "stock_movement", id, type, item, { movement, item: updated });
        return { movement: mapMovement(movement), item: mapInventory(updated), batch: batch && mapBatch(batch) };
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/purchase-orders", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const quantity = Number(request.body.quantity);
    const costKobo = Math.round(Number(request.body.costKobo));
    const expiryDate = request.body.expiryDate || null;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(costKobo) || costKobo < 0) return response.status(400).json({ error: "Enter a valid quantity and unit cost." });
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return response.status(400).json({ error: "Enter the expiry date as YYYY-MM-DD." });
    const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.body.supplierId, propertyId);
    const item = database.prepare("SELECT id FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.body.itemId, propertyId);
    if (!supplier || !item) return response.status(400).json({ error: "Choose a saved supplier and inventory item." });
    const id = request.body.id || `PO-${crypto.randomUUID()}`;
    try {
      const transaction = database.transaction(() => {
        database.prepare(`INSERT INTO purchase_orders (id, property_id, supplier_id, status, ordered_at, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ${nowSql}, ${nowSql})`)
          .run(id, propertyId, supplier.id, request.body.date || new Date().toISOString().slice(0, 10));
        database.prepare(`INSERT INTO purchase_order_lines (id, property_id, purchase_order_id, item_id, qty, cost_kobo, expiry_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`)
          .run(`${id}-LINE-1`, propertyId, id, item.id, quantity, costKobo, expiryDate);
        writeAudit(database, propertyId, "purchase_order", id, "created", null, request.body);
        return { id, supplierId: supplier.id, itemId: item.id, quantity, costKobo, status: "draft", date: request.body.date || new Date().toISOString().slice(0, 10), expiryDate, databasePurchaseOrder: true };
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/purchase-orders/:id/status", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const status = request.body.status;
    if (!["approved", "received", "cancelled"].includes(status)) return response.status(400).json({ error: "Invalid purchase order status." });
    try {
      const transaction = database.transaction(() => {
        const order = database.prepare(`
          SELECT purchase_orders.*, purchase_order_lines.id AS line_id,
                 purchase_order_lines.item_id, purchase_order_lines.qty,
                 purchase_order_lines.cost_kobo, purchase_order_lines.expiry_date
          FROM purchase_orders JOIN purchase_order_lines ON purchase_order_lines.purchase_order_id = purchase_orders.id
          WHERE purchase_orders.id = ? AND purchase_orders.property_id = ?
            AND purchase_orders.deleted_at IS NULL AND purchase_order_lines.deleted_at IS NULL
        `).get(request.params.id, propertyId);
        if (!order) throw fail("Purchase order not found.", 404);
        if (status === "received" && order.status !== "approved") throw fail("Approve the purchase order before receiving it.", 409);
        if (status === "approved" && order.qty * order.cost_kobo > 10000000 && request.user.role !== "ceo") throw fail("Purchase orders above ₦100,000 require CEO approval.", 403);
        database.prepare("UPDATE purchase_orders SET status = ?, received_at = CASE WHEN ? = 'received' THEN CURRENT_TIMESTAMP ELSE received_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(status, status, order.id);
        if (status === "received") {
          const item = database.prepare("SELECT * FROM inventory_items WHERE id = ?").get(order.item_id);
          database.prepare("UPDATE inventory_items SET qty = qty + ?, cost_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(order.qty, order.cost_kobo, order.item_id);
          database.prepare(`
            INSERT INTO inventory_batches (
              id, property_id, item_id, batch_code, received_qty, remaining_qty,
              unit_cost_kobo, received_at, expiry_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(`BATCH-${crypto.randomUUID()}`, propertyId, order.item_id, order.id,
            order.qty, order.qty, order.cost_kobo, order.expiry_date || null);
          database.prepare(`INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, ?, ?, ${nowSql}, ${nowSql})`)
            .run(`MOV-${crypto.randomUUID()}`, propertyId, order.item_id, order.qty, `Received ${order.id}`, order.id);
          const expenseId = `EXP-PO-${crypto.randomUUID()}`;
          database.prepare(`INSERT INTO expenses (id, property_id, category, amount_kobo, note, status, expense_date, created_at, updated_at) VALUES (?, ?, 'Supplies', ?, ?, 'approved', date('now'), ${nowSql}, ${nowSql})`)
            .run(expenseId, propertyId, order.qty * order.cost_kobo, `Purchase order ${order.id}`);
          writeAudit(database, propertyId, "inventory_item", item.id, "purchase received", item, { quantityAdded: order.qty, costKobo: order.cost_kobo, orderId: order.id });
        }
        writeAudit(database, propertyId, "purchase_order", order.id, status, order, { ...order, status });
        return { id: order.id, supplierId: order.supplier_id, itemId: order.item_id, quantity: order.qty, costKobo: order.cost_kobo, status, date: order.ordered_at.slice(0, 10), expiryDate: order.expiry_date || "", databasePurchaseOrder: true };
      });
      response.json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/housekeeping/tasks", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const unit = database.prepare("SELECT id FROM units WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.body.unitId, propertyId);
    if (!unit || !String(request.body.type || "").trim()) return response.status(400).json({ error: "Choose a database room and task type." });
    const priority = String(request.body.priority || "medium").toLowerCase();
    if (!["low", "medium", "high"].includes(priority)) return response.status(400).json({ error: "Invalid task priority." });
    const id = request.body.id || `HK-${crypto.randomUUID()}`;
    const assignedTo = String(request.body.assignedTo || "Unassigned");
    try {
      const transaction = database.transaction(() => {
        database.prepare(`INSERT INTO housekeeping_tasks (id, property_id, unit_id, booking_id, type, status, priority, assigned_to_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ${nowSql}, ${nowSql})`)
          .run(id, propertyId, unit.id, request.body.bookingId || null, String(request.body.type).trim(), priority, assignedTo);
        if (request.body.type === "Checkout clean") database.prepare("UPDATE units SET status = 'dirty', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(unit.id);
        const row = database.prepare(`SELECT housekeeping_tasks.*, NULL AS assigned_to_name FROM housekeeping_tasks WHERE id = ?`).get(id);
        writeAudit(database, propertyId, "housekeeping_task", id, "created", null, row);
        return mapTask(row);
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/housekeeping/tasks/:id/status", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const { status, inspectionNote = "" } = request.body;
    if (!["open", "in_progress", "done", "inspected"].includes(status)) return response.status(400).json({ error: "Invalid housekeeping status." });
    if (status === "inspected" && !requireRole(request, response, managerRoles)) return;
    try {
      const transaction = database.transaction(() => {
        const old = database.prepare("SELECT * FROM housekeeping_tasks WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!old) throw fail("Housekeeping task not found.", 404);
        database.prepare(`
          UPDATE housekeeping_tasks SET status = ?, inspection_note = ?,
            started_at = CASE WHEN ? = 'in_progress' AND started_at IS NULL THEN ${nowSql} ELSE started_at END,
            finished_at = CASE WHEN ? IN ('done', 'inspected') THEN ${nowSql} ELSE finished_at END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, inspectionNote || old.inspection_note, status, status, old.id);
        if (status === "in_progress") database.prepare("UPDATE units SET status = 'cleaning', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(old.unit_id);
        if (status === "inspected") database.prepare("UPDATE units SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(old.unit_id);
        const updated = database.prepare("SELECT * FROM housekeeping_tasks WHERE id = ?").get(old.id);
        writeAudit(database, propertyId, "housekeeping_task", old.id, status, old, updated);
        return mapTask({ ...updated, assigned_to_name: null });
      });
      response.json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/invoices/:id/status", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const { status, reason = "" } = request.body;
    if (!["issued", "void"].includes(status) || (status === "void" && !String(reason).trim())) return response.status(400).json({ error: "Enter a valid invoice status and void reason." });
    const old = database.prepare("SELECT * FROM invoices WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!old || (status === "void" && old.status === "paid")) return response.status(404).json({ error: "Unpaid invoice not found." });
    database.prepare("UPDATE invoices SET status = ?, void_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, status === "void" ? reason : null, old.id);
    const updated = database.prepare("SELECT invoices.*, bookings.guest_id FROM invoices JOIN bookings ON bookings.id = invoices.booking_id WHERE invoices.id = ?").get(old.id);
    writeAudit(database, propertyId, "invoice", old.id, status, old, updated);
    response.json(mapInvoice(updated));
  });
}
