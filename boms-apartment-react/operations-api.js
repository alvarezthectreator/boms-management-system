import crypto from "node:crypto";
import { syncLowStockNotificationsAsync } from "./inventory-alerts.js";
import { readIdempotencyAsync, saveIdempotencyAsync } from "./idempotency.js";

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

async function readOperations(database, propertyId) {
  const inventory = (await database.all(`
    SELECT * FROM inventory_items
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY name
  `, [propertyId])).map(mapInventory);
  const stockMovements = (await database.all(`
    SELECT * FROM stock_movements
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
  `, [propertyId])).map(mapMovement);
  const batches = (await database.all(`
    SELECT * FROM inventory_batches
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY expiry_date, received_at
  `, [propertyId])).map(mapBatch);
  const tasks = (await database.all(`
    SELECT housekeeping_tasks.*, users.name AS assigned_to_name
    FROM housekeeping_tasks
    LEFT JOIN users ON users.id = housekeeping_tasks.assigned_to
    WHERE housekeeping_tasks.property_id = ? AND housekeeping_tasks.deleted_at IS NULL
    ORDER BY housekeeping_tasks.created_at DESC
  `, [propertyId])).map(mapTask);
  const expenses = (await database.all(`
    SELECT * FROM expenses
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC
  `, [propertyId])).map(mapExpense);
  const payments = (await database.all(`
    SELECT * FROM payments
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
  `, [propertyId])).map(mapPayment);
  const invoices = (await database.all(`
    SELECT invoices.*, bookings.guest_id
    FROM invoices JOIN bookings ON bookings.id = invoices.booking_id
    WHERE invoices.property_id = ? AND invoices.deleted_at IS NULL
    ORDER BY invoices.created_at DESC
  `, [propertyId])).map(mapInvoice);
  const suppliers = (await database.all(`
    SELECT id, name, phone, email FROM suppliers
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY name
  `, [propertyId])).map((row) => ({ ...row, databaseSupplier: true }));
  const purchaseOrders = (await database.all(`
    SELECT purchase_orders.id, purchase_orders.supplier_id, purchase_orders.status,
           purchase_orders.ordered_at, purchase_orders.received_at,
           purchase_order_lines.item_id, purchase_order_lines.qty, purchase_order_lines.cost_kobo,
           purchase_order_lines.expiry_date
    FROM purchase_orders
    JOIN purchase_order_lines ON purchase_order_lines.purchase_order_id = purchase_orders.id
    WHERE purchase_orders.property_id = ? AND purchase_orders.deleted_at IS NULL
      AND purchase_order_lines.deleted_at IS NULL
    ORDER BY purchase_orders.created_at DESC
  `, [propertyId])).map((row) => ({
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
  const minibarMovements = (await database.all(`
    SELECT minibar_movements.*, units.number AS room_number, inventory_items.name AS item_name
    FROM minibar_movements JOIN units ON units.id = minibar_movements.unit_id
    JOIN inventory_items ON inventory_items.id = minibar_movements.item_id
    WHERE minibar_movements.property_id = ? ORDER BY minibar_movements.created_at DESC LIMIT 200
  `, [propertyId])).map((row) => ({
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

async function writeAuditAsync(database, propertyId, request, entity, entityId, action, oldValue, newValue) {
  await database.run(`
    INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${nowSql})
  `, [
    `AUD-${crypto.randomUUID()}`,
    propertyId,
    request.user?.id || null,
    entity,
    entityId,
    action,
    oldValue == null ? null : JSON.stringify(oldValue),
    newValue == null ? null : JSON.stringify(newValue),
  ]);
}

function makePaymentReference() {
  return `REF-${crypto.randomUUID()}`;
}

export function getPreviousLagosWeekWindow(referenceDate = new Date(), timeZone = "Africa/Lagos") {
  const dateText = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date(referenceDate));
  const asUtc = new Date(`${dateText}T12:00:00Z`);
  const dayIndex = (asUtc.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(asUtc);
  currentWeekStart.setUTCDate(asUtc.getUTCDate() - dayIndex);
  currentWeekStart.setUTCHours(0, 0, 0, 0);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(currentWeekStart.getUTCDate() - 7);
  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setUTCDate(previousWeekStart.getUTCDate() + 7);
  return {
    timeZone,
    startDate: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(previousWeekStart),
    endDate: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(previousWeekEnd),
  };
}

export async function buildWeeklyAccountingReport(database, propertyId, options = {}) {
  const timeZone = options.timeZone || "Africa/Lagos";
  const defaultWindow = getPreviousLagosWeekWindow(options.referenceDate || new Date(), timeZone);
  const startDate = String(options.startDate || defaultWindow.startDate).trim();
  const endDate = String(options.endDate || defaultWindow.endDate).trim();
  const roomId = String(options.roomId || "").trim();
  const source = String(options.source || "").trim();
  const paymentMethod = String(options.paymentMethod || "").trim();
  const category = String(options.category || "").trim();
  const orderStatus = String(options.orderStatus || "").trim();
  const roomClause = roomId ? "AND bookings.unit_id = ?" : "";
  const sourceClause = source ? "AND fnb_orders.source = ?" : "";
  const paymentClause = paymentMethod ? "AND fnb_orders.payment_method = ?" : "";
  const statusClause = orderStatus ? "AND fnb_orders.status = ?" : "";
  const categoryClause = category ? "AND menu_categories.name = ?" : "";
  const roomParam = roomId ? [roomId] : [];
  const sourceParam = source ? [source] : [];
  const paymentParam = paymentMethod ? [paymentMethod] : [];
  const statusParam = orderStatus ? [orderStatus] : [];
  const categoryParam = category ? [category] : [];
  const totalRoomsRow = await database.get("SELECT COUNT(*) AS count FROM units WHERE property_id = ? AND deleted_at IS NULL", [propertyId]);
  const totalRooms = Number(totalRoomsRow?.count || 0);
  const roomRows = await database.all(`
    SELECT bookings.*, units.number AS room_number, guests.full_name AS guest_name
    FROM bookings
    LEFT JOIN units ON units.id = bookings.unit_id
    LEFT JOIN guests ON guests.id = bookings.guest_id
    WHERE bookings.property_id = ? AND bookings.deleted_at IS NULL
      AND bookings.check_in < ? AND bookings.check_out > ?
      ${roomClause}
  `, [propertyId, endDate, startDate, ...roomParam]);
  const roomNightsSold = roomRows.reduce((sum, row) => sum + Math.max(1, Number(row.nights || 0)), 0);
  const arrivals = await database.get(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE property_id = ? AND deleted_at IS NULL AND status != 'cancelled'
      AND check_in >= ? AND check_in < ?
      ${roomClause}
  `, [propertyId, startDate, endDate, ...roomParam]);
  const departures = await database.get(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE property_id = ? AND deleted_at IS NULL AND status = 'checked_in'
      AND check_out > ? AND check_out <= ?
      ${roomClause}
  `, [propertyId, startDate, endDate, ...roomParam]);
  const cancellations = await database.get(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE property_id = ? AND deleted_at IS NULL AND status = 'cancelled'
      AND check_in < ? AND check_out > ?
      ${roomClause}
  `, [propertyId, endDate, startDate, ...roomParam]);
  const noShows = await database.get(`
    SELECT COUNT(*) AS count FROM bookings
    WHERE property_id = ? AND deleted_at IS NULL AND status = 'no_show'
      AND check_in >= ? AND check_in < ?
      ${roomClause}
  `, [propertyId, startDate, endDate, ...roomParam]);
  const arrivalCount = Number(arrivals?.count || 0);
  const departureCount = Number(departures?.count || 0);
  const cancellationCount = Number(cancellations?.count || 0);
  const noShowCount = Number(noShows?.count || 0);
  const dayCount = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000));
  const occupancyRate = totalRooms > 0 ? (roomNightsSold / Math.max(1, totalRooms * dayCount)) * 100 : 0;

  const roomRevenueRows = await database.get(`
    SELECT COALESCE(SUM(total_kobo), 0) AS total, COALESCE(SUM(discount_kobo), 0) AS discount
    FROM bookings
    WHERE property_id = ? AND deleted_at IS NULL AND check_in < ? AND check_out > ?
      ${roomClause}
  `, [propertyId, endDate, startDate, ...roomParam]);
  const roomRevenueKobo = Number(roomRevenueRows?.total || 0);
  const roomDiscountKobo = Number(roomRevenueRows?.discount || 0);

  const ordersQuery = `
    SELECT fnb_orders.*, COUNT(fnb_order_items.id) AS line_count, COALESCE(SUM(fnb_order_items.qty), 0) AS item_qty
    FROM fnb_orders
    LEFT JOIN fnb_order_items ON fnb_order_items.order_id = fnb_orders.id AND fnb_order_items.deleted_at IS NULL
    LEFT JOIN menu_items ON menu_items.id = fnb_order_items.menu_item_id
    LEFT JOIN menu_categories ON menu_categories.id = menu_items.category_id
    WHERE fnb_orders.property_id = ? AND fnb_orders.deleted_at IS NULL
      AND fnb_orders.created_at >= ? AND fnb_orders.created_at < ?
      ${sourceClause} ${paymentClause} ${statusClause} ${categoryClause} ${roomClause.replace("AND bookings.unit_id", "AND fnb_orders.room_unit_id")}
    GROUP BY fnb_orders.id
  `;
  const orderRows = await database.all(ordersQuery, [propertyId, startDate, endDate, ...sourceParam, ...paymentParam, ...statusParam, ...categoryParam, ...roomParam]);
  const grossSalesKobo = orderRows.reduce((sum, order) => sum + (order.status === "cancelled" ? 0 : Number(order.total_kobo || 0)), 0);
  const discountsKobo = orderRows.reduce((sum, order) => sum + (order.status === "cancelled" ? 0 : Number(order.discount_kobo || 0)), 0);
  const serviceTaxKobo = orderRows.reduce((sum, order) => sum + (order.status === "cancelled" ? 0 : Number(order.service_kobo || 0) + Number(order.tax_kobo || 0)), 0);
  const orderCount = orderRows.length;
  const itemQuantitySold = orderRows.reduce((sum, order) => sum + Number(order.item_qty || 0), 0);
  const cancelledOrders = orderRows.filter((order) => order.status === "cancelled").length;
  const roomChargeOrders = orderRows.filter((order) => order.payment_method === "room_charge").reduce((sum, order) => sum + Number(order.total_kobo || 0), 0);
  const directPaymentOrders = orderRows.filter((order) => order.payment_method !== "room_charge" && order.status !== "cancelled").reduce((sum, order) => sum + Number(order.total_kobo || 0), 0);
  const fnbPaymentRows = await database.get(`
    SELECT COALESCE(SUM(CASE WHEN status = 'paid' AND method != 'room_charge' THEN amount_kobo ELSE 0 END), 0) AS direct_paid,
           COALESCE(SUM(CASE WHEN status = 'refunded' THEN ABS(amount_kobo) ELSE 0 END), 0) AS refunds
    FROM fnb_order_payments
    WHERE property_id = ? AND created_at >= ? AND created_at < ?
      ${source ? "AND order_id IN (SELECT id FROM fnb_orders WHERE property_id = ? AND source = ?)" : ""}
  `, [propertyId, startDate, endDate, ...(source ? [propertyId, source] : [])]);
  const paymentReceivedKobo = Number(fnbPaymentRows?.direct_paid || 0);
  const fnbRefundsKobo = Number(fnbPaymentRows?.refunds || 0);

  const categoryRowsRaw = await database.all(`
    SELECT menu_categories.name AS category, COALESCE(SUM(fnb_order_items.qty * fnb_order_items.unit_price_kobo), 0) AS total, COALESCE(SUM(fnb_order_items.qty), 0) AS quantity
    FROM fnb_order_items
    JOIN fnb_orders ON fnb_orders.id = fnb_order_items.order_id
    LEFT JOIN menu_items ON menu_items.id = fnb_order_items.menu_item_id
    LEFT JOIN menu_categories ON menu_categories.id = menu_items.category_id
    WHERE fnb_orders.property_id = ? AND fnb_orders.deleted_at IS NULL
      AND fnb_orders.created_at >= ? AND fnb_orders.created_at < ?
      ${sourceClause.replace("fnb_orders.source", "fnb_orders.source")} ${paymentClause.replace("fnb_orders.payment_method", "fnb_orders.payment_method")} ${statusClause.replace("fnb_orders.status", "fnb_orders.status")} ${categoryClause.replace("menu_categories.name", "menu_categories.name")} ${roomClause.replace("bookings.unit_id", "fnb_orders.room_unit_id")}
    GROUP BY menu_categories.name
    ORDER BY total DESC
  `, [propertyId, startDate, endDate, ...sourceParam, ...paymentParam, ...statusParam, ...categoryParam, ...roomParam]);
  const categoryRows = categoryRowsRaw.map((row) => ({ ...row, total: Number(row.total || 0), quantity: Number(row.quantity || 0) }));
  const bySourceRaw = await database.all(`
    SELECT source, COUNT(*) AS orders, COALESCE(SUM(total_kobo), 0) AS total
    FROM fnb_orders
    WHERE property_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
      ${sourceClause} ${paymentClause} ${statusClause} ${categoryClause} ${roomClause.replace("bookings.unit_id", "fnb_orders.room_unit_id")}
    GROUP BY source
    ORDER BY total DESC
  `, [propertyId, startDate, endDate, ...sourceParam, ...paymentParam, ...statusParam, ...categoryParam, ...roomParam]);
  const bySource = bySourceRaw.map((row) => ({ ...row, orders: Number(row.orders || 0), total: Number(row.total || 0) }));
  const byPaymentMethodRaw = await database.all(`
    SELECT payment_method AS method, COUNT(*) AS orders, COALESCE(SUM(total_kobo), 0) AS total
    FROM fnb_orders
    WHERE property_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
      ${sourceClause} ${paymentClause.replace("AND fnb_orders.payment_method = ?", "")} ${statusClause} ${categoryClause} ${roomClause.replace("bookings.unit_id", "fnb_orders.room_unit_id")}
    GROUP BY payment_method
    ORDER BY total DESC
  `, [propertyId, startDate, endDate, ...sourceParam, ...statusParam, ...categoryParam, ...roomParam]);
  const byPaymentMethod = byPaymentMethodRaw.map((row) => ({ ...row, orders: Number(row.orders || 0), total: Number(row.total || 0) }));

  const expenseRows = await database.get(`
    SELECT COALESCE(SUM(amount_kobo), 0) AS total
    FROM expenses
    WHERE property_id = ? AND deleted_at IS NULL AND status != 'rejected'
      AND expense_date >= ? AND expense_date < ?
  `, [propertyId, startDate, endDate]);
  const expensesKobo = Number(expenseRows?.total || 0);
  const purchasingRows = await database.get(`
    SELECT COALESCE(SUM(purchase_order_lines.qty * purchase_order_lines.cost_kobo), 0) AS total
    FROM purchase_order_lines
    LEFT JOIN purchase_orders ON purchase_orders.id = purchase_order_lines.purchase_order_id
    WHERE purchase_order_lines.property_id = ? AND purchase_order_lines.deleted_at IS NULL
      AND purchase_orders.deleted_at IS NULL
      AND purchase_orders.ordered_at >= ? AND purchase_orders.ordered_at < ?
  `, [propertyId, startDate, endDate]);
  const purchaseValueKobo = Number(purchasingRows?.total || 0);

  const stockValueRows = await database.get(`
    SELECT COALESCE(SUM(qty * cost_kobo), 0) AS total, COUNT(*) AS count
    FROM inventory_items
    WHERE property_id = ? AND deleted_at IS NULL
  `, [propertyId]);
  const closingInventoryValueKobo = Number(stockValueRows?.total || 0);
  const lowStockCountRow = await database.get(`
    SELECT COUNT(*) AS count FROM inventory_items
    WHERE property_id = ? AND deleted_at IS NULL AND qty <= min_qty
  `, [propertyId]);
  const lowStockCount = Number(lowStockCountRow?.count || 0);
  const rawMovementOut = await database.get(`
    SELECT COALESCE(SUM(stock_movements.qty * inventory_items.cost_kobo), 0) AS total
    FROM stock_movements
    JOIN inventory_items ON inventory_items.id = stock_movements.item_id
    WHERE stock_movements.property_id = ? AND stock_movements.type = 'out'
      AND stock_movements.created_at >= ? AND stock_movements.created_at < ?
      AND inventory_items.deleted_at IS NULL
  `, [propertyId, startDate, endDate]);
  const usageCostKobo = Number(rawMovementOut?.total || 0);

  const report = {
    meta: {
      timeZone,
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      currency: "NGN",
    },
    filters: {
      roomId: roomId || "all",
      source: source || "all",
      paymentMethod: paymentMethod || "all",
      category: category || "all",
      orderStatus: orderStatus || "all",
    },
    roomActivity: {
      roomsInScope: totalRooms,
      bookingsInScope: roomRows.length,
      roomNightsSold,
      arrivals: arrivalCount,
      departures: departureCount,
      cancellations: cancellationCount,
      noShows: noShowCount,
      occupancyRate: Number(occupancyRate.toFixed(2)),
      roomRevenueKobo: roomRevenueKobo,
      roomDiscountKobo,
    },
    fnb: {
      ordersCount: orderCount,
      itemsSold: itemQuantitySold,
      grossSalesKobo,
      discountsKobo,
      taxesAndServiceKobo: serviceTaxKobo,
      refundsKobo: fnbRefundsKobo,
      netSalesKobo: Math.max(0, grossSalesKobo - discountsKobo - fnbRefundsKobo),
      directPaymentsKobo: paymentReceivedKobo,
      roomChargeSalesKobo: roomChargeOrders,
      cancelledOrders,
      bySource,
      byPaymentMethod,
      byCategory: categoryRows,
    },
    inventory: {
      itemCount: Number(stockValueRows?.count || 0),
      openingValueKobo: closingInventoryValueKobo,
      purchasesKobo: purchaseValueKobo,
      usageCostKobo,
      closingValueKobo: closingInventoryValueKobo,
      lowStockItems: lowStockCount,
    },
    reconciliation: {
      salesEarnedKobo: roomRevenueKobo + grossSalesKobo,
      paymentsReceivedKobo: Number(fnbPaymentRows?.direct_paid || 0),
      roomFolioChargesKobo: roomChargeOrders,
      receivablesKobo: Math.max(0, roomRevenueKobo - Number(fnbPaymentRows?.direct_paid || 0)),
      refundsKobo: fnbRefundsKobo,
      expensesKobo: expensesKobo + purchaseValueKobo,
      inventoryValueKobo: closingInventoryValueKobo,
      netOperatingKobo: roomRevenueKobo + grossSalesKobo - (expensesKobo + purchaseValueKobo) - fnbRefundsKobo,
    },
  };

  return report;
}

async function insertInventoryBatch(database, propertyId, itemId, batchCode, receivedQty, remainingQty, unitCostKobo, receivedAt, expiryDate, supplierId = null) {
  await database.run(`
    INSERT INTO inventory_batches (
      id, property_id, item_id, batch_code, received_qty, remaining_qty,
      unit_cost_kobo, received_at, expiry_date, supplier_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    `BATCH-${crypto.randomUUID()}`,
    propertyId,
    itemId,
    batchCode,
    receivedQty,
    remainingQty,
    unitCostKobo,
    receivedAt || new Date().toISOString().slice(0, 10),
    expiryDate || null,
    supplierId || null,
  ]);
}

export function registerOperationsRoutes(app, database, propertyId) {
  app.get("/api/weekly-accounting", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const report = await buildWeeklyAccountingReport(database, propertyId, {
      startDate: request.query.startDate || request.query.start || request.query.weekStart,
      endDate: request.query.endDate || request.query.end || request.query.weekEnd,
      roomId: request.query.roomId,
      source: request.query.source,
      paymentMethod: request.query.paymentMethod,
      category: request.query.category,
      orderStatus: request.query.orderStatus,
      timeZone: "Africa/Lagos",
    });
    response.json(report);
  });

  app.get("/api/reports/weekly", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const report = await buildWeeklyAccountingReport(database, propertyId, {
      startDate: request.query.startDate || request.query.start || request.query.weekStart,
      endDate: request.query.endDate || request.query.end || request.query.weekEnd,
      roomId: request.query.roomId,
      source: request.query.source,
      paymentMethod: request.query.paymentMethod,
      category: request.query.category,
      orderStatus: request.query.orderStatus,
      timeZone: "Africa/Lagos",
    });
    response.json(report);
  });

  app.post("/api/operations/bootstrap", async (request, response) => {
    try {
      const counts = {
        suppliers: Number((await database.get("SELECT count(*) AS n FROM suppliers WHERE property_id = ?", [propertyId])).n),
        guests: Number((await database.get("SELECT count(*) AS n FROM guests WHERE property_id = ?", [propertyId])).n),
        inventory: Number((await database.get("SELECT count(*) AS n FROM inventory_items WHERE property_id = ?", [propertyId])).n),
        expenses: Number((await database.get("SELECT count(*) AS n FROM expenses WHERE property_id = ?", [propertyId])).n),
        purchases: Number((await database.get("SELECT count(*) AS n FROM purchase_orders WHERE property_id = ?", [propertyId])).n),
      };
      await database.withTransaction(async (transaction) => {
        const timestamp = new Date().toISOString();
        if (!counts.suppliers) {
          for (const supplier of request.body.suppliers || []) {
            await transaction.run(`INSERT OR IGNORE INTO suppliers (id, property_id, name, phone, email, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [supplier.id, propertyId, supplier.name, supplier.phone || null, supplier.email || null, supplier.address || null, timestamp, timestamp]);
          }
        }
        if (!counts.guests) {
          for (const guest of request.body.guests || []) {
            await transaction.run(`INSERT OR IGNORE INTO guests (id, property_id, full_name, phone, email, nationality, id_number, loyalty_tier, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [guest.id, propertyId, guest.name, guest.phone, guest.email || null, guest.nationality || null, guest.idNumber || null, guest.tier || "Silver", Number(guest.points || 0), timestamp, timestamp]);
          }
        }
        if (!counts.inventory) {
          for (const item of request.body.inventory || []) {
            const supplier = item.supplierId ? await transaction.get("SELECT id FROM suppliers WHERE id = ? AND property_id = ?", [item.supplierId, propertyId]) : null;
            await transaction.run(`INSERT OR IGNORE INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.id, propertyId, item.name, item.category, item.unit, Number(item.quantity || 0), Number(item.minimum || 0), Number(item.costKobo || 0), supplier?.id || null, timestamp, timestamp]);
            if (Number(item.quantity || 0) > 0) await transaction.run(`INSERT OR IGNORE INTO stock_movements (id, property_id, item_id, type, qty, reason, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, 'Opening balance', ?, ?)`,
              [`OPEN-${item.id}`, propertyId, item.id, Number(item.quantity), timestamp, timestamp]);
          }
        }
        if (!counts.expenses) {
          for (const expense of request.body.expenses || []) {
            await transaction.run(`INSERT OR IGNORE INTO expenses (id, property_id, category, amount_kobo, note, status, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [expense.id, propertyId, expense.category, Number(expense.amountKobo), expense.note, expense.status || "approved", expense.date || timestamp.slice(0, 10), timestamp, timestamp]);
          }
        }
        if (!counts.purchases) {
          for (const order of request.body.purchaseOrders || []) {
            const supplier = await transaction.get("SELECT id FROM suppliers WHERE id = ? AND property_id = ?", [order.supplierId, propertyId]);
            const item = await transaction.get("SELECT id FROM inventory_items WHERE id = ? AND property_id = ?", [order.itemId, propertyId]);
            if (!supplier || !item) continue;
            await transaction.run(`INSERT OR IGNORE INTO purchase_orders (id, property_id, supplier_id, status, ordered_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [order.id, propertyId, order.supplierId, order.status === "received" ? "received" : order.status || "draft", order.date || timestamp, timestamp, timestamp]);
            await transaction.run(`INSERT OR IGNORE INTO purchase_order_lines (id, property_id, purchase_order_id, item_id, qty, cost_kobo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [`${order.id}-LINE-1`, propertyId, order.id, order.itemId, Number(order.quantity), Number(order.costKobo), timestamp, timestamp]);
          }
        }
      });
      response.json({ ok: true, seeded: counts });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/guests", async (_request, response) => {
    const guests = (await database.all(`SELECT * FROM guests WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`, [propertyId])).map(mapGuest);
    response.json(guests);
  });

  app.post("/api/guests", async (request, response) => {
    const { name, phone } = request.body;
    if (!String(name || "").trim() || !String(phone || "").trim()) return response.status(400).json({ error: "Guest name and phone are required." });
    const duplicate = await database.get("SELECT id FROM guests WHERE property_id = ? AND deleted_at IS NULL AND (phone = ? OR (? <> '' AND id_number = ?)) LIMIT 1", [propertyId, phone, request.body.idNumber || "", request.body.idNumber || ""]);
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
      await database.run(`INSERT INTO guests (id, property_id, full_name, phone, email, nationality, id_number, loyalty_tier, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Silver', 0, ${nowSql}, ${nowSql})`,
        [guest.id, propertyId, guest.name, guest.phone, guest.email || null, guest.nationality || null, guest.idNumber || null]);
      await writeAuditAsync(database, propertyId, request, "guest", guest.id, "created", null, guest);
      response.status(201).json(guest);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/operations", async (_request, response) => {
    await syncLowStockNotificationsAsync(database, propertyId);
    response.json(await readOperations(database, propertyId));
  });

  app.post("/api/payments", async (request, response) => {
    const { bookingId, amountKobo, method, reference } = request.body;
    const methodMap = { Cash: "cash", Transfer: "transfer", Card: "card", Online: "online" };
    const dbMethod = methodMap[method] || method;
    const amount = Math.round(Number(amountKobo));
    if (!managerRoles.includes(request.user.role) && request.user.role !== "worker") return response.status(403).json({ error: "Your role cannot record payments." });
    if (!bookingId || !Number.isSafeInteger(amount) || amount <= 0 || !Object.values(methodMap).includes(dbMethod)) return response.status(400).json({ error: "Enter a valid booking, amount, and payment method." });
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, "payment:create");
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const booking = await transaction.get(`
          SELECT bookings.id, invoices.id AS invoice_id, invoices.total_kobo,
                 COALESCE(invoices.paid_kobo, 0) AS paid_kobo
          FROM bookings LEFT JOIN invoices ON invoices.booking_id = bookings.id
            AND invoices.deleted_at IS NULL
          WHERE bookings.id = ? AND bookings.property_id = ? AND bookings.deleted_at IS NULL
        `, [bookingId, propertyId]);
        if (!booking) throw fail("Only reservations saved in the database can have database payments.", 404);
        if (!booking.invoice_id) throw fail("This reservation has no database invoice.", 409);
        if (amount > booking.total_kobo - booking.paid_kobo) throw fail("Payment exceeds the outstanding invoice balance.", 409);
        const status = dbMethod === "online" ? "pending" : "paid";
        const id = `PAY-${crypto.randomUUID()}`;
        const paymentReference = String(reference || makePaymentReference());
        await transaction.run(`INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'paid' THEN ${nowSql} ELSE NULL END, ${nowSql}, ${nowSql})`,
          [id, propertyId, bookingId, booking.invoice_id, dbMethod, amount, paymentReference, status, status]);
        if (status === "paid") {
          const paid = booking.paid_kobo + amount;
          await transaction.run("UPDATE invoices SET paid_kobo = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [paid, paid >= booking.total_kobo ? "paid" : "issued", booking.invoice_id]);
        }
        const payment = await transaction.get("SELECT * FROM payments WHERE id = ?", [id]);
        await writeAuditAsync(transaction, propertyId, request, "payment", id, "recorded", null, payment);
        const saved = mapPayment(payment);
        await saveIdempotencyAsync(transaction, request, propertyId, "payment:create", idempotency, saved);
        return { replay: false, result: saved };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/payments/:id/refunds", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const amount = Math.round(Number(request.body.amountKobo));
    const reason = String(request.body.reason || "").trim();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !reason) return response.status(400).json({ error: "Enter a valid refund amount and reason." });
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, `payment:${request.params.id}:refund`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const original = await transaction.get("SELECT * FROM payments WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!original || original.amount_kobo <= 0 || !["paid", "part_refunded"].includes(original.status)) throw fail("This payment is not refundable.", 409);
        const refundedRow = await transaction.get("SELECT COALESCE(sum(-amount_kobo), 0) AS amount FROM payments WHERE original_payment_id = ? AND status = 'refunded' AND deleted_at IS NULL", [original.id]);
        const refunded = Number(refundedRow.amount);
        if (amount > original.amount_kobo - refunded) throw fail("Refund exceeds the remaining refundable amount.", 409);
        if (request.user.role === "manager" && amount > 5000000) throw fail("Manager refunds are limited to ₦50,000.", 403);
        const refundId = `PAY-${crypto.randomUUID()}`;
        await transaction.run(`INSERT INTO payments (id, property_id, booking_id, invoice_id, method, amount_kobo, reference, status, original_payment_id, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'refund', ?, ?, 'refunded', ?, ${nowSql}, ${nowSql}, ${nowSql})`,
          [refundId, propertyId, original.booking_id, original.invoice_id, -amount, makePaymentReference(), original.id]);
        const invoice = await transaction.get("SELECT * FROM invoices WHERE id = ?", [original.invoice_id]);
        if (invoice) {
          const paid = Math.max(0, invoice.paid_kobo - amount);
          await transaction.run("UPDATE invoices SET paid_kobo = ?, status = 'issued', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [paid, invoice.id]);
        }
        const refund = await transaction.get("SELECT * FROM payments WHERE id = ?", [refundId]);
        await writeAuditAsync(transaction, propertyId, request, "payment", refundId, "refunded", original, { ...refund, reason });
        const saved = mapPayment(refund);
        await saveIdempotencyAsync(transaction, request, propertyId, `payment:${request.params.id}:refund`, idempotency, saved);
        return { replay: false, result: saved };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/expenses", async (request, response) => {
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
      await database.run(`INSERT INTO expenses (id, property_id, category, amount_kobo, note, receipt_url, status, expense_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`,
        [expense.id, propertyId, expense.category, expense.amountKobo, expense.note, request.body.receiptUrl || null, expense.status, expense.date]);
      await writeAuditAsync(database, propertyId, request, "expense", expense.id, "created", null, expense);
      response.status(201).json({ ...expense, databaseExpense: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/expenses/:id/status", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    if (!["approved", "rejected", "reversed"].includes(request.body.status)) return response.status(400).json({ error: "Invalid expense status." });
    const old = await database.get("SELECT * FROM expenses WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!old) return response.status(404).json({ error: "Expense not found." });
    await database.run("UPDATE expenses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [request.body.status, request.params.id, propertyId]);
    const updated = await database.get("SELECT * FROM expenses WHERE id = ?", [request.params.id]);
    await writeAuditAsync(database, propertyId, request, "expense", request.params.id, request.body.status, old, updated);
    response.json(mapExpense(updated));
  });

  app.post("/api/inventory/items", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const { name, category, unit } = request.body;
    const quantity = Number(request.body.quantity || 0);
    const minimum = Number(request.body.minimum || 0);
    const costKobo = Math.round(Number(request.body.costKobo || 0));
    if (!String(name || "").trim() || !category || !String(unit || "").trim() || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(minimum) || minimum < 0 || costKobo < 0) return response.status(400).json({ error: "Enter a valid item name, category, unit, quantity, and minimum." });
    const id = request.body.id || `IT-${crypto.randomUUID()}`;
    try {
      const item = await database.withTransaction(async (transaction) => {
        const supplier = request.body.supplierId ? await transaction.get("SELECT id FROM suppliers WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.body.supplierId, propertyId]) : null;
        const supplierId = supplier?.id || null;
        await transaction.run(`INSERT INTO inventory_items (id, property_id, name, category, unit, qty, min_qty, cost_kobo, supplier_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`,
          [id, propertyId, String(name).trim(), category, String(unit).trim(), quantity, minimum, costKobo, supplierId]);
        if (quantity > 0) await transaction.run(`INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, 'Opening balance', ${nowSql}, ${nowSql})`,
          [`OPEN-${id}`, propertyId, id, quantity]);
        const savedItem = await transaction.get("SELECT * FROM inventory_items WHERE id = ?", [id]);
        await writeAuditAsync(transaction, propertyId, request, "inventory_item", id, "created", null, savedItem);
        return mapInventory(savedItem);
      });
      response.status(201).json(item);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/inventory/:id/movements", async (request, response) => {
    const role = request.user.role;
    const { type, reason = "", note = "" } = request.body;
    if (type === "out" && !["worker", ...managerRoles].includes(role)) return response.status(403).json({ error: "Your role cannot record stock usage." });
    if (["in", "adjust"].includes(type) && !requireRole(request, response, managerRoles)) return;
    if (!["in", "out", "adjust"].includes(type) || !String(reason).trim()) return response.status(400).json({ error: "Choose a movement type and enter a reason." });
    const quantity = Number(request.body.quantity);
    if (!Number.isFinite(quantity) || quantity === 0 || (type !== "adjust" && quantity < 0)) return response.status(400).json({ error: "Enter a non-zero valid quantity." });
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, `inventory:${request.params.id}:movement`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const item = await transaction.get("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!item) throw fail("Inventory item not found.", 404);
        const delta = type === "out" ? -quantity : quantity;
        if (item.qty + delta < 0) throw fail("Quantity cannot reduce stock below zero.", 409);
        const id = `MOV-${crypto.randomUUID()}`;
        const detail = `${String(reason).trim()}${note ? ` · ${String(note).trim()}` : ""}`;
        await transaction.run(`INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`,
          [id, propertyId, item.id, type, quantity, detail]);
        const nextCost = request.body.costKobo ? Math.round(Number(request.body.costKobo)) : item.cost_kobo;
        await transaction.run("UPDATE inventory_items SET qty = ?, cost_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.qty + delta, nextCost, item.id]);
        const movement = await transaction.get("SELECT * FROM stock_movements WHERE id = ?", [id]);
        let batch = null;
        if (type === "in") {
          const expiryDate = request.body.expiryDate || null;
          if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) throw fail("Enter the expiry date as YYYY-MM-DD.");
          const batchId = `BATCH-${crypto.randomUUID()}`;
          await transaction.run(`
            INSERT INTO inventory_batches (
              id, property_id, item_id, batch_code, received_qty, remaining_qty,
              unit_cost_kobo, received_at, expiry_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [batchId, propertyId, item.id, request.body.batchCode || null, quantity, quantity, nextCost, expiryDate]);
          batch = await transaction.get("SELECT * FROM inventory_batches WHERE id = ?", [batchId]);
        }
        const updated = await transaction.get("SELECT * FROM inventory_items WHERE id = ?", [item.id]);
        await writeAuditAsync(transaction, propertyId, request, "stock_movement", id, type, item, { movement, item: updated });
        const saved = { movement: mapMovement(movement), item: mapInventory(updated), batch: batch && mapBatch(batch) };
        await saveIdempotencyAsync(transaction, request, propertyId, `inventory:${request.params.id}:movement`, idempotency, saved);
        return { replay: false, result: saved };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/purchase-orders", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const rawLines = Array.isArray(request.body.lines) && request.body.lines.length
      ? request.body.lines
      : [{ itemId: request.body.itemId, quantity: request.body.quantity, costKobo: request.body.costKobo, expiryDate: request.body.expiryDate }];
    if (!rawLines.length) return response.status(400).json({ error: "Add at least one purchase-order line." });
    const supplier = await database.get("SELECT id FROM suppliers WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.body.supplierId, propertyId]);
    if (!supplier) return response.status(400).json({ error: "Choose a saved supplier." });
    const id = request.body.id || `PO-${crypto.randomUUID()}`;
    const lines = [];
    for (const [index, line] of rawLines.entries()) {
      const itemId = String(line.itemId || "").trim();
      const quantity = Number(line.quantity);
      const costKobo = Math.round(Number(line.costKobo || 0));
      const expiryDate = line.expiryDate || null;
      if (!itemId) throw fail("Each purchase-order line needs an inventory item.", 400);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(costKobo) || costKobo < 0) throw fail("Enter a valid quantity and unit cost for each line.", 400);
      if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) throw fail("Enter the expiry date as YYYY-MM-DD.", 400);
      const item = await database.get("SELECT id FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [itemId, propertyId]);
      if (!item) throw fail("Choose a saved supplier and inventory item.", 400);
      lines.push({
        lineId: `${id}-LINE-${index + 1}`,
        itemId,
        quantity,
        costKobo,
        expiryDate,
      });
    }
    try {
      const created = await database.withTransaction(async (transaction) => {
        await transaction.run(`INSERT INTO purchase_orders (id, property_id, supplier_id, status, ordered_at, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ${nowSql}, ${nowSql})`,
          [id, propertyId, supplier.id, request.body.date || new Date().toISOString().slice(0, 10)]);
        for (const line of lines) {
          await transaction.run(`INSERT INTO purchase_order_lines (id, property_id, purchase_order_id, item_id, qty, cost_kobo, expiry_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${nowSql}, ${nowSql})`,
            [line.lineId, propertyId, id, line.itemId, line.quantity, line.costKobo, line.expiryDate]);
        }
        await writeAuditAsync(transaction, propertyId, request, "purchase_order", id, "created", null, request.body);
        return {
          id,
          supplierId: supplier.id,
          status: "draft",
          date: request.body.date || new Date().toISOString().slice(0, 10),
          lines: lines.map((line) => ({
            id: line.lineId,
            itemId: line.itemId,
            quantity: line.quantity,
            costKobo: line.costKobo,
            expiryDate: line.expiryDate || "",
          })),
          databasePurchaseOrder: true,
        };
      });
      response.status(201).json(created);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/purchase-orders/:id/status", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const status = request.body.status;
    if (!["approved", "received", "cancelled"].includes(status)) return response.status(400).json({ error: "Invalid purchase order status." });
    try {
      const result = await database.withTransaction(async (transaction) => {
        const idempotency = status === "received"
          ? await readIdempotencyAsync(transaction, request, propertyId, `purchase-order:${request.params.id}:receive`)
          : null;
        if (idempotency?.response) return { idempotentResult: idempotency.response };
        const orderRows = await transaction.all(`
          SELECT purchase_orders.*, purchase_order_lines.id AS line_id,
                 purchase_order_lines.item_id, purchase_order_lines.qty,
                 purchase_order_lines.cost_kobo, purchase_order_lines.expiry_date,
                 inventory_items.name AS item_name
          FROM purchase_orders
          JOIN purchase_order_lines ON purchase_order_lines.purchase_order_id = purchase_orders.id
          LEFT JOIN inventory_items ON inventory_items.id = purchase_order_lines.item_id
          WHERE purchase_orders.id = ? AND purchase_orders.property_id = ?
            AND purchase_orders.deleted_at IS NULL AND purchase_order_lines.deleted_at IS NULL
          ORDER BY purchase_order_lines.created_at ASC
        `, [request.params.id, propertyId]);
        if (!orderRows.length) throw fail("Purchase order not found.", 404);
        const order = orderRows[0];
        const lines = orderRows.map((line) => ({
          lineId: line.line_id,
          itemId: line.item_id,
          quantity: Number(line.qty),
          costKobo: Number(line.cost_kobo),
          expiryDate: line.expiry_date || "",
          itemName: line.item_name,
        }));
        const totalLineValue = lines.reduce((sum, line) => sum + line.quantity * line.costKobo, 0);
        if (status === "approved" && totalLineValue > 10000000 && request.user.role !== "ceo") throw fail("Purchase orders above ₦100,000 require CEO approval.", 403);
        if (status === "received" && order.status !== "approved" && order.status !== "received") throw fail("Approve the purchase order before receiving it.", 409);
        if (status === "approved") {
          await transaction.run("UPDATE purchase_orders SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [order.id, propertyId]);
          await writeAuditAsync(transaction, propertyId, request, "purchase_order", order.id, status, order, { ...order, status });
          return { id: order.id, supplierId: order.supplier_id, status: "approved", date: order.ordered_at.slice(0, 10), lines: lines.map((line) => ({ ...line, receivedQuantity: line.quantity })), databasePurchaseOrder: true };
        }
        if (status === "received") {
          const lineQtyMap = request.body.lineQty && typeof request.body.lineQty === "object"
            ? Object.fromEntries(Object.entries(request.body.lineQty).map(([key, value]) => [String(key), Number(value)]))
            : {};
          const hasPartialSelection = Object.keys(lineQtyMap).length > 0;
          const receiveMap = new Map();
          for (const line of lines) {
            const requestedQty = hasPartialSelection
              ? (Object.prototype.hasOwnProperty.call(lineQtyMap, line.itemId) ? Number(lineQtyMap[line.itemId]) : 0)
              : line.quantity;
            if (!hasPartialSelection && (!Number.isFinite(requestedQty) || requestedQty <= 0)) throw fail("Enter a valid quantity for each received line.", 400);
            if (hasPartialSelection && requestedQty === 0) continue;
            if (requestedQty > line.quantity) throw fail(`Receipt exceeds the ordered quantity for ${line.itemName || line.itemId}.`, 409);
            receiveMap.set(line.itemId, (receiveMap.get(line.itemId) || 0) + requestedQty);
          }
          const itemUpdates = new Map();
          for (const [itemId, qty] of receiveMap.entries()) {
            const item = await transaction.get("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [itemId, propertyId]);
            if (!item) throw fail("Inventory item not found.", 404);
            const nextCost = lines.find((line) => line.itemId === itemId)?.costKobo ?? item.cost_kobo;
            await transaction.run("UPDATE inventory_items SET qty = qty + ?, cost_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [qty, nextCost, item.id]);
            await insertInventoryBatch(transaction, propertyId, item.id, order.id, qty, qty, nextCost, new Date().toISOString().slice(0, 10), lines.find((line) => line.itemId === itemId)?.expiryDate || null, order.supplier_id);
            await transaction.run(`INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, ?, ?, ${nowSql}, ${nowSql})`,
              [`MOV-${crypto.randomUUID()}`, propertyId, item.id, qty, `Received ${order.id}`, order.id]);
            itemUpdates.set(itemId, { id: item.id, qty, costKobo: nextCost });
          }
          const remainingOpen = lines.some((line) => {
            if (!hasPartialSelection) return false;
            const requested = Object.prototype.hasOwnProperty.call(lineQtyMap, line.itemId) ? Number(lineQtyMap[line.itemId]) : 0;
            return requested < line.quantity;
          });
          const nextStatus = remainingOpen ? "approved" : "received";
          await transaction.run("UPDATE purchase_orders SET status = ?, received_at = CASE WHEN ? = 'received' THEN CURRENT_TIMESTAMP ELSE received_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextStatus, nextStatus, order.id]);
          const expenseTotal = lines.reduce((sum, line) => {
            const requested = hasPartialSelection
              ? (Object.prototype.hasOwnProperty.call(lineQtyMap, line.itemId) ? Number(lineQtyMap[line.itemId]) : 0)
              : line.quantity;
            return sum + requested * line.costKobo;
          }, 0);
          if (expenseTotal > 0) {
            const expenseId = `EXP-PO-${crypto.randomUUID()}`;
            await transaction.run(`INSERT INTO expenses (id, property_id, category, amount_kobo, note, status, expense_date, created_at, updated_at) VALUES (?, ?, 'Supplies', ?, ?, 'approved', date('now'), ${nowSql}, ${nowSql})`,
              [expenseId, propertyId, expenseTotal, `Purchase order ${order.id}`]);
          }
          for (const entry of itemUpdates.values()) {
            const item = await transaction.get("SELECT * FROM inventory_items WHERE id = ?", [entry.id]);
            await writeAuditAsync(transaction, propertyId, request, "inventory_item", item.id, "purchase received", item, { quantityAdded: entry.qty, costKobo: entry.costKobo, orderId: order.id });
          }
          await writeAuditAsync(transaction, propertyId, request, "purchase_order", order.id, nextStatus, order, { ...order, status: nextStatus, received: Object.fromEntries([...itemUpdates].map(([itemId, item]) => [itemId, item.qty])) });
          const saved = {
            id: order.id,
            supplierId: order.supplier_id,
            status: nextStatus,
            date: order.ordered_at.slice(0, 10),
            lines: lines.map((line) => ({
              ...line,
              receivedQuantity: hasPartialSelection
                ? (Object.prototype.hasOwnProperty.call(lineQtyMap, line.itemId) ? Number(lineQtyMap[line.itemId]) : 0)
                : line.quantity,
            })),
            databasePurchaseOrder: true,
          };
          await saveIdempotencyAsync(transaction, request, propertyId, `purchase-order:${request.params.id}:receive`, idempotency, saved);
          return { idempotentResult: saved };
        }
        if (status === "cancelled") {
          await transaction.run("UPDATE purchase_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [order.id, propertyId]);
          await writeAuditAsync(transaction, propertyId, request, "purchase_order", order.id, status, order, { ...order, status });
          return { id: order.id, supplierId: order.supplier_id, status: "cancelled", date: order.ordered_at.slice(0, 10), lines: lines.map((line) => ({ ...line, receivedQuantity: 0 })), databasePurchaseOrder: true };
        }
        return { id: order.id, supplierId: order.supplier_id, status: order.status, date: order.ordered_at.slice(0, 10), lines: lines.map((line) => ({ ...line, receivedQuantity: 0 })), databasePurchaseOrder: true };
      });
      response.json(result?.idempotentResult || result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/housekeeping/tasks", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const unit = await database.get("SELECT id FROM units WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.body.unitId, propertyId]);
    if (!unit || !String(request.body.type || "").trim()) return response.status(400).json({ error: "Choose a database room and task type." });
    const priority = String(request.body.priority || "medium").toLowerCase();
    if (!["low", "medium", "high"].includes(priority)) return response.status(400).json({ error: "Invalid task priority." });
    const id = request.body.id || `HK-${crypto.randomUUID()}`;
    const assignedTo = String(request.body.assignedTo || "Unassigned");
    try {
      const saved = await database.withTransaction(async (transaction) => {
        await transaction.run(`INSERT INTO housekeeping_tasks (id, property_id, unit_id, booking_id, type, status, priority, assigned_to_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ${nowSql}, ${nowSql})`,
          [id, propertyId, unit.id, request.body.bookingId || null, String(request.body.type).trim(), priority, assignedTo]);
        if (request.body.type === "Checkout clean") await transaction.run("UPDATE units SET status = 'dirty', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [unit.id]);
        const row = await transaction.get("SELECT housekeeping_tasks.*, NULL AS assigned_to_name FROM housekeeping_tasks WHERE id = ?", [id]);
        await writeAuditAsync(transaction, propertyId, request, "housekeeping_task", id, "created", null, row);
        return mapTask(row);
      });
      response.status(201).json(saved);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/housekeeping/tasks/:id/status", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const { status, inspectionNote = "" } = request.body;
    if (!["open", "in_progress", "done", "inspected"].includes(status)) return response.status(400).json({ error: "Invalid housekeeping status." });
    if (status === "inspected" && !requireRole(request, response, managerRoles)) return;
    try {
      const result = await database.withTransaction(async (transaction) => {
        const old = await transaction.get("SELECT * FROM housekeeping_tasks WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!old) throw fail("Housekeeping task not found.", 404);
        await transaction.run(`
          UPDATE housekeeping_tasks SET status = ?, inspection_note = ?,
            started_at = CASE WHEN ? = 'in_progress' AND started_at IS NULL THEN ${nowSql} ELSE started_at END,
            finished_at = CASE WHEN ? IN ('done', 'inspected') THEN ${nowSql} ELSE finished_at END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [status, inspectionNote || old.inspection_note, status, status, old.id]);
        if (status === "in_progress") await transaction.run("UPDATE units SET status = 'cleaning', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [old.unit_id]);
        if (status === "inspected") await transaction.run("UPDATE units SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [old.unit_id]);
        const updated = await transaction.get("SELECT * FROM housekeeping_tasks WHERE id = ?", [old.id]);
        await writeAuditAsync(transaction, propertyId, request, "housekeeping_task", old.id, status, old, updated);
        return mapTask({ ...updated, assigned_to_name: null });
      });
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/invoices/:id/status", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const { status, reason = "" } = request.body;
    if (!["issued", "void"].includes(status) || (status === "void" && !String(reason).trim())) return response.status(400).json({ error: "Enter a valid invoice status and void reason." });
    const old = await database.get("SELECT * FROM invoices WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!old || (status === "void" && old.status === "paid")) return response.status(404).json({ error: "Unpaid invoice not found." });
    await database.run("UPDATE invoices SET status = ?, void_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, status === "void" ? reason : null, old.id]);
    const updated = await database.get("SELECT invoices.*, bookings.guest_id FROM invoices JOIN bookings ON bookings.id = invoices.booking_id WHERE invoices.id = ?", [old.id]);
    await writeAuditAsync(database, propertyId, request, "invoice", old.id, status, old, updated);
    response.json(mapInvoice(updated));
  });
}
