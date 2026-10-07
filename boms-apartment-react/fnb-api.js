import crypto from "node:crypto";
import { syncLowStockNotifications } from "./inventory-alerts.js";
import { readIdempotency, saveIdempotency } from "./idempotency.js";

const managementRoles = ["manager", "ceo"];

function problem(message, status = 400) {
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

function audit(database, propertyId, entity, entityId, action, before, after, userId = null) {
  database.prepare(`
    INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(`AUD-${crypto.randomUUID()}`, propertyId, userId, entity, entityId, action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after));
}

function menuItemHasSufficientStock(database, propertyId, itemId) {
  const required = database.prepare(`
    SELECT recipe.inventory_item_id, SUM(recipe.qty) AS needed_qty, inventory_items.qty AS on_hand
    FROM menu_recipe_lines AS recipe
    JOIN inventory_items ON inventory_items.id = recipe.inventory_item_id
    WHERE recipe.property_id = ? AND recipe.menu_item_id = ? AND recipe.deleted_at IS NULL
      AND recipe.modifier_id IS NULL
    GROUP BY recipe.inventory_item_id, inventory_items.qty
  `).all(propertyId, itemId);

  if (!required.length) return false;
  return required.every((line) => Number(line.on_hand || 0) >= Number(line.needed_qty || 0));
}

function mapMenuItem(item, recipeLines, modifiers, database, propertyId) {
  const baseRecipe = recipeLines.filter((line) => !line.modifier_id && line.menu_item_id === item.id);
  const hasRecipe = baseRecipe.length > 0;
  const manualAvailable = Boolean(item.available);
  const stockAvailable = hasRecipe ? menuItemHasSufficientStock(database, propertyId, item.id) : false;
  return {
    id: item.id,
    categoryId: item.category_id,
    category: item.category_name,
    name: item.name,
    description: item.description || "",
    priceKobo: item.price_kobo,
    station: item.station,
    available: manualAvailable && stockAvailable,
    recipe: baseRecipe.map((line) => ({
      id: line.inventory_item_id,
      name: line.inventory_name,
      quantity: line.qty,
      unit: line.unit,
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

function readFnb(database, propertyId) {
  const categories = database.prepare(`
    SELECT * FROM menu_categories WHERE property_id = ? AND active = 1 ORDER BY name
  `).all(propertyId).map((category) => ({
    id: category.id,
    name: category.name,
    station: category.station,
  }));
  const recipeLines = database.prepare(`
    SELECT recipe.*, inventory_items.name AS inventory_name, inventory_items.unit
    FROM menu_recipe_lines AS recipe
    JOIN inventory_items ON inventory_items.id = recipe.inventory_item_id
    WHERE recipe.property_id = ? AND recipe.deleted_at IS NULL
      AND inventory_items.deleted_at IS NULL
  `).all(propertyId);
  const modifiers = database.prepare(`
    SELECT * FROM menu_modifiers WHERE property_id = ? AND active = 1 AND deleted_at IS NULL
  `).all(propertyId);
  const items = database.prepare(`
    SELECT menu_items.*, menu_categories.name AS category_name
    FROM menu_items JOIN menu_categories ON menu_categories.id = menu_items.category_id
    WHERE menu_items.property_id = ? AND menu_items.deleted_at IS NULL
      AND menu_categories.active = 1
    ORDER BY menu_categories.name, menu_items.name
  `).all(propertyId).map((item) => mapMenuItem(item, recipeLines, modifiers, database, propertyId));
  const orders = database.prepare(`
    SELECT * FROM fnb_orders WHERE property_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 200
  `).all(propertyId).map((order) => {
    const lines = database.prepare(`
      SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL
      ORDER BY created_at
    `).all(order.id, propertyId).map((line) => ({
      id: line.id,
      menuItemId: line.menu_item_id,
      name: line.item_name,
      station: line.station,
      quantity: line.qty,
      unitPriceKobo: line.unit_price_kobo,
      modifiers: JSON.parse(line.modifiers_json || "[]"),
      status: line.item_status,
    }));
    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      source: order.source,
      unitId: order.room_unit_id || "",
      bookingId: order.booking_id || "",
      guestName: order.guest_name || "",
      paymentMethod: order.payment_method || "",
      subtotalKobo: order.subtotal_kobo,
      discountKobo: order.discount_kobo,
      taxKobo: order.tax_kobo,
      serviceKobo: order.service_kobo,
      totalKobo: order.total_kobo,
      notes: order.notes || "",
      createdAt: order.created_at,
      items: lines,
      databaseOrder: true,
    };
  });
  const batches = database.prepare(`
    SELECT batches.*, inventory_items.name AS item_name, inventory_items.unit
    FROM inventory_batches AS batches JOIN inventory_items ON inventory_items.id = batches.item_id
    WHERE batches.property_id = ? AND batches.deleted_at IS NULL
    ORDER BY batches.expiry_date, batches.received_at
  `).all(propertyId).map((batch) => ({
    id: batch.id,
    itemId: batch.item_id,
    itemName: batch.item_name,
    unit: batch.unit,
    batchCode: batch.batch_code || "",
    receivedQuantity: batch.received_qty,
    remainingQuantity: batch.remaining_qty,
    unitCostKobo: batch.unit_cost_kobo,
    receivedAt: batch.received_at,
    expiryDate: batch.expiry_date || "",
    databaseBatch: true,
  }));
  const minibarMovements = database.prepare(`
    SELECT minibar_movements.*, units.number AS room_number, inventory_items.name AS item_name
    FROM minibar_movements
    JOIN units ON units.id = minibar_movements.unit_id
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
  const payments = database.prepare(`
    SELECT id, order_id, method, amount_kobo, status, original_payment_id, reference, reason, created_at
    FROM fnb_order_payments WHERE property_id = ? ORDER BY created_at DESC
  `).all(propertyId).map((payment) => ({
    id: payment.id,
    orderId: payment.order_id,
    method: payment.method,
    amountKobo: payment.amount_kobo,
    status: payment.status,
    originalPaymentId: payment.original_payment_id || "",
    reference: payment.reference || "",
    reason: payment.reason || "",
    createdAt: payment.created_at,
    databasePayment: true,
  }));
  return { categories, menuItems: items, orders, payments, batches, minibarMovements };
}

function consumeStock(database, propertyId, itemId, quantity, reference, reason) {
  const item = database.prepare(`
    SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL
  `).get(itemId, propertyId);
  if (!item) throw problem("A recipe refers to an unavailable stock item.", 409);
  if (item.qty < quantity) throw problem(`Not enough ${item.name} in stock.`, 409);
  const totalBatchOnHand = database.prepare(`
    SELECT COALESCE(sum(remaining_qty), 0) AS qty FROM inventory_batches
    WHERE item_id = ? AND property_id = ? AND deleted_at IS NULL
  `).get(itemId, propertyId).qty;
  const unbatched = Math.max(0, item.qty - totalBatchOnHand);
  let remaining = quantity;
  const batches = database.prepare(`
    SELECT * FROM inventory_batches
    WHERE item_id = ? AND property_id = ? AND deleted_at IS NULL
      AND remaining_qty > 0 AND (expiry_date IS NULL OR expiry_date >= date('now'))
    ORDER BY expiry_date IS NULL, expiry_date, received_at
  `).all(itemId, propertyId);
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.remaining_qty);
    database.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(take, batch.id);
    remaining -= take;
  }
  if (remaining > unbatched) throw problem(`Not enough unexpired ${item.name} batches in stock.`, 409);
  const movementId = `MOV-${crypto.randomUUID()}`;
  database.prepare(`
    INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, created_at, updated_at)
    VALUES (?, ?, ?, 'out', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(movementId, propertyId, itemId, quantity, reason, reference);
  database.prepare("UPDATE inventory_items SET qty = qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(quantity, itemId);
  syncLowStockNotifications(database, propertyId);
}

function readChargePercent(database, propertyId, key) {
  const row = database.prepare("SELECT value_json FROM property_settings WHERE property_id = ? AND key = ?").get(propertyId, key);
  const percent = Number(row ? JSON.parse(row.value_json) : 0);
  return Number.isFinite(percent) && percent >= 0 ? percent : 0;
}

export function registerFnbRoutes(app, database, propertyId) {
  app.get("/api/fnb", (_request, response) => {
    response.json(readFnb(database, propertyId));
  });

  app.post("/api/fnb/menu-items", (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const { name, category, station } = request.body;
    const priceKobo = Math.round(Number(request.body.priceKobo));
    const recipe = Array.isArray(request.body.recipe) ? request.body.recipe : [];
    const modifiers = Array.isArray(request.body.modifiers) ? request.body.modifiers : [];
    if (!String(name || "").trim() || !String(category || "").trim() || !["kitchen", "bar"].includes(station) || !Number.isSafeInteger(priceKobo) || priceKobo < 0 || !recipe.length) {
      return response.status(400).json({ error: "Menu name, category, station, price, and at least one recipe ingredient are required." });
    }
    const itemId = `MENU-${crypto.randomUUID()}`;
    try {
      const transaction = database.transaction(() => {
        let categoryRow = database.prepare("SELECT * FROM menu_categories WHERE property_id = ? AND lower(name) = lower(?)").get(propertyId, category.trim());
        if (!categoryRow) {
          const categoryId = `CAT-${crypto.randomUUID()}`;
          database.prepare("INSERT INTO menu_categories (id, property_id, name, station, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
            .run(categoryId, propertyId, category.trim(), station);
          categoryRow = database.prepare("SELECT * FROM menu_categories WHERE id = ?").get(categoryId);
        }
        database.prepare("INSERT INTO menu_items (id, property_id, category_id, name, description, price_kobo, station, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
          .run(itemId, propertyId, categoryRow.id, name.trim(), request.body.description || null, priceKobo, station);
        const insertRecipe = database.prepare("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, modifier_id, qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?)");
        for (const line of recipe) {
          const quantity = Number(line.quantity);
          const stock = database.prepare("SELECT id, unit FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(line.inventoryItemId, propertyId);
          if (!stock || !Number.isFinite(quantity) || quantity <= 0) throw problem("Choose valid stock items and recipe quantities.");
          insertRecipe.run(`RECIPE-${crypto.randomUUID()}`, propertyId, itemId, stock.id, null, quantity, stock.unit);
        }
        for (const modifier of modifiers) {
          const modifierId = `MOD-${crypto.randomUUID()}`;
          const priceDelta = Math.round(Number(modifier.priceDeltaKobo || 0));
          if (!String(modifier.name || "").trim() || !Number.isSafeInteger(priceDelta)) throw problem("Modifier names and price adjustments must be valid.");
          database.prepare("INSERT INTO menu_modifiers (id, property_id, menu_item_id, name, price_delta_kobo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
            .run(modifierId, propertyId, itemId, modifier.name.trim(), priceDelta);
          for (const line of modifier.recipe || []) {
            const quantity = Number(line.quantity);
            const stock = database.prepare("SELECT id, unit FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(line.inventoryItemId, propertyId);
            if (!stock || !Number.isFinite(quantity) || quantity <= 0) throw problem("Modifier recipe quantities must be valid.");
            insertRecipe.run(`RECIPE-${crypto.randomUUID()}`, propertyId, itemId, stock.id, modifierId, quantity, stock.unit);
          }
        }
        const saved = readFnb(database, propertyId).menuItems.find((item) => item.id === itemId);
        audit(database, propertyId, "menu_item", itemId, "created", null, saved, request.user?.id);
        return saved;
      });
      response.status(201).json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/menu-items/:id", (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    try {
      const transaction = database.transaction(() => {
        const item = database.prepare("SELECT menu_items.*, menu_categories.name AS category_name FROM menu_items JOIN menu_categories ON menu_categories.id = menu_items.category_id WHERE menu_items.id = ? AND menu_items.property_id = ? AND menu_items.deleted_at IS NULL AND menu_categories.active = 1").get(request.params.id, propertyId);
        if (!item) throw problem("Menu item not found.", 404);
        const name = typeof request.body.name === "string" ? request.body.name.trim() : item.name;
        const category = typeof request.body.category === "string" ? request.body.category.trim() : item.category_name;
        const station = ["kitchen", "bar"].includes(request.body.station) ? request.body.station : item.station;
        const description = typeof request.body.description === "string" ? request.body.description : item.description || "";
        const priceKobo = Number.isFinite(Number(request.body.priceKobo)) ? Math.round(Number(request.body.priceKobo)) : item.price_kobo;
        const recipe = Array.isArray(request.body.recipe) ? request.body.recipe : null;
        if (!name || !category || !["kitchen", "bar"].includes(station) || !Number.isSafeInteger(priceKobo) || priceKobo < 0) {
          throw problem("Menu name, category, station, and price are required.", 400);
        }
        if (recipe && !recipe.length) throw problem("At least one recipe ingredient is required.", 400);

        let categoryRow = database.prepare("SELECT * FROM menu_categories WHERE property_id = ? AND lower(name) = lower(?)").get(propertyId, category);
        if (!categoryRow) {
          categoryRow = { id: `CAT-${crypto.randomUUID()}` };
          database.prepare("INSERT INTO menu_categories (id, property_id, name, station, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
            .run(categoryRow.id, propertyId, category, station);
        }
        database.prepare("UPDATE menu_items SET name = ?, description = ?, price_kobo = ?, station = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?")
          .run(name, description || null, priceKobo, station, categoryRow.id, request.params.id, propertyId);
        if (recipe) {
          database.prepare("UPDATE menu_recipe_lines SET deleted_at = CURRENT_TIMESTAMP WHERE menu_item_id = ? AND property_id = ? AND deleted_at IS NULL").run(request.params.id, propertyId);
          const insertRecipe = database.prepare("INSERT INTO menu_recipe_lines (id, property_id, menu_item_id, inventory_item_id, modifier_id, qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?)");
          for (const line of recipe) {
            const quantity = Number(line.quantity);
            const stock = database.prepare("SELECT id, unit FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(line.inventoryItemId, propertyId);
            if (!stock || !Number.isFinite(quantity) || quantity <= 0) throw problem("Choose valid stock items and recipe quantities.", 400);
            insertRecipe.run(`RECIPE-${crypto.randomUUID()}`, propertyId, request.params.id, stock.id, null, quantity, stock.unit);
          }
        }
        const saved = readFnb(database, propertyId).menuItems.find((menuItem) => menuItem.id === request.params.id);
        const currentAvailable = saved?.available ?? false;
        database.prepare("UPDATE menu_items SET available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?")
          .run(currentAvailable ? 1 : 0, request.params.id, propertyId);
        audit(database, propertyId, "menu_item", request.params.id, "updated", item, saved, request.user?.id);
        return readFnb(database, propertyId).menuItems.find((menuItem) => menuItem.id === request.params.id);
      });
      response.json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/menu-items/:id/availability", (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const available = request.body.available ? 1 : 0;
    const item = database.prepare("SELECT * FROM menu_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!item) return response.status(404).json({ error: "Menu item not found." });
    if (available && !menuItemHasSufficientStock(database, propertyId, request.params.id)) {
      return response.status(409).json({ error: "This menu item is unavailable because its tracked stock is insufficient." });
    }
    const result = database.prepare("UPDATE menu_items SET available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ? AND deleted_at IS NULL")
      .run(available, request.params.id, propertyId);
    if (!result.changes) return response.status(404).json({ error: "Menu item not found." });
    audit(database, propertyId, "menu_item", request.params.id, available ? "enabled" : "unavailable", null, { available: Boolean(available) }, request.user?.id);
    response.json({ id: request.params.id, available: Boolean(available) });
  });

  app.post("/api/fnb/orders", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const { items, source = "room_service", unitId = "", bookingId = "", guestName = "", paymentMethod = "room_charge" } = request.body;
    if (!Array.isArray(items) || !items.length) return response.status(400).json({ error: "Add at least one menu item." });
    if (!["room_service", "restaurant", "bar", "counter", "poolside", "lounge"].includes(source)) return response.status(400).json({ error: "Select a valid order source." });
    if (!["room_charge", "cash", "card", "transfer"].includes(paymentMethod)) return response.status(400).json({ error: "Select a valid payment method." });
    try {
      const transaction = database.transaction(() => {
        const idempotency = readIdempotency(database, request, propertyId, "fnb-order:create");
        if (idempotency.response) return { replay: true, result: idempotency.response };
        let booking = null;
        if (paymentMethod === "room_charge") {
          booking = database.prepare(`
            SELECT bookings.*, guests.full_name, units.id AS room_id
            FROM bookings JOIN guests ON guests.id = bookings.guest_id
            JOIN units ON units.id = bookings.unit_id
            WHERE bookings.id = ? AND bookings.property_id = ? AND bookings.status = 'checked_in'
              AND bookings.deleted_at IS NULL
          `).get(bookingId, propertyId);
          if (!booking || (unitId && booking.unit_id !== unitId)) throw problem("Room charge requires an active checked-in booking for that room.", 409);
        }
        const itemSnapshots = [];
        let subtotal = 0;
        for (const requestItem of items) {
          const quantity = Number(requestItem.quantity);
          if (!Number.isInteger(quantity) || quantity <= 0) throw problem("Order quantities must be positive whole numbers.");
          const item = database.prepare(`
            SELECT menu_items.*, menu_categories.name AS category_name
            FROM menu_items JOIN menu_categories ON menu_categories.id = menu_items.category_id
            WHERE menu_items.id = ? AND menu_items.property_id = ? AND menu_items.deleted_at IS NULL
          `).get(requestItem.menuItemId, propertyId);
          if (!item) throw problem("A selected menu item is unavailable.", 409);
          const chosenModifiers = [];
          for (const modifierId of requestItem.modifierIds || []) {
            const modifier = database.prepare("SELECT * FROM menu_modifiers WHERE id = ? AND menu_item_id = ? AND active = 1 AND deleted_at IS NULL").get(modifierId, item.id);
            if (!modifier) throw problem("A selected modifier is unavailable.", 409);
            chosenModifiers.push({ id: modifier.id, name: modifier.name, priceDeltaKobo: modifier.price_delta_kobo });
          }
          const unitPrice = item.price_kobo + chosenModifiers.reduce((sum, modifier) => sum + modifier.priceDeltaKobo, 0);
          if (unitPrice < 0) throw problem("Modifier prices cannot reduce an item below zero.");
          const recipe = database.prepare(`
            SELECT inventory_item_id, qty, modifier_id FROM menu_recipe_lines
            WHERE menu_item_id = ? AND property_id = ? AND deleted_at IS NULL
          `).all(item.id, propertyId).filter((line) => !line.modifier_id || chosenModifiers.some((modifier) => modifier.id === line.modifier_id))
            .map((line) => ({ inventoryItemId: line.inventory_item_id, quantity: line.qty * quantity }));
          if (!recipe.length) throw problem(`${item.name} has no recipe. Ask a manager to add ingredients.`, 409);
          const insufficiency = recipe.find((ingredient) => {
            const stock = database.prepare("SELECT qty FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(ingredient.inventoryItemId, propertyId);
            if (!stock) return true;
            return Number(stock.qty) < Number(ingredient.quantity);
          });
          if (insufficiency) throw problem(`Not enough stock for ${item.name}.`, 409);
          itemSnapshots.push({ item, quantity, unitPrice, chosenModifiers, recipe });
          subtotal += unitPrice * quantity;
        }
        const discount = Math.round(Number(request.body.discountKobo || 0));
        if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) throw problem("Discount is invalid or exceeds the order subtotal.");
        const taxable = subtotal - discount;
        const service = Math.round(taxable * readChargePercent(database, propertyId, "servicePercent") / 100);
        const tax = Math.round(taxable * readChargePercent(database, propertyId, "vatPercent") / 100);
        const total = taxable + service + tax;
        const orderId = `FNB-${crypto.randomUUID()}`;
        const orderNumber = `FNB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
        database.prepare(`
          INSERT INTO fnb_orders (
            id, property_id, order_number, status, source, room_unit_id, booking_id,
            guest_name, payment_method, subtotal_kobo, discount_kobo, service_kobo, tax_kobo,
            total_kobo, notes, created_by_label, created_at, updated_at
          ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(orderId, propertyId, orderNumber, source, booking?.unit_id || null, booking?.id || null,
          guestName || booking?.full_name || null, paymentMethod, subtotal, discount, service, tax, total,
          request.body.notes || null, request.user.name);
        const insertLine = database.prepare(`
          INSERT INTO fnb_order_items (
            id, property_id, order_id, menu_item_id, item_name, station, qty,
            unit_price_kobo, modifiers_json, recipe_snapshot_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        for (const snapshot of itemSnapshots) insertLine.run(
          `FNB-LINE-${crypto.randomUUID()}`, propertyId, orderId, snapshot.item.id,
          snapshot.item.name, snapshot.item.station, snapshot.quantity, snapshot.unitPrice,
          JSON.stringify(snapshot.chosenModifiers), JSON.stringify(snapshot.recipe),
        );
        audit(database, propertyId, "fnb_order", orderId, "created", null, { orderNumber, source, totalKobo: total, bookingId: booking?.id || null }, request.user?.id);
        const saved = readFnb(database, propertyId).orders.find((order) => order.id === orderId);
        saveIdempotency(database, request, propertyId, "fnb-order:create", idempotency, saved);
        return { replay: false, result: saved };
      });
      const posted = transaction.immediate();
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/orders/:id", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    try {
      const transaction = database.transaction(() => {
        const order = database.prepare("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!order) throw problem("Order not found.", 404);
        if (order.status === "billed") throw problem("A billed order cannot be edited.", 409);
        const updates = Array.isArray(request.body.items) ? request.body.items : [];
        if (!updates.length) return readFnb(database, propertyId).orders.find((item) => item.id === order.id);

        const orderLines = database.prepare("SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL").all(order.id, propertyId);
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
          const recipe = JSON.parse(line.recipe_snapshot_json || "[]");
          if (delta > 0 && order.status === "accepted") {
            for (const ingredient of recipe) {
              const needed = Number(ingredient.quantity) * delta;
              const stock = database.prepare("SELECT qty FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(ingredient.inventoryItemId, propertyId);
              if (!stock || Number(stock.qty) < needed) throw problem(`Not enough stock for ${line.item_name}.`, 409);
            }
            for (const ingredient of recipe) {
              consumeStock(database, propertyId, ingredient.inventoryItemId, Number(ingredient.quantity) * delta, order.id, `Order update ${order.order_number}`);
            }
          } else if (delta < 0 && order.status === "accepted") {
            for (const ingredient of recipe) {
              const restore = Number(ingredient.quantity) * Math.abs(delta);
              database.prepare("UPDATE inventory_items SET qty = qty + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?")
                .run(restore, ingredient.inventoryItemId, propertyId);
              database.prepare("INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
                .run(`MOV-${crypto.randomUUID()}`, propertyId, ingredient.inventoryItemId, restore, `Order update reversal ${order.order_number}`, order.id);
            }
          }
          database.prepare("UPDATE fnb_order_items SET qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(nextQty, line.id);
          const nextLine = { ...line, qty: nextQty, item_status: line.item_status };
          nextLines.push(nextLine);
          newSubtotal += Number(line.unit_price_kobo) * nextQty;
        }

        const currentOrder = database.prepare("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(order.id, propertyId);
        const subtotal = newSubtotal;
        const discount = Math.max(0, Math.min(Number(currentOrder.discount_kobo || 0), subtotal));
        const taxable = subtotal - discount;
        const service = Math.round(taxable * readChargePercent(database, propertyId, "servicePercent") / 100);
        const tax = Math.round(taxable * readChargePercent(database, propertyId, "vatPercent") / 100);
        const total = taxable + service + tax;
        database.prepare("UPDATE fnb_orders SET subtotal_kobo = ?, discount_kobo = ?, service_kobo = ?, tax_kobo = ?, total_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(subtotal, discount, service, tax, total, order.id);
        audit(database, propertyId, "fnb_order", order.id, "updated", order, { ...order, subtotalKobo: subtotal, totalKobo: total, items: nextLines }, request.user?.id);
        return readFnb(database, propertyId).orders.find((item) => item.id === order.id);
      });
      response.json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/fnb/orders/:id/status", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const status = request.body.status;
    const transitions = {
      new: ["accepted", "cancelled"],
      accepted: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["served", "cancelled"],
      served: ["billed"],
      billed: [],
      cancelled: [],
    };
    try {
      const transaction = database.transaction(() => {
        const order = database.prepare("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!order) throw problem("Order not found.", 404);
        if (!transitions[order.status]?.includes(status)) throw problem(`Cannot move an order from ${order.status} to ${status}.`, 409);
        if (status === "cancelled" && order.status !== "new" && !managementRoles.includes(request.user.role)) throw problem("A manager must cancel an order after acceptance.", 403);
        if (status === "cancelled" && order.status !== "new" && !String(request.body.reason || "").trim()) throw problem("A reason is required when cancelling an accepted order.");
        if (status === "accepted") {
          const lines = database.prepare("SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL").all(order.id, propertyId);
          for (const line of lines) {
            if (line.stock_posted) continue;
            for (const ingredient of JSON.parse(line.recipe_snapshot_json || "[]")) {
              consumeStock(database, propertyId, ingredient.inventoryItemId, ingredient.quantity, order.id, `F&B order ${order.order_number}`);
            }
            database.prepare("UPDATE fnb_order_items SET stock_posted = 1, item_status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .run(line.id);
          }
        }
        if (status === "cancelled") {
          const lines = database.prepare("SELECT * FROM fnb_order_items WHERE order_id = ? AND property_id = ? AND deleted_at IS NULL").all(order.id, propertyId);
          if (order.status === "new") {
            database.prepare("UPDATE fnb_order_items SET item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND property_id = ?")
              .run(order.id, propertyId);
          } else if (["accepted", "preparing", "ready"].includes(order.status)) {
            for (const line of lines) {
              if (!line.stock_posted) continue;
              for (const ingredient of JSON.parse(line.recipe_snapshot_json || "[]")) {
                database.prepare("UPDATE inventory_items SET qty = qty + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?")
                  .run(Number(ingredient.quantity), ingredient.inventoryItemId, propertyId);
                database.prepare("INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, created_at, updated_at) VALUES (?, ?, ?, 'in', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
                  .run(`MOV-${crypto.randomUUID()}`, propertyId, ingredient.inventoryItemId, Number(ingredient.quantity), `Cancelled order reversal ${order.order_number}`, order.id);
              }
              database.prepare("UPDATE fnb_order_items SET stock_posted = 0, item_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .run(line.id);
            }
          }
          database.prepare("UPDATE fnb_orders SET status = 'cancelled', subtotal_kobo = 0, discount_kobo = 0, service_kobo = 0, tax_kobo = 0, total_kobo = 0, billed_at = CASE WHEN billed_at IS NULL THEN billed_at ELSE billed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(order.id);
        }
        if (status === "preparing" || status === "ready" || status === "served") {
          database.prepare("UPDATE fnb_order_items SET item_status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND property_id = ? AND item_status != 'cancelled'")
            .run(status, order.id, propertyId);
        }
        if (status === "billed") {
          if (order.payment_method === "room_charge") {
            const booking = database.prepare("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND status = 'checked_in' AND deleted_at IS NULL").get(order.booking_id, propertyId);
            if (!booking) throw problem("Room-charge booking is no longer checked in.", 409);
            const invoice = database.prepare("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1").get(booking.id, propertyId);
            if (!invoice) throw problem("The booking has no invoice to charge.", 409);
            const extraId = `EXTRA-${crypto.randomUUID()}`;
            database.prepare("INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, 'restaurant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
              .run(extraId, propertyId, booking.id, `Food & beverage order ${order.order_number}`, order.total_kobo);
            database.prepare("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .run(order.total_kobo, invoice.id);
            database.prepare("UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, discount_kobo = discount_kobo + ?, service_kobo = service_kobo + ?, vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .run(order.subtotal_kobo - order.discount_kobo, order.discount_kobo, order.service_kobo, order.tax_kobo, order.total_kobo, booking.id);
            database.prepare("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, reference, created_at, updated_at) VALUES (?, ?, ?, 'room_charge', ?, 'paid', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
              .run(`FNB-PAY-${crypto.randomUUID()}`, propertyId, order.id, order.total_kobo, `ROOM-${order.order_number}`);
          } else {
            const paymentId = `FNB-PAY-${crypto.randomUUID()}`;
            database.prepare("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, reference, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
              .run(paymentId, propertyId, order.id, order.payment_method, order.total_kobo, `POS-${order.order_number}`);
          }
        }
        if (status !== "cancelled") {
          database.prepare("UPDATE fnb_orders SET status = ?, billed_at = CASE WHEN ? = 'billed' THEN CURRENT_TIMESTAMP ELSE billed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(status, status, order.id);
        }
        audit(database, propertyId, "fnb_order", order.id, status, order, { ...order, status }, request.user?.id);
        return readFnb(database, propertyId).orders.find((item) => item.id === order.id);
      });
      response.json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/fnb/orders/:id/refunds", (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const amount = Math.round(Number(request.body.amountKobo));
    const reason = String(request.body.reason || "").trim();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !reason) return response.status(400).json({ error: "Refund amount and reason are required." });
    try {
      const transaction = database.transaction(() => {
        const idempotency = readIdempotency(database, request, propertyId, `fnb-order:${request.params.id}:refund`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const order = database.prepare("SELECT * FROM fnb_orders WHERE id = ? AND property_id = ? AND status = 'billed' AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!order) throw problem("Only billed orders can be refunded.", 409);
        const paid = database.prepare("SELECT COALESCE(sum(amount_kobo), 0) AS amount FROM fnb_order_payments WHERE order_id = ? AND status = 'paid'").get(order.id).amount;
        const refunded = database.prepare("SELECT COALESCE(sum(-amount_kobo), 0) AS amount FROM fnb_order_payments WHERE order_id = ? AND status = 'refunded'").get(order.id).amount;
        if (amount > paid - refunded) throw problem("Refund exceeds the unrefunded order balance.", 409);
        const payment = database.prepare("SELECT * FROM fnb_order_payments WHERE order_id = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1").get(order.id);
        if (payment?.method === "room_charge") {
          const invoice = database.prepare("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1").get(order.booking_id, propertyId);
          if (invoice) database.prepare("UPDATE invoices SET total_kobo = max(0, total_kobo - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(amount, invoice.id);
          const proportion = amount / order.total_kobo;
          const subtotalRefund = Math.round((order.subtotal_kobo - order.discount_kobo) * proportion);
          const discountRefund = Math.round(order.discount_kobo * proportion);
          const serviceRefund = Math.round(order.service_kobo * proportion);
          const taxRefund = Math.round(order.tax_kobo * proportion);
          database.prepare("UPDATE bookings SET subtotal_kobo = max(0, subtotal_kobo - ?), discount_kobo = max(0, discount_kobo - ?), service_kobo = max(0, service_kobo - ?), vat_kobo = max(0, vat_kobo - ?), total_kobo = max(0, total_kobo - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(subtotalRefund, discountRefund, serviceRefund, taxRefund, amount, order.booking_id);
        }
        const refund = {
          id: `FNB-REF-${crypto.randomUUID()}`,
          propertyId,
          orderId: order.id,
          method: "refund",
          amount: -amount,
          status: "refunded",
          originalPaymentId: payment?.id || null,
          reference: `FNB-REF-${crypto.randomUUID()}`,
          reason,
        };
        database.prepare("INSERT INTO fnb_order_payments (id, property_id, order_id, method, amount_kobo, status, original_payment_id, reference, reason, created_at, updated_at) VALUES (?, ?, ?, 'refund', ?, 'refunded', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
          .run(refund.id, propertyId, order.id, refund.amount, refund.originalPaymentId, refund.reference, refund.reason);
        audit(database, propertyId, "fnb_order", order.id, "refunded", order, refund, request.user?.id);
        saveIdempotency(database, request, propertyId, `fnb-order:${request.params.id}:refund`, idempotency, refund);
        return { replay: false, result: refund };
      });
      const posted = transaction.immediate();
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/inventory/:id/count", (request, response) => {
    if (!requireRole(request, response, managementRoles)) return;
    const count = Number(request.body.count);
    const reason = String(request.body.reason || "").trim();
    if (!Number.isFinite(count) || count < 0 || !reason) return response.status(400).json({ error: "Enter a physical count and reason." });
    try {
      const transaction = database.transaction(() => {
        const item = database.prepare("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!item) throw problem("Inventory item not found.", 404);
        const variance = count - item.qty;
        let movement = null;
        if (variance !== 0) {
          if (variance < 0) {
            const batches = database.prepare(`
              SELECT id, remaining_qty FROM inventory_batches
              WHERE item_id = ? AND property_id = ? AND deleted_at IS NULL AND remaining_qty > 0
              ORDER BY expiry_date DESC, received_at DESC
            `).all(item.id, propertyId);
            const batchTotal = batches.reduce((sum, batch) => sum + batch.remaining_qty, 0);
            let toRemove = Math.max(0, -variance - Math.max(0, item.qty - batchTotal));
            for (const batch of batches) {
              if (toRemove <= 0) break;
              const remove = Math.min(toRemove, batch.remaining_qty);
              database.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .run(remove, batch.id);
              toRemove -= remove;
            }
          }
          database.prepare("UPDATE inventory_items SET qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(count, item.id);
          const movementId = `COUNT-${crypto.randomUUID()}`;
          database.prepare("INSERT INTO stock_movements (id, property_id, item_id, type, qty, reason, ref, created_at, updated_at) VALUES (?, ?, ?, 'adjust', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
            .run(movementId, propertyId, item.id, variance, `Physical count: ${reason}`, `COUNT-${new Date().toISOString()}`);
          movement = database.prepare("SELECT * FROM stock_movements WHERE id = ?").get(movementId);
        }
        audit(database, propertyId, "inventory_item", item.id, "physical_count", item, { counted: count, variance, reason }, request.user?.id);
        const updated = database.prepare("SELECT * FROM inventory_items WHERE id = ?").get(item.id);
        return { item: { id: updated.id, name: updated.name, category: updated.category, unit: updated.unit, quantity: updated.qty, minimum: updated.min_qty, costKobo: updated.cost_kobo, supplierId: updated.supplier_id || "", databaseItem: true }, movement: movement && { id: movement.id, itemId: movement.item_id, type: movement.type, quantity: movement.qty, reason: movement.reason, date: movement.created_at.slice(0, 10), databaseMovement: true }, variance };
      });
      response.json(transaction.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/inventory/:id/minibar", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managementRoles])) return;
    const { unitId, bookingId = "", quantity, unitPriceKobo = 0, reason = "Minibar consumption" } = request.body;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return response.status(400).json({ error: "Enter a minibar quantity above zero." });
    try {
      const transaction = database.transaction(() => {
        const idempotency = readIdempotency(database, request, propertyId, `minibar:${request.params.id}:consume`);
        if (idempotency.response) return { replay: true, result: idempotency.response };
        const room = database.prepare("SELECT id FROM units WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(unitId, propertyId);
        const item = database.prepare("SELECT * FROM inventory_items WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (!room || !item) throw problem("Choose an active room and inventory item.");
        if (bookingId) {
          const booking = database.prepare("SELECT * FROM bookings WHERE id = ? AND unit_id = ? AND property_id = ? AND status = 'checked_in' AND deleted_at IS NULL").get(bookingId, unitId, propertyId);
          if (!booking) throw problem("Minibar charges require the active booking for this room.", 409);
        }
        consumeStock(database, propertyId, item.id, qty, `MINIBAR-${crypto.randomUUID()}`, reason);
        const movementId = `MINI-${crypto.randomUUID()}`;
        let extraId = null;
        const price = Math.round(Number(unitPriceKobo));
        if (bookingId && price > 0) {
          extraId = `EXTRA-${crypto.randomUUID()}`;
          const chargeTotal = Math.round(qty * price * 1.125);
          database.prepare("INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'other', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
            .run(extraId, propertyId, bookingId, `Minibar: ${item.name}`, qty, price);
          const invoice = database.prepare("SELECT id FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1").get(bookingId, propertyId);
          if (invoice) database.prepare("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(chargeTotal, invoice.id);
          database.prepare("UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, service_kobo = service_kobo + ?, vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(Math.round(qty * price), Math.round(qty * price * 0.05), Math.round(qty * price * 0.075), chargeTotal, bookingId);
        }
        database.prepare("INSERT INTO minibar_movements (id, property_id, unit_id, booking_id, item_id, qty, unit_price_kobo, booking_extra_id, movement_type, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'consume', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
          .run(movementId, propertyId, unitId, bookingId || null, item.id, qty, price, extraId, reason);
        audit(database, propertyId, "minibar_movement", movementId, "consume", null, { unitId, bookingId, itemId: item.id, quantity: qty, unitPriceKobo: price }, request.user?.id);
        const saved = { id: movementId, itemId: item.id, unitId, bookingId, quantity: qty, unitPriceKobo: price, extraId };
        saveIdempotency(database, request, propertyId, `minibar:${request.params.id}:consume`, idempotency, saved);
        return { replay: false, result: saved };
      });
      const posted = transaction.immediate();
      response.status(posted.replay ? 200 : 201).json(posted.result);
    } catch (error) {
      sendError(response, error);
    }
  });
}
