import crypto from "node:crypto";

export function syncLowStockNotifications(database, propertyId) {
  const lowItems = database.prepare(`
    SELECT id, name, qty, min_qty, unit FROM inventory_items
    WHERE property_id = ? AND deleted_at IS NULL AND qty <= min_qty
  `).all(propertyId);
  const lowItemIds = new Set(lowItems.map((item) => item.id));
  const managers = database.prepare(`
    SELECT id FROM users WHERE property_id = ? AND role IN ('manager', 'ceo')
      AND active = 1 AND deleted_at IS NULL
  `).all(propertyId);
  const existingLowAlerts = database.prepare(`
    SELECT id, type FROM notifications WHERE property_id = ? AND type LIKE 'low_stock:%' AND deleted_at IS NULL
  `).all(propertyId);
  for (const notification of existingLowAlerts) {
    const itemId = notification.type.slice("low_stock:".length);
    if (!lowItemIds.has(itemId)) {
      database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP), deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(notification.id);
    }
  }
  for (const item of lowItems) {
    const type = `low_stock:${item.id}`;
    for (const manager of managers) {
      const exists = database.prepare("SELECT id FROM notifications WHERE property_id = ? AND user_id = ? AND type = ? AND deleted_at IS NULL LIMIT 1")
        .get(propertyId, manager.id, type);
      if (exists) continue;
      const message = `${item.name} is at ${item.qty} ${item.unit}; minimum level is ${item.min_qty} ${item.unit}.`;
      database.prepare(`
        INSERT INTO notifications (id, property_id, user_id, type, title, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(`NOT-${crypto.randomUUID()}`, propertyId, manager.id, type, `Low stock: ${item.name}`, message);
    }
  }
}