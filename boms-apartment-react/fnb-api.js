import crypto from "node:crypto";
import { syncLowStockNotificationsAsync } from "./inventory-alerts.js";
import { readIdempotencyAsync, saveIdempotencyAsync } from "./idempotency.js";

const managementRoles = ["manager", "ceo"];

function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function sendError(response, error) {
  response.status(error.status || 500).json({ error: error.message || "Request failed." });
}

function readJsonValue(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requireRole(request, response, roles) {
  if (!roles.includes(request.user?.role)) {
    response.status(403).json({ error: "Your role cannot perform this action." });
    return false;
  }
  return true;
}

async function auditAsync(database, propertyId, entity, entityId, action, before, after, userId = null) {
  await database.run(`
    INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [`AUD-${crypto.randomUUID()}`, propertyId, userId, entity, entityId, action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]);
}

function mapMenuItem(item, recipeLines, modifiers, stockAvailable) {
  const baseRecipe = recipeLines.filter((line) => !line.modifier_id && line.menu_item_id === item.id);
  const manualAvailable = Boolean(item.available);
  return {
    id: item.id,
    categoryId: item.category_id,
    category: item.category_name,
    name: item.name,
    description: item.description || "",
    imageUrl: item.image_url || "",
    fulfillmentLocationId: item.fulfillment_location_id || "",
    fulfillmentLocationName: item.fulfillment_location_name || "",
    priceKobo: item.price_kobo,
    station: item.station,
    available: manualAvailable && stockAvailable,
    recipe: baseRecipe.map((line) => ({
      id: line.inventory_item_id,
      name: line.inventory_name,
      quantity: line.qty,
      unit: line.unit,
      locationId: line.inventory_location_id || "",
    })),
    modifiers: modifiers.filter((modifier) => modifier.menu_item_id === item.id).map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      priceDeltaKobo: modifier.price_delta_kobo,
      recipe: recipeLines.filter((line) => line.modifier_id === modifier.id).map((line) => ({
        id: line.inventory_item_id,
        name: line.inventory_name,
        quantity: line.qty,
        unit: line.unit,
      })),
    })),
    databaseMenuItem: true,
  };
}

async function menuItemHasSufficientStockAsync(database, propertyId, itemId) {
  const required = await database.all(`
    SELECT recipe.inventory_item_id, SUM(recipe.qty) AS needed_qty, inventory_items.qty AS on_hand
    FROM menu_recipe_lines AS recipe
    JOIN inventory_items ON inventory_items.id = recipe.inventory_item_id
    JOIN menu_items ON menu_items.id = recipe.menu_item_id AND menu_items.property_id = recipe.property_id
    WHERE recipe.property_id = ? AND recipe.menu_item_id = ? AND recipe.deleted_at IS NULL
      AND recipe.modifier_id IS NULL
      AND inventory_items.location_id = menu_items.fulfillment_location_id
    GROUP BY recipe.inventory_item_id, inventory_items.qty
  `, [propertyId, itemId]);
  return required.length > 0 && required.every((line) => Number(line.on_hand || 0) >= Number(line.needed_qty || 0));
}

async function readFnb(database, propertyId, user = null) {
  const locations = (await database.all(`
    SELECT id, name, kind, has_kitchen, active, sort_order
    FROM property_locations WHERE property_id = ? AND active = 1
    ORDER BY sort_order, name
  `, [propertyId])).map((location) => ({
    id: location.id,
    name: location.name,
    kind: location.kind,
    hasKitchen: Boolean(location.has_kitchen),
  }));
  const categories = (await database.all("SELECT * FROM menu_categories WHERE property_id = ? AND active = 1 ORDER BY name", [propertyId]))
    .map((category) => ({ id: category.id, name: category.name, station: category.station }));
  const recipeLines = await database.all(`
        SELECT recipe.*, inventory_items.name AS inventory_name, inventory_items.unit,
          inventory_items.location_id AS inventory_location_id
    FROM menu_recipe_lines AS recipe
    JOIN inventory_items ON inventory_items.id = recipe.inventory_item_id
    WHERE recipe.property_id = ? AND recipe.deleted_at IS NULL AND inventory_items.deleted_at IS NULL
  `, [propertyId]);
  const modifiers = await database.all("SELECT * FROM menu_modifiers WHERE property_id = ? AND active = 1 AND deleted_at IS NULL", [propertyId]);
  const itemRows = await database.all(`
    SELECT menu_items.*, menu_categories.name AS category_name,
           property_locations.name AS fulfillment_location_name
    FROM menu_items JOIN menu_categories ON menu_categories.id = menu_items.category_id
    LEFT JOIN property_locations ON property_locations.id = menu_items.fulfillment_location_id
    WHERE menu_items.property_id = ? AND menu_items.deleted_at IS NULL AND menu_categories.active = 1
    ORDER BY menu_categories.name, menu_items.name
  `, [propertyId]);
  const menuItems = await Promise.all(itemRows.map(async (item) => {
    const hasRecipe = recipeLines.some((line) => !line.modifier_id && line.menu_item_id === item.id);
    const stockAvailable = hasRecipe && await menuItemHasSufficientStockAsync(database, propertyId, item.id);
    return mapMenuItem(item, recipeLines, modifiers, stockAvailable);
  }));
  const orderRows = await database.all(`
    SELECT fnb_orders.*, origin.name AS origin_location_name,
           units.number AS room_number, room_location.name AS room_location_name,
          guests.full_name AS booked_guest_name, creator.name AS created_by_name
    FROM fnb_orders
    LEFT JOIN property_locations AS origin ON origin.id = fnb_orders.origin_location_id
    LEFT JOIN units ON units.id = fnb_orders.room_unit_id
    LEFT JOIN property_locations AS room_location ON room_location.id = units.location_id
    LEFT JOIN bookings ON bookings.id = fnb_orders.booking_id
    LEFT JOIN guests ON guests.id = bookings.guest_id
    LEFT JOIN users AS creator ON creator.id = fnb_orders.created_by
    WHERE fnb_orders.property_id = ? AND fnb_orders.deleted_at IS NULL
    ORDER BY fnb_orders.created_at DESC
  `, [propertyId]);
  const paymentRows = await database.all(`
    SELECT paid.order_id, paid.direct_paid_kobo, paid.folio_kobo,
      COALESCE(refunds.direct_refunded_kobo, 0) AS direct_refunded_kobo,
      COALESCE(refunds.folio_refunded_kobo, 0) AS folio_refunded_kobo
    FROM (
      SELECT order_id,
        COALESCE(SUM(CASE WHEN status = 'paid' AND method <> 'room_charge' THEN amount_kobo ELSE 0 END), 0) AS direct_paid_kobo,
        COALESCE(SUM(CASE WHEN status = 'paid' AND method = 'room_charge' THEN amount_kobo ELSE 0 END), 0) AS folio_kobo
      FROM fnb_order_payments WHERE property_id = ? GROUP BY order_id
    ) AS paid
    LEFT JOIN (
      SELECT original.order_id,
        COALESCE(SUM(CASE WHEN original.method <> 'room_charge' THEN -refund.amount_kobo ELSE 0 END), 0) AS direct_refunded_kobo,
        COALESCE(SUM(CASE WHEN original.method = 'room_charge' THEN -refund.amount_kobo ELSE 0 END), 0) AS folio_refunded_kobo
      FROM fnb_order_payments AS refund
      JOIN fnb_order_payments AS original ON original.id = refund.original_payment_id
      WHERE refund.property_id = ? AND refund.status = 'refunded'
      GROUP BY original.order_id
    ) AS refunds ON refunds.order_id = paid.order_id
  `, [propertyId, propertyId]);
  const paymentsByOrder = new Map(paymentRows.map((payment) => [payment.order_id, payment]));
  const invoiceRows = await database.all("SELECT booking_id, total_kobo, paid_kobo FROM invoices WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [propertyId]);
  const invoiceByBooking = new Map();
  for (const invoice of invoiceRows) {
    if (!invoiceByBooking.has(invoice.booking_id)) invoiceByBooking.set(invoice.booking_id, invoice);
  }
  const orders = await Promise.all(orderRows.map(async (order) => {
    const itemRowsForOrder = await database.all(`
      SELECT fnb_order_items.*, property_locations.name AS fulfillment_location_name
      FROM fnb_order_items
      LEFT JOIN property_locations ON property_locations.id = fnb_order_items.fulfillment_location_id
      WHERE fnb_order_items.order_id = ? AND fnb_order_items.property_id = ? AND fnb_order_items.deleted_at IS NULL
      ORDER BY fnb_order_items.created_at
    `, [order.id, propertyId]);
    const payment = paymentsByOrder.get(order.id) || {};
    const directPaidKobo = Math.max(0, Number(payment.direct_paid_kobo || 0) - Number(payment.direct_refunded_kobo || 0));
    const folioKobo = Math.max(0, Number(payment.folio_kobo || 0) - Number(payment.folio_refunded_kobo || 0));
    const refundedKobo = Number(payment.direct_refunded_kobo || 0) + Number(payment.folio_refunded_kobo || 0);
    const totalKobo = Number(order.total_kobo);
    const invoice = invoiceByBooking.get(order.booking_id);
    const folioSettledKobo = folioKobo > 0 && invoice && Number(invoice.paid_kobo) >= Number(invoice.total_kobo) ? folioKobo : 0;
    const postedRoomFolioKobo = Math.max(0, folioKobo - folioSettledKobo);
    const paymentStatus = refundedKobo >= totalKobo && totalKobo > 0
      ? "refunded"
      : refundedKobo > 0
        ? "partially_refunded"
        : postedRoomFolioKobo > 0
          ? "room_folio"
          : directPaidKobo + folioSettledKobo >= totalKobo && totalKobo > 0
            ? "paid"
            : directPaidKobo > 0
              ? "partially_paid"
              : "unpaid";
    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      source: order.source,
      serviceMode: order.service_mode || (order.room_unit_id ? "room" : "lounge"),
      originLocationId: order.origin_location_id || "",
      originLocationName: order.origin_location_name || "Unassigned",
      createdById: order.created_by || "",
      createdByName: order.created_by_name || order.created_by_label || "Staff",
      unitId: order.room_unit_id || "",
      bookingId: order.booking_id || "",
      roomNumber: order.room_number || "",
      roomLocationName: order.room_location_name || "Unassigned",
      guestName: order.booked_guest_name || order.guest_name || "",
      paymentMethod: order.payment_method || "",
      subtotalKobo: Number(order.subtotal_kobo),
      discountKobo: Number(order.discount_kobo),
      taxKobo: Number(order.tax_kobo),
      serviceKobo: Number(order.service_kobo),
      totalKobo,
      paidKobo: directPaidKobo,
      roomFolioKobo: postedRoomFolioKobo,
      settledFolioKobo: folioSettledKobo,
      refundedKobo,
      refundableKobo: directPaidKobo + folioKobo,
      outstandingKobo: Math.max(0, totalKobo - directPaidKobo - folioKobo),
      paymentStatus,
      notes: order.notes || "",
      createdAt: order.created_at,
      items: itemRowsForOrder.map((line) => ({
        id: line.id,
        menuItemId: line.menu_item_id,
        name: line.item_name,
        station: line.station,
        fulfillmentLocationId: line.fulfillment_location_id || "",
        fulfillmentLocationName: line.fulfillment_location_name || "Unassigned",
        quantity: Number(line.qty),
        unitPriceKobo: Number(line.unit_price_kobo),
        modifiers: readJsonValue(line.modifiers_json, []),
        status: line.item_status,
      })),
      databaseOrder: true,
    };
  }));
  const batches = (await database.all(`
    SELECT batches.*, inventory_items.name AS item_name, inventory_items.unit
    FROM inventory_batches AS batches JOIN inventory_items ON inventory_items.id = batches.item_id
    WHERE batches.property_id = ? AND batches.deleted_at IS NULL ORDER BY batches.expiry_date, batches.received_at
  `, [propertyId])).map((batch) => ({
    id: batch.id, itemId: batch.item_id, itemName: batch.item_name, unit: batch.unit,
    batchCode: batch.batch_code || "", receivedQuantity: Number(batch.received_qty),
    remainingQuantity: Number(batch.remaining_qty), unitCostKobo: Number(batch.unit_cost_kobo),
    receivedAt: batch.received_at, expiryDate: batch.expiry_date || "", databaseBatch: true,
  }));
  const minibarMovements = (await database.all(`
    SELECT minibar_movements.*, units.number AS room_number, inventory_items.name AS item_name
    FROM minibar_movements JOIN units ON units.id = minibar_movements.unit_id
    JOIN inventory_items ON inventory_items.id = minibar_movements.item_id
    WHERE minibar_movements.property_id = ? ORDER BY minibar_movements.created_at DESC LIMIT 200
  `, [propertyId])).map((row) => ({
    id: row.id, unitId: row.unit_id, roomNumber: row.room_number, bookingId: row.booking_id || "",
    itemId: row.item_id, itemName: row.item_name, quantity: Number(row.qty),
    unitPriceKobo: Number(row.unit_price_kobo), movementType: row.movement_type,
    reason: row.reason, createdAt: row.created_at,
  }));
  const payments = (await database.all(`
    SELECT fnb_order_payments.id, order_id, method, amount_kobo, status, original_payment_id,
          reference, reason, fnb_order_payments.created_at, created_by, users.name AS created_by_name
    FROM fnb_order_payments
    LEFT JOIN users ON users.id = fnb_order_payments.created_by
    WHERE fnb_order_payments.property_id = ? ORDER BY fnb_order_payments.created_at DESC
  `, [propertyId])).map((payment) => ({
    id: payment.id, orderId: payment.order_id, method: payment.method,
    amountKobo: Number(payment.amount_kobo), status: payment.status,
    originalPaymentId: payment.original_payment_id || "", reference: payment.reference || "",
    reason: payment.reason || "", createdAt: payment.created_at,
    createdById: payment.created_by || "", createdByName: payment.created_by_name || "Staff", databasePayment: true,
  }));
  const visibleOrders = user?.role === "worker"
    ? orders.filter((order) => order.originLocationId === user.location_id || order.createdById === user.id || order.items.some((item) => item.fulfillmentLocationId === user.location_id))
    : orders;
  const visibleOrderIds = new Set(visibleOrders.map((order) => order.id));
  const visiblePayments = user?.role === "worker" ? payments.filter((payment) => visibleOrderIds.has(payment.orderId)) : payments;
  return { locations, categories, menuItems, orders: visibleOrders, payments: visiblePayments, batches, minibarMovements };
}

function validMenuImage(value) {
  if (typeof value !== "string" || value.length > 3_500_000) return false;
  if (value.startsWith("data:image/webp;base64,")) {
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice("data:image/webp;base64,".length));
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function consumeStock(database, propertyId, itemId, quantity, reference, reason, expectedLocationId = "") {
  const getForUpdate = database.getForUpdate || database.get.bind(database);
  const item = await getForUpdate(`
     SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL
  `, [itemId, propertyId]);
  if (!item) throw problem("A recipe refers to an unavailable stock item.", 409);
  if (expectedLocationId && item.location_id !== expectedLocationId) throw problem(`${item.name} is stocked at another location. Record a stock transfer or correct the recipe.`, 409);
  if (Number(item.qty) < quantity) throw problem(`Not enough ${item.name} in stock.`, 409);
  const totalBatchOnHand = await database.get(`
    SELECT COALESCE(sum(remaining_qty), 0) AS qty FROM inventory_batches
    WHERE item_id = ? AND property_id = ? AND deleted_at IS NULL
  `, [itemId, propertyId]);
  const unbatched = Math.max(0, Number(item.qty) - Number(totalBatchOnHand.qty));
  let remaining = quantity;
  const batches = await database.all(`
    SELECT * FROM inventory_batches
    WHERE item_id = ? AND property_id = ? AND deleted_at IS NULL
      AND remaining_qty > 0 AND (expiry_date IS NULL OR expiry_date >= date('now'))
    ORDER BY expiry_date IS NULL, expiry_date, received_at
  `, [itemId, propertyId]);
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.remaining_qty));
    await database.run("UPDATE inventory_batches SET remaining_qty = remaining_qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [take, batch.id]);
    remaining -= take;
  }
  if (remaining > unbatched) throw problem(`Not enough unexpired ${item.name} batches in stock.`, 409);
  const movementId = `MOV-${crypto.randomUUID()}`;
  await database.run(`
    INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, location_id, created_at, updated_at)
    VALUES (?, ?, ?, 'out', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [movementId, propertyId, itemId, quantity, reason, reference, item.location_id || null]);
  await database.run("UPDATE inventory_items SET qty = qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [quantity, itemId]);
  await syncLowStockNotificationsAsync(database, propertyId);
}

async function readChargePercent(database, propertyId, key) {
  const row = await database.get("SELECT value_json FROM property_settings WHERE property_id = ? AND key = ?", [propertyId, key]);
    const percent = Number(row ? JSON.parse(row.value_json) : 0);
  return Number.isFinite(percent) && percent >= 0 ? percent : 0;
}

export function registerFnbRoutes(app, database, propertyId) {
    app.get("/api/fnb", async (request, response) => {
      response.json(await readFnb(database, propertyId, request.user));
  });

  app.post("/api/fnb/menu-items", async (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const { name, category, station } = request.body;
    const imageUrl = String(request.body.imageUrl || "").trim();
    const priceKobo = Math.round(Number(request.body.priceKobo));
    const recipe = Array.isArray(request.body.recipe) ? request.body.recipe : [];
    const modifiers = Array.isArray(request.body.modifiers) ? request.body.modifiers : [];
    if (!String(name || "").trim() || !String(category || "").trim() || !["kitchen", "bar"].includes(station) || !Number.isSafeInteger(priceKobo) || priceKobo < 0 || !recipe.length) {
      return response.status(400).json({ error: "Menu name, category, station, price, and at least one recipe ingredient are required." });
    }
    if (imageUrl && !validMenuImage(imageUrl)) return response.status(400).json({ error: "Use an HTTPS image URL or upload a supported food photo." });
    const itemId = `MENU-${crypto.randomUUID()}`;
    try {
      const saved = await database.withTransaction(async (transaction) => {
        let categoryRow = await transaction.get("SELECT * FROM menu_categories WHERE property_id = ? AND lower(name) = lower(?)", [propertyId, category.trim()]);
        if (!categoryRow) {
          const categoryId = `CAT-${crypto.randomUUID()}`;
          await transaction.run("INSERT INTO menu_categories (id, property_id, name, station, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [categoryId, propertyId, category.trim(), station]);
          categoryRow = await transaction.get("SELECT * FROM menu_categories WHERE id = ?", [categoryId]);
        }
        const fulfillmentLocationId = request.body.fulfillmentLocationId || (station === "bar" ? "location-bar" : "location-building-2");
        const fulfillmentLocation = await transaction.get("SELECT id FROM property_locations WHERE id = ? AND property_id = ? AND active = 1", [fulfillmentLocationId, propertyId]);
        if (!fulfillmentLocation) throw problem("Choose a valid fulfillment location for this menu item.");
        await transaction.run("INSERT INTO menu_items (id, property_id, category_id, name, description, image_url, fulfillment_location_id, price_kobo, station, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
          [itemId, propertyId, categoryRow.id, name.trim(), request.body.description || null, imageUrl || null, fulfillmentLocationId, priceKobo, station]);
        for (const line of recipe) {
          const quantity = Number(line.quantity);
          const stock = await transaction.get("SELECT id, unit, location_id FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [line.inventoryItemId, propertyId]);
          if (!stock || stock.location_id !== fulfillmentLocationId || !Number.isFinite(quantity) || quantity <= 0) throw problem("Choose stock from this menu item's fulfillment location and enter valid recipe quantities.");
          await transaction.run("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, modifier_id, qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [`RECIPE-${crypto.randomUUID()}`, propertyId, itemId, stock.id, null, quantity, stock.unit]);
        }
        for (const modifier of modifiers) {
          const modifierId = `MOD-${crypto.randomUUID()}`;
          const priceDelta = Math.round(Number(modifier.priceDeltaKobo || 0));
          if (!String(modifier.name || "").trim() || !Number.isSafeInteger(priceDelta)) throw problem("Modifier names and price adjustments must be valid.");
          await transaction.run("INSERT INTO menu_modifiers (id, property_id, menu_item_id, name, price_delta_kobo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [modifierId, propertyId, itemId, modifier.name.trim(), priceDelta]);
          for (const line of modifier.recipe || []) {
            const quantity = Number(line.quantity);
            const stock = await transaction.get("SELECT id, unit, location_id FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [line.inventoryItemId, propertyId]);
            if (!stock || stock.location_id !== fulfillmentLocationId || !Number.isFinite(quantity) || quantity <= 0) throw problem("Modifier ingredients must come from the menu item's fulfillment location.");
            await transaction.run("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, modifier_id, qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [`RECIPE-${crypto.randomUUID()}`, propertyId, itemId, stock.id, modifierId, quantity, stock.unit]);
          }
        }
        const savedItem = (await readFnb(transaction, propertyId)).menuItems.find((item) => item.id === itemId);
        await auditAsync(transaction, propertyId, "menu_item", itemId, "created", null, savedItem, request.user?.id);
        return savedItem;
      });
      response.status(201).json(saved);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/menu-items/:id", async (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    try {
      const saved = await database.withTransaction(async (transaction) => {
        const item = await transaction.get("SELECT menu_items.*, menu_categories.name AS category_name FROM menu_items JOIN menu_categories ON menu_categories.id = menu_items.category_id WHERE menu_items.id = ? AND menu_items.property_id = ? AND menu_items.deleted_at IS NULL AND menu_categories.active = 1", [request.params.id, propertyId]);
        if (!item) throw problem("Menu item not found.", 404);
        const name = typeof request.body.name === "string" ? request.body.name.trim() : item.name;
        const category = typeof request.body.category === "string" ? request.body.category.trim() : item.category_name;
        const station = ["kitchen", "bar"].includes(request.body.station) ? request.body.station : item.station;
        const description = typeof request.body.description === "string" ? request.body.description : item.description || "";
        const imageUrl = typeof request.body.imageUrl === "string" ? request.body.imageUrl.trim() : item.image_url || "";
        const fulfillmentLocationId = request.body.fulfillmentLocationId || (station === "bar" ? "location-bar" : item.fulfillment_location_id || "location-building-2");
        const priceKobo = Number.isFinite(Number(request.body.priceKobo)) ? Math.round(Number(request.body.priceKobo)) : item.price_kobo;
        const recipe = Array.isArray(request.body.recipe) ? request.body.recipe : null;
        if (!name || !category || !["kitchen", "bar"].includes(station) || !Number.isSafeInteger(priceKobo) || priceKobo < 0) {
          throw problem("Menu name, category, station, and price are required.", 400);
        }
        if (recipe && !recipe.length) throw problem("At least one recipe ingredient is required.", 400);
        if (imageUrl && !validMenuImage(imageUrl)) throw problem("Use an HTTPS image URL or upload a supported food photo.", 400);
        const fulfillmentLocation = await transaction.get("SELECT id FROM property_locations WHERE id = ? AND property_id = ? AND active = 1", [fulfillmentLocationId, propertyId]);
        if (!fulfillmentLocation) throw problem("Choose a valid fulfillment location for this menu item.", 400);

        let categoryRow = await transaction.get("SELECT * FROM menu_categories WHERE property_id = ? AND lower(name) = lower(?)", [propertyId, category]);
        if (!categoryRow) {
          categoryRow = { id: `CAT-${crypto.randomUUID()}` };
          await transaction.run("INSERT INTO menu_categories (id, property_id, name, station, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [categoryRow.id, propertyId, category, station]);
        }
        await transaction.run("UPDATE menu_items SET name = ?, description = ?, image_url = ?, fulfillment_location_id = ?, price_kobo = ?, station = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?",
          [name, description || null, imageUrl || null, fulfillmentLocationId, priceKobo, station, categoryRow.id, request.params.id, propertyId]);
        if (recipe) {
          await transaction.run("UPDATE menu_recipe_lines SET deleted_at = CURRENT_TIMESTAMP WHERE menu_item_id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
          for (const line of recipe) {
            const quantity = Number(line.quantity);
            const stock = await transaction.get("SELECT id, unit, location_id FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [line.inventoryItemId, propertyId]);
            if (!stock || stock.location_id !== fulfillmentLocationId || !Number.isFinite(quantity) || quantity <= 0) throw problem("Choose stock from this menu item's fulfillment location and enter valid recipe quantities.", 400);
            await transaction.run("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, modifier_id, qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [`RECIPE-${crypto.randomUUID()}`, propertyId, request.params.id, stock.id, null, quantity, stock.unit]);
          }
        }
        const intermediate = (await readFnb(transaction, propertyId)).menuItems.find((menuItem) => menuItem.id === request.params.id);
        await transaction.run("UPDATE menu_items SET available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?",
          [intermediate?.available ? 1 : 0, request.params.id, propertyId]);
        const savedItem = (await readFnb(transaction, propertyId)).menuItems.find((menuItem) => menuItem.id === request.params.id);
        await auditAsync(transaction, propertyId, "menu_item", request.params.id, "updated", item, savedItem, request.user?.id);
        return savedItem;
      });
      response.json(saved);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/menu-items/:id/availability", async (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const available = request.body.available ? 1 : 0;
    const item = await database.get("SELECT * FROM menu_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!item) return response.status(404).json({ error: "Menu item not found." });
    if (available && !await menuItemHasSufficientStockAsync(database, propertyId, request.params.id)) {
      return response.status(409).json({ error: "This menu item is unavailable because its tracked stock is insufficient." });
    }
    const result = await database.run("UPDATE menu_items SET available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [available, request.params.id, propertyId]);
    if (!result.changes) return response.status(404).json({ error: "Menu item not found." });
    await auditAsync(database, propertyId, "menu_item", request.params.id, available ? "enabled" : "unavailable", null, { available: Boolean(available) }, request.user?.id);
    response.json({ id: request.params.id, available: Boolean(available) });
  });

  app.post("/api/fnb/orders", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const { items, unitId = "", bookingId = "", guestName = "" } = request.body;
    const serviceMode = request.body.serviceMode || (unitId || bookingId ? "room" : "lounge");
    const paymentMethod = request.body.paymentMethod || (serviceMode === "room" ? "room_charge" : "cash");
    let source = serviceMode === "room" ? "room_service" : "bar";
    if (!Array.isArray(items) || !items.length) return response.status(400).json({ error: "Add at least one menu item." });
    if (!["room", "lounge"].includes(serviceMode)) return response.status(400).json({ error: "Choose Room or Lounge for this order." });
    if (!["room_charge", "cash", "card", "transfer"].includes(paymentMethod)) return response.status(400).json({ error: "Select a valid payment method." });
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, "fnb-order:create");
        if (idempotency.response) return { replay: true, result: idempotency.response };
        let booking = null;
        let roomUnitId = "";
        let originLocationId = "";
        if (serviceMode === "room") {
          if (!unitId || !bookingId) throw problem("Choose a checked-in room from Building 1 or Building 2.", 409);
          booking = await transaction.get(`
            SELECT bookings.*, guests.full_name, units.id AS room_id, units.location_id,
                   property_locations.name AS location_name
            FROM bookings JOIN guests ON guests.id = bookings.guest_id
            JOIN units ON units.id = bookings.unit_id
            LEFT JOIN property_locations ON property_locations.id = units.location_id
            WHERE bookings.id = ? AND bookings.property_id = ? AND bookings.status = 'checked_in'
              AND bookings.deleted_at IS NULL
          `, [bookingId, propertyId]);
          if (!booking || (unitId && booking.unit_id !== unitId)) throw problem("Room charge requires an active checked-in booking for that room.", 409);
          if (!booking.location_id || !booking.location_name) throw problem("Assign this room to Building 1 or Building 2 before ordering food.", 409);
          if (request.user.role === "worker") {
            const assignedLocation = await transaction.get("SELECT kind FROM property_locations WHERE id = ? AND property_id = ? AND active = 1", [request.user.location_id, propertyId]);
            if (assignedLocation?.kind !== "accommodation") throw problem("Only accommodation staff can create room-service orders.", 403);
          }
          roomUnitId = booking.unit_id;
          originLocationId = booking.location_id;
        } else {
          if (unitId || bookingId || paymentMethod === "room_charge") throw problem("Lounge orders cannot have a room, booking, or room charge.", 400);
          originLocationId = request.body.originLocationId || request.user.location_id || "location-bar";
          const location = await transaction.get("SELECT id, kind FROM property_locations WHERE id = ? AND property_id = ? AND active = 1", [originLocationId, propertyId]);
          if (!location) throw problem("Choose an active building or outlet for this lounge order.", 400);
          if (request.user.role === "worker" && request.user.location_id !== location.id) throw problem("Your account is not assigned to this order's origin location.", 403);
          source = location.kind === "bar" ? "bar" : "restaurant";
        }
        const itemSnapshots = [];
        let subtotal = 0;
        for (const requestItem of items) {
          const quantity = Number(requestItem.quantity);
          if (!Number.isInteger(quantity) || quantity <= 0) throw problem("Order quantities must be positive whole numbers.");
          const item = await transaction.get(`
            SELECT menu_items.*, menu_categories.name AS category_name
            FROM menu_items JOIN menu_categories ON menu_categories.id = menu_items.category_id
            WHERE menu_items.id = ? AND menu_items.property_id = ? AND menu_items.deleted_at IS NULL
          `, [requestItem.menuItemId, propertyId]);
          if (!item) throw problem("A selected menu item is unavailable.", 409);
          const fulfillmentLocationId = item.fulfillment_location_id || (item.station === "bar" ? "location-bar" : "location-building-2");
          const chosenModifiers = [];
          for (const modifierId of requestItem.modifierIds || []) {
            const modifier = await transaction.get("SELECT * FROM menu_modifiers WHERE id = ? AND menu_item_id = ? AND active = 1 AND deleted_at IS NULL", [modifierId, item.id]);
            if (!modifier) throw problem("A selected modifier is unavailable.", 409);
            chosenModifiers.push({ id: modifier.id, name: modifier.name, priceDeltaKobo: modifier.price_delta_kobo });
          }
          const unitPrice = item.price_kobo + chosenModifiers.reduce((sum, modifier) => sum + modifier.priceDeltaKobo, 0);
          if (unitPrice < 0) throw problem("Modifier prices cannot reduce an item below zero.");
          const recipe = (await transaction.all(`
            SELECT inventory_item_id, qty, modifier_id FROM menu_recipe_lines
            WHERE menu_item_id = ? AND property_id = ? AND deleted_at IS NULL
          `, [item.id, propertyId])).filter((line) => !line.modifier_id || chosenModifiers.some((modifier) => modifier.id === line.modifier_id))
            .map((line) => ({ inventoryItemId: line.inventory_item_id, quantity: line.qty * quantity }));
          if (!recipe.length) throw problem(`${item.name} has no recipe. Ask a manager to add ingredients.`, 409);
          let insufficiency = false;
          for (const ingredient of recipe) {
            const stock = await transaction.get("SELECT qty, location_id FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [ingredient.inventoryItemId, propertyId]);
            if (!stock || stock.location_id !== fulfillmentLocationId) throw problem(`${item.name} recipe includes stock assigned to another location.`, 409);
            if (Number(stock.qty) < Number(ingredient.quantity)) insufficiency = true;
          }
          if (insufficiency) throw problem(`Not enough stock for ${item.name}.`, 409);
          itemSnapshots.push({ item, quantity, unitPrice, chosenModifiers, recipe, fulfillmentLocationId });
          subtotal += unitPrice * quantity;
        }
        const discount = Math.round(Number(request.body.discountKobo || 0));
        if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) throw problem("Discount is invalid or exceeds the order subtotal.");
        const taxable = subtotal - discount;
        const service = Math.round(taxable * await readChargePercent(transaction, propertyId, "servicePercent") / 100);
        const tax = Math.round(taxable * await readChargePercent(transaction, propertyId, "vatPercent") / 100);
        const total = taxable + service + tax;
        const orderId = `FNB-${crypto.randomUUID()}`;
        const orderNumber = `FNB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
        await transaction.run(`
          INSERT INTO fnb_orders (
            id, property_id, order_number, status, source, room_unit_id, booking_id,
            service_mode, origin_location_id, guest_name, payment_method, subtotal_kobo, discount_kobo, service_kobo, tax_kobo,
            total_kobo, notes, created_by_label, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [orderId, propertyId, orderNumber, source, roomUnitId || null, booking?.id || null,
          serviceMode, originLocationId,
          guestName || booking?.full_name || null, paymentMethod, subtotal, discount, service, tax, total,
          request.body.notes || null, request.user.name, request.user.id]);
        const insertLine = `
          INSERT INTO fnb_order_items (
            id, property_id, order_id, menu_item_id, item_name, station, fulfillment_location_id, qty,
            unit_price_kobo, modifiers_json, recipe_snapshot_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        for (const snapshot of itemSnapshots) await transaction.run(insertLine, [
          `FNB-LINE-${crypto.randomUUID()}`, propertyId, orderId, snapshot.item.id,
          snapshot.item.name, snapshot.item.station, snapshot.fulfillmentLocationId, snapshot.quantity, snapshot.unitPrice,
          JSON.stringify(snapshot.chosenModifiers), JSON.stringify(snapshot.recipe),
        ]);
        await auditAsync(transaction, propertyId, "fnb_order", orderId, "created", null, { orderNumber, source, totalKobo: total, bookingId: booking?.id || null }, request.user?.id);
        const saved = (await readFnb(transaction, propertyId)).orders.find((order) => order.id === orderId);
        await saveIdempotencyAsync(transaction, request, propertyId, "fnb-order:create", idempotency, saved);
        return { replay: false, result: saved };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/orders/:id", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    try {
      const updated = await database.withTransaction(async (transaction) => {
        const order = await transaction.getForUpdate("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!order) throw problem("Order not found.", 404);
        if (request.user.role === "worker" && status !== "cancelled") throw problem("Workers must update items from their assigned station; payments are recorded separately.", 403);
        if (request.user.role === "worker" && request.user.location_id !== order.origin_location_id && request.user.id !== order.created_by) throw problem("Your account is not assigned to this order's originating outlet.", 403);
        if (order.status === "billed") throw problem("A billed order cannot be edited.", 409);
        const updates = Array.isArray(request.body.items) ? request.body.items : [];
        if (!updates.length) return (await readFnb(transaction, propertyId)).orders.find((item) => item.id === order.id);

        const orderLines = await transaction.all("SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL", [order.id, propertyId]);
        const lineMap = new Map(orderLines.map((line) => [line.id, line]));
        const nextLines = [];
        let newSubtotal = 0;
        for (const update of updates) {
          const line = lineMap.get(update.id);
          if (!line) throw problem("Order item not found.", 404);
          const originalQty = Number(line.qty || 0);
          const nextQty = Number(update.quantity);
          if (!Number.isInteger(nextQty) || nextQty <= 0) throw problem("Order item quantities must be positive whole numbers.", 400);
          const delta = nextQty - originalQty;
          const recipe = readJsonValue(line.recipe_snapshot_json, []);
          if (delta > 0 && order.status === "accepted") {
            for (const ingredient of recipe) {
              const needed = Number(ingredient.quantity) * delta;
              const stock = await transaction.getForUpdate("SELECT qty FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [ingredient.inventoryItemId, propertyId]);
              if (!stock || Number(stock.qty) < needed) throw problem(`Not enough stock for ${line.item_name}.`, 409);
            }
            for (const ingredient of recipe) {
              await consumeStock(transaction, propertyId, ingredient.inventoryItemId, Number(ingredient.quantity) * delta, order.id, `Order update ${order.order_number}`, line.fulfillment_location_id);
            }
          } else if (delta < 0 && order.status === "accepted") {
            for (const ingredient of recipe) {
              const restore = Number(ingredient.quantity) * Math.abs(delta);
              await transaction.run("UPDATE inventory_items SET qty = qty + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [restore, ingredient.inventoryItemId, propertyId]);
              await transaction.run("INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, location_id, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [`MOV-${crypto.randomUUID()}`, propertyId, ingredient.inventoryItemId, restore, `Order update reversal ${order.order_number}`, order.id, line.fulfillment_location_id]);
            }
          }
          await transaction.run("UPDATE fnb_order_items SET qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextQty, line.id]);
          const nextLine = { ...line, qty: nextQty, item_status: line.item_status };
          nextLines.push(nextLine);
          newSubtotal += Number(line.unit_price_kobo) * nextQty;
        }

        const currentOrder = await transaction.get("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [order.id, propertyId]);
        const subtotal = newSubtotal;
        const discount = Math.max(0, Math.min(Number(currentOrder.discount_kobo || 0), subtotal));
        const taxable = subtotal - discount;
        const service = Math.round(taxable * await readChargePercent(transaction, propertyId, "servicePercent") / 100);
        const tax = Math.round(taxable * await readChargePercent(transaction, propertyId, "vatPercent") / 100);
        const total = taxable + service + tax;
        await transaction.run("UPDATE fnb_orders SET subtotal_kobo = ?, discount_kobo = ?, service_kobo = ?, tax_kobo = ?, total_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [subtotal, discount, service, tax, total, order.id]);
        await auditAsync(transaction, propertyId, "fnb_order", order.id, "updated", order, { ...order, subtotalKobo: subtotal, totalKobo: total, items: nextLines }, request.user?.id);
        return (await readFnb(transaction, propertyId)).orders.find((item) => item.id === order.id);
      });
      response.json(updated);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/orders/:id/status", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const status = request.body.status;
    if (status === "billed") return response.status(409).json({ error: "Fulfillment and payment are separate. Record payment from the order balance panel." });
    const transitions = {
      new: ["accepted", "cancelled"],
      accepted: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["served", "cancelled"],
      served: [],
      billed: [],
      cancelled: [],
    };
    try {
      const updated = await database.withTransaction(async (transaction) => {
        const order = await transaction.getForUpdate("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!order) throw problem("Order not found.", 404);
        if (request.user.role === "worker" && request.user.location_id !== order.origin_location_id && request.user.id !== order.created_by) throw problem("Your account is not assigned to this order's originating outlet.", 403);
        if (!transitions[order.status]?.includes(status)) throw problem(`Cannot move an order from ${order.status} to ${status}.`, 409);
        if (status === "cancelled" && order.status !== "new" && !managementRoles.includes(request.user.role)) throw problem("A manager must cancel an order after acceptance.", 403);
        if (status === "cancelled" && order.status !== "new" && !String(request.body.reason || "").trim()) throw problem("A reason is required when cancelling an accepted order.");
        if (status === "accepted") {
          const lines = await transaction.all("SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL", [order.id, propertyId]);
          for (const line of lines) {
            if (line.stock_posted) continue;
            for (const ingredient of readJsonValue(line.recipe_snapshot_json, [])) {
              await consumeStock(transaction, propertyId, ingredient.inventoryItemId, Number(ingredient.quantity), order.id, `F&B order ${order.order_number}`, line.fulfillment_location_id);
            }
            await transaction.run("UPDATE fnb_order_items SET stock_posted = 1, item_status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [line.id]);
          }
        }
        if (status === "cancelled") {
          const lines = await transaction.all("SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL", [order.id, propertyId]);
          if (order.status === "new") {
            await transaction.run("UPDATE fnb_order_items SET item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND property_id = ?", [order.id, propertyId]);
          } else if (["accepted", "preparing", "ready"].includes(order.status)) {
            for (const line of lines) {
              if (!line.stock_posted) continue;
              for (const ingredient of readJsonValue(line.recipe_snapshot_json, [])) {
                await transaction.run("UPDATE inventory_items SET qty = qty + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [Number(ingredient.quantity), ingredient.inventoryItemId, propertyId]);
                await transaction.run("INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, location_id, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                  [`MOV-${crypto.randomUUID()}`, propertyId, ingredient.inventoryItemId, Number(ingredient.quantity), `Cancelled order reversal ${order.order_number}`, order.id, line.fulfillment_location_id]);
              }
              await transaction.run("UPDATE fnb_order_items SET stock_posted = 0, item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [line.id]);
            }
          }
          await transaction.run("UPDATE fnb_orders SET status = 'cancelled', subtotal_kobo = 0, discount_kobo = 0, service_kobo = 0, tax_kobo = 0, total_kobo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [order.id]);
        }
        if (status === "preparing" || status === "ready" || status === "served") {
          await transaction.run("UPDATE fnb_order_items SET item_status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND property_id = ? AND item_status != 'cancelled'", [status, order.id, propertyId]);
        }
        if (status === "billed") {
          if (order.payment_method === "room_charge") {
            const booking = await transaction.getForUpdate("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND status = 'checked_in' AND deleted_at IS NULL", [order.booking_id, propertyId]);
            if (!booking) throw problem("Room-charge booking is no longer checked in.", 409);
            const invoice = await transaction.getForUpdate("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", [booking.id, propertyId]);
            if (!invoice) throw problem("The booking has no invoice to charge.", 409);
            const extraId = `EXTRA-${crypto.randomUUID()}`;
            await transaction.run("INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, 'restaurant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
              [extraId, propertyId, booking.id, `Food & beverage order ${order.order_number}`, order.total_kobo]);
            await transaction.run("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [order.total_kobo, invoice.id]);
            await transaction.run("UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, discount_kobo = discount_kobo + ?, service_kobo = service_kobo + ?, vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              [order.subtotal_kobo - order.discount_kobo, order.discount_kobo, order.service_kobo, order.tax_kobo, order.total_kobo, booking.id]);
            await transaction.run("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, reference, created_at, updated_at) VALUES (?, ?, ?, 'room_charge', ?, 'paid', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
              [`FNB-PAY-${crypto.randomUUID()}`, propertyId, order.id, order.total_kobo, `ROOM-${order.order_number}`]);
          } else {
            const paymentId = `FNB-PAY-${crypto.randomUUID()}`;
            await transaction.run("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, reference, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
              [paymentId, propertyId, order.id, order.payment_method, order.total_kobo, `POS-${order.order_number}`]);
          }
        }
        if (status !== "cancelled") {
          await transaction.run("UPDATE fnb_orders SET status = ?, billed_at = CASE WHEN ? = 'billed' THEN CURRENT_TIMESTAMP ELSE billed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, status, order.id]);
        }
        await auditAsync(transaction, propertyId, "fnb_order", order.id, status, order, { ...order, status }, request.user?.id);
        return (await readFnb(transaction, propertyId)).orders.find((item) => item.id === order.id);
      });
      response.json(updated);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/orders/:id/items/:itemId/status", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const status = String(request.body.status || "");
    const nextStates = { new: ["accepted", "cancelled"], accepted: ["preparing"], preparing: ["ready"], ready: ["served"] };
    try {
      const updated = await database.withTransaction(async (transaction) => {
        const order = await transaction.getForUpdate("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!order || order.status === "cancelled" || order.status === "billed") throw problem("Active order not found.", 404);
        const line = await transaction.getForUpdate("SELECT * FROM fnb_order_items WHERE id = ? AND order_id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.itemId, order.id, propertyId]);
        if (!line) throw problem("Order item not found.", 404);
        if (!nextStates[line.item_status]?.includes(status)) throw problem(`Cannot move this item from ${line.item_status} to ${status}.`, 409);
        if (request.user.role === "worker" && status === "served") {
          if (request.user.location_id !== order.origin_location_id) throw problem("Only the originating outlet can record service handoff.", 403);
          const pendingLines = await transaction.get("SELECT count(*) AS count FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND id <> ? AND item_status NOT IN ('ready', 'served', 'cancelled') AND deleted_at IS NULL", [order.id, propertyId, line.id]);
          if (Number(pendingLines.count) > 0) throw problem("Wait until every item is ready before recording service.", 409);
        } else if (request.user.role === "worker" && request.user.location_id !== line.fulfillment_location_id) {
          throw problem("Your account is not assigned to this item's fulfillment station.", 403);
        }
        if (status === "cancelled") {
          if (String(request.body.reason || "").trim().length < 3) throw problem("Enter a reason for cancelling this item.", 400);
          await transaction.run("UPDATE fnb_order_items SET item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [line.id]);
        } else {
          if (status === "accepted" && !line.stock_posted) {
            for (const ingredient of readJsonValue(line.recipe_snapshot_json, [])) {
              await consumeStock(transaction, propertyId, ingredient.inventoryItemId, Number(ingredient.quantity), order.id, `F&B order ${order.order_number}`, line.fulfillment_location_id);
            }
            await transaction.run("UPDATE fnb_order_items SET stock_posted = 1, item_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, line.id]);
          } else {
            await transaction.run("UPDATE fnb_order_items SET item_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, line.id]);
          }
        }
        const lineRows = await transaction.all("SELECT item_status FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL", [order.id, propertyId]);
        const states = lineRows.map((item) => item.item_status);
        const activeStates = states.filter((value) => value !== "cancelled");
        const orderStatus = !activeStates.length ? "cancelled"
          : activeStates.every((value) => value === "served") ? "served"
            : activeStates.every((value) => ["ready", "served"].includes(value)) ? "ready"
              : activeStates.includes("preparing") ? "preparing"
                : activeStates.some((value) => ["accepted", "ready", "served"].includes(value)) ? "accepted"
                  : "new";
        await transaction.run("UPDATE fnb_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [orderStatus, order.id, propertyId]);
        await auditAsync(transaction, propertyId, "fnb_order_item", line.id, status, line, { ...line, item_status: status, orderStatus }, request.user.id);
        return (await readFnb(transaction, propertyId)).orders.find((entry) => entry.id === order.id);
      });
      response.json(updated);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/fnb/orders/:id/payments", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const amount = Math.round(Number(request.body.amountKobo));
    const method = String(request.body.method || "");
    const reference = String(request.body.reference || "").trim().slice(0, 120);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !["cash", "card", "transfer", "room_charge"].includes(method)) {
      return response.status(400).json({ error: "Enter a positive payment amount and choose cash, card, transfer, or room folio." });
    }
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, `fnb-order:${request.params.id}:payment`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const order = await transaction.getForUpdate("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!order) throw problem("Order not found.", 404);
        if (request.user.role === "worker" && request.user.location_id !== order.origin_location_id && request.user.id !== order.created_by) throw problem("Your account is not assigned to this order's payment or originating outlet.", 403);
        if (order.status === "cancelled" || order.total_kobo <= 0) throw problem("Cancelled or zero-total orders cannot receive payments.", 409);
        const totals = await transaction.get(`
          SELECT COALESCE(SUM(amount_kobo), 0) AS paid_kobo
          FROM fnb_order_payments WHERE order_id = ? AND property_id = ?
        `, [order.id, propertyId]);
        const remainingKobo = Math.max(0, Number(order.total_kobo) - Number(totals.paid_kobo || 0));
        if (amount > remainingKobo) throw problem("Payment exceeds the remaining order balance.", 409);
        if (method === "room_charge") {
          if (order.service_mode !== "room" || !order.booking_id) throw problem("Only a room-service order can be posted to a guest folio.", 409);
          const booking = await transaction.getForUpdate("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND status = 'checked_in' AND deleted_at IS NULL", [order.booking_id, propertyId]);
          if (!booking) throw problem("Room charges require an active checked-in booking.", 409);
          const invoice = await transaction.getForUpdate("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", [booking.id, propertyId]);
          if (!invoice) throw problem("The booking has no invoice to charge.", 409);
          const proportion = amount / Number(order.total_kobo);
          const subtotalKobo = Math.round((Number(order.subtotal_kobo) - Number(order.discount_kobo)) * proportion);
          const discountKobo = Math.round(Number(order.discount_kobo) * proportion);
          const serviceKobo = Math.round(Number(order.service_kobo) * proportion);
          const taxKobo = amount - subtotalKobo - discountKobo - serviceKobo;
          await transaction.run("INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, 'restaurant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [`EXTRA-${crypto.randomUUID()}`, propertyId, booking.id, `Food & beverage order ${order.order_number}`, amount]);
          await transaction.run("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [amount, invoice.id]);
          await transaction.run("UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, discount_kobo = discount_kobo + ?, service_kobo = service_kobo + ?, vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [subtotalKobo, discountKobo, serviceKobo, taxKobo, amount, booking.id]);
        }
        const paymentId = `FNB-PAY-${crypto.randomUUID()}`;
        const savedPayment = {
          id: paymentId,
          orderId: order.id,
          method,
          amountKobo: amount,
          status: "paid",
          reference: reference || `${method === "room_charge" ? "ROOM" : "POS"}-${order.order_number}`,
          createdAt: new Date().toISOString(),
          createdBy: request.user.name,
        };
        await transaction.run(`
          INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, reference, created_at, updated_at, created_by)
          VALUES (?, ?, ?, ?, ?, 'paid', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
        `, [savedPayment.id, propertyId, order.id, method, amount, savedPayment.reference, request.user.id]);
        await auditAsync(transaction, propertyId, "fnb_order", order.id, method === "room_charge" ? "posted_to_room_folio" : "payment_recorded", null, savedPayment, request.user.id);
        await saveIdempotencyAsync(transaction, request, propertyId, `fnb-order:${request.params.id}:payment`, idempotency, savedPayment);
        return { replay: false, result: savedPayment };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/fnb/orders/:id/refunds", async (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const amount = Math.round(Number(request.body.amountKobo));
    const reason = String(request.body.reason || "").trim();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !reason) return response.status(400).json({ error: "Refund amount and reason are required." });
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, `fnb-order:${request.params.id}:refund`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const order = await transaction.getForUpdate("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!order) throw problem("Order not found.", 404);
        const payments = await transaction.all("SELECT * FROM fnb_order_payments WHERE order_id = ? AND property_id = ? AND status = 'paid' ORDER BY created_at DESC, id DESC", [order.id, propertyId]);
        const refundRows = await transaction.all(`
          SELECT original_payment_id, COALESCE(SUM(-amount_kobo), 0) AS refunded_kobo
          FROM fnb_order_payments WHERE order_id = ? AND property_id = ? AND status = 'refunded'
          GROUP BY original_payment_id
        `, [order.id, propertyId]);
        const refundedByPayment = new Map(refundRows.map((row) => [row.original_payment_id, Number(row.refunded_kobo || 0)]));
        let amountRemaining = amount;
        const allocations = [];
        for (const payment of payments) {
          const refundable = Math.max(0, Number(payment.amount_kobo) - Number(refundedByPayment.get(payment.id) || 0));
          const allocated = Math.min(refundable, amountRemaining);
          if (allocated > 0) allocations.push({ payment, amountKobo: allocated });
          amountRemaining -= allocated;
          if (amountRemaining === 0) break;
        }
        if (amountRemaining > 0) throw problem("Refund exceeds the unrefunded receipt and folio balance.", 409);
        const folioAllocations = allocations.filter(({ payment }) => payment.method === "room_charge");
        if (folioAllocations.length) {
          if (!order.booking_id) throw problem("The room-folio payment is missing its booking link.", 409);
          const booking = await transaction.getForUpdate("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [order.booking_id, propertyId]);
          if (!booking) throw problem("The room booking for this folio charge was not found.", 409);
          const invoice = await transaction.getForUpdate("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", [order.booking_id, propertyId]);
          const folioRefund = folioAllocations.reduce((sum, allocation) => sum + allocation.amountKobo, 0);
          if (invoice) await transaction.run("UPDATE invoices SET total_kobo = max(0, total_kobo - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?", [folioRefund, invoice.id]);
          for (const allocation of folioAllocations) {
            const proportion = allocation.amountKobo / Number(order.total_kobo);
            const subtotalRefund = Math.round((Number(order.subtotal_kobo) - Number(order.discount_kobo)) * proportion);
            const discountRefund = Math.round(Number(order.discount_kobo) * proportion);
            const serviceRefund = Math.round(Number(order.service_kobo) * proportion);
            const taxRefund = allocation.amountKobo - subtotalRefund - discountRefund - serviceRefund;
            await transaction.run("UPDATE bookings SET subtotal_kobo = max(0, subtotal_kobo - ?), discount_kobo = max(0, discount_kobo - ?), service_kobo = max(0, service_kobo - ?), vat_kobo = max(0, vat_kobo - ?), total_kobo = max(0, total_kobo - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              [subtotalRefund, discountRefund, serviceRefund, taxRefund, allocation.amountKobo, order.booking_id]);
          }
        }
        const refunds = [];
        for (const allocation of allocations) {
          const refund = {
            id: `FNB-REF-${crypto.randomUUID()}`,
            propertyId,
            orderId: order.id,
            method: "refund",
            amount: -allocation.amountKobo,
            status: "refunded",
            originalPaymentId: allocation.payment.id,
            reference: `FNB-REF-${crypto.randomUUID()}`,
            reason,
          };
          await transaction.run("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, original_payment_id, reference, reason, created_at, updated_at, created_by) VALUES (?, ?, ?, 'refund', ?, 'refunded', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)",
            [refund.id, propertyId, order.id, refund.amount, refund.originalPaymentId, refund.reference, refund.reason, request.user.id]);
          refunds.push(refund);
        }
        const result = { ...refunds[0], amount: -amount, refunds };
        await auditAsync(transaction, propertyId, "fnb_order", order.id, "refunded", order, result, request.user?.id);
        await saveIdempotencyAsync(transaction, request, propertyId, `fnb-order:${request.params.id}:refund`, idempotency, result);
        return { replay: false, result };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/inventory/:id/count", async (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const count = Number(request.body.count);
    const reason = String(request.body.reason || "").trim();
    if (!Number.isFinite(count) || count < 0 || !reason) return response.status(400).json({ error: "Enter a physical count and reason." });
    try {
      const result = await database.withTransaction(async (transaction) => {
        const item = await transaction.getForUpdate("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!item) throw problem("Inventory item not found.", 404);
        const variance = count - item.qty;
        let movement = null;
        if (variance !== 0) {
          if (variance < 0) {
            const batches = await transaction.all(`
              SELECT id, remaining_qty FROM inventory_batches
              WHERE item_id = ? AND property_id = ? AND deleted_at IS NULL AND remaining_qty > 0
              ORDER BY expiry_date DESC, received_at DESC
            `, [item.id, propertyId]);
            const batchTotal = batches.reduce((sum, batch) => sum + Number(batch.remaining_qty), 0);
            let toRemove = Math.max(0, -variance - Math.max(0, item.qty - batchTotal));
            for (const batch of batches) {
              if (toRemove <= 0) break;
              const remove = Math.min(toRemove, batch.remaining_qty);
              await transaction.run("UPDATE inventory_batches SET remaining_qty = remaining_qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [remove, batch.id]);
              toRemove -= remove;
            }
          }
          await transaction.run("UPDATE inventory_items SET qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [count, item.id]);
          const movementId = `COUNT-${crypto.randomUUID()}`;
          await transaction.run("INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, location_id, created_at, updated_at) VALUES (?, ?, ?, 'adjust', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [movementId, propertyId, item.id, variance, `Physical count: ${reason}`, `COUNT-${new Date().toISOString()}`, item.location_id || null]);
          movement = await transaction.get("SELECT * FROM stock_movements WHERE id = ?", [movementId]);
        }
        await auditAsync(transaction, propertyId, "inventory_item", item.id, "physical_count", item, { counted: count, variance, reason }, request.user?.id);
        const updated = await transaction.get("SELECT * FROM inventory_items WHERE id = ?", [item.id]);
        return { item: { id: updated.id, name: updated.name, category: updated.category, unit: updated.unit, quantity: updated.qty, minimum: updated.min_qty, costKobo: updated.cost_kobo, supplierId: updated.supplier_id || "", databaseItem: true }, movement: movement && { id: movement.id, itemId: movement.item_id, type: movement.type, quantity: movement.qty, reason: movement.reason, date: new Date(movement.created_at).toISOString().slice(0, 10), databaseMovement: true }, variance };
      });
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/inventory/:id/minibar", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const { unitId, bookingId = "", quantity, unitPriceKobo = 0, reason = "Minibar consumption" } = request.body;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return response.status(400).json({ error: "Enter a minibar quantity above zero." });
    try {
      const posted = await database.withTransaction(async (transaction) => {
        const idempotency = await readIdempotencyAsync(transaction, request, propertyId, `minibar:${request.params.id}:consume`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const room = await transaction.get("SELECT id FROM units WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [unitId, propertyId]);
        const item = await transaction.getForUpdate("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (!room || !item) throw problem("Choose an active room and inventory item.");
        if (bookingId) {
          const booking = await transaction.getForUpdate("SELECT * FROM bookings WHERE id = ? AND unit_id = ? AND property_id = ? AND status = 'checked_in' AND deleted_at IS NULL", [bookingId, unitId, propertyId]);
          if (!booking) throw problem("Minibar charges require the active booking for this room.", 409);
        }
        await consumeStock(transaction, propertyId, item.id, qty, `MINIBAR-${crypto.randomUUID()}`, reason, item.location_id);
        const movementId = `MINI-${crypto.randomUUID()}`;
        let extraId = null;
        const price = Math.round(Number(unitPriceKobo));
        if (bookingId && price > 0) {
          extraId = `EXTRA-${crypto.randomUUID()}`;
          const chargeTotal = Math.round(qty * price * 1.125);
          await transaction.run("INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'other', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [extraId, propertyId, bookingId, `Minibar: ${item.name}`, qty, price]);
          const invoice = await transaction.getForUpdate("SELECT id FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", [bookingId, propertyId]);
          if (invoice) await transaction.run("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [chargeTotal, invoice.id]);
          await transaction.run("UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, service_kobo = service_kobo + ?, vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [Math.round(qty * price), Math.round(qty * price * 0.05), Math.round(qty * price * 0.075), chargeTotal, bookingId]);
        }
        await transaction.run("INSERT INTO minibar_movements (id, property_id, unit_id, booking_id, item_id, qty, unit_price_kobo, booking_extra_id, movement_type, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'consume', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
          [movementId, propertyId, unitId, bookingId || null, item.id, qty, price, extraId, reason]);
        await auditAsync(transaction, propertyId, "minibar_movement", movementId, "consume", null, { unitId, bookingId, itemId: item.id, quantity: qty, unitPriceKobo: price }, request.user?.id);
        const saved = { id: movementId, itemId: item.id, unitId, bookingId, quantity: qty, unitPriceKobo: price, extraId };
        await saveIdempotencyAsync(transaction, request, propertyId, `minibar:${request.params.id}:consume`, idempotency, saved);
        return { replay: false, result: saved };
      });
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });
}
