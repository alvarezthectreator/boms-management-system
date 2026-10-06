import crypto from "node:crypto";
import { hashPassword } from "./auth-api.js";

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

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function audit(database, propertyId, request, entity, entityId, action, before, after) {
  const userId = request.user?.id || null;
  database.prepare(`
    INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(`AUD-${crypto.randomUUID()}`, propertyId, userId, entity, entityId, action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after));
}

function readWorkspace(database, propertyId) {
  const users = database.prepare(`
    SELECT id, name, email, role, active FROM users
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY name
  `).all(propertyId).map((user) => ({ ...user, active: Boolean(user.active) }));
  const conversations = database.prepare(`
    SELECT conversations.*, guests.full_name
    FROM conversations JOIN guests ON guests.id = conversations.guest_id
    WHERE conversations.property_id = ? AND conversations.deleted_at IS NULL
    ORDER BY conversations.updated_at DESC
  `).all(propertyId).map((conversation) => {
    const messages = database.prepare(`
      SELECT id, sender_type, body, read_at, created_at FROM messages
      WHERE conversation_id = ? AND property_id = ? AND deleted_at IS NULL
      ORDER BY created_at, id
    `).all(conversation.id, propertyId);
    return {
      id: conversation.id,
      guestId: conversation.guest_id,
      bookingId: conversation.booking_id || "",
      unread: messages.filter((message) => message.sender_type === "guest" && !message.read_at).length,
      messages: messages.map((message) => ({
        id: message.id,
        from: message.sender_type,
        text: message.body,
        readAt: message.read_at,
        createdAt: message.created_at,
      })),
      databaseConversation: true,
    };
  });
  const reviews = database.prepare(`
    SELECT id, guest_id, booking_id, rating_overall, comment, reply, created_at
    FROM reviews WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
  `).all(propertyId).map((review) => ({
    id: review.id,
    guestId: review.guest_id,
    bookingId: review.booking_id,
    rating: review.rating_overall,
    comment: review.comment || "",
    reply: review.reply || "",
    createdAt: review.created_at,
    databaseReview: true,
  }));
  const requests = database.prepare(`
    SELECT requests.*, guests.full_name AS guest_name, units.number AS unit_number,
           users.name AS assigned_to_name
    FROM concierge_requests AS requests
    LEFT JOIN guests ON guests.id = requests.guest_id
    LEFT JOIN units ON units.id = requests.unit_id
    LEFT JOIN users ON users.id = requests.assigned_to
    WHERE requests.property_id = ? AND requests.deleted_at IS NULL
    ORDER BY requests.created_at DESC
  `).all(propertyId).map((request) => ({
    id: request.id,
    guestId: request.guest_id || "",
    unitId: request.unit_id || "",
    type: request.type,
    details: request.details,
    status: request.status,
    assignedTo: request.assigned_to_name || request.assigned_to_label || "Unassigned",
    costKobo: request.cost_kobo,
    databaseRequest: true,
  }));
  const settings = Object.fromEntries(database.prepare(`
    SELECT key, value_json FROM property_settings WHERE property_id = ?
  `).all(propertyId).map((entry) => [entry.key, parseJson(entry.value_json)]));
  const dailyClosings = database.prepare(`
    SELECT daily_closings.*, users.name AS closed_by_name
    FROM daily_closings LEFT JOIN users ON users.id = daily_closings.closed_by
    WHERE daily_closings.property_id = ? ORDER BY daily_closings.close_date DESC
  `).all(propertyId).map((closing) => ({
    id: `CLOSE-${closing.close_date}`,
    date: closing.close_date,
    expected: parseJson(closing.expected_json, {}),
    counted: parseJson(closing.counted_json, {}),
    differenceKobo: closing.difference_kobo,
    note: closing.note,
    closedBy: closing.closed_by_name || closing.closed_by || "Staff",
    closedAt: closing.closed_at,
    databaseClosing: true,
  }));
  const auditLogs = database.prepare(`
    SELECT audit_logs.*, users.name AS user_name, users.role AS user_role
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    WHERE audit_logs.property_id = ? ORDER BY audit_logs.created_at DESC LIMIT 500
  `).all(propertyId).map((entry) => ({
    id: entry.id,
    entity: entry.entity,
    entityId: entry.entity_id,
    action: entry.action,
    oldValue: parseJson(entry.old_json),
    newValue: parseJson(entry.new_json),
    user: entry.user_name || entry.user_role || "System",
    at: entry.created_at,
  }));
  return { users, conversations, reviews, requests, settings, dailyClosings, auditLogs };
}

export function registerWorkspaceRoutes(app, database, propertyId) {
  const requestColumns = database.pragma("table_info(concierge_requests)");
  if (!requestColumns.some((column) => column.name === "assigned_to_label")) {
    database.exec("ALTER TABLE concierge_requests ADD COLUMN assigned_to_label TEXT");
  }

  app.post("/api/workspace/bootstrap", (request, response) => {
    try {
      const seed = database.transaction(() => {
        const timestamp = new Date().toISOString();
        const insertUser = database.prepare(`
          INSERT OR IGNORE INTO users (id, property_id, name, email, role, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const user of request.body.users || []) {
          if (!["worker", "manager", "ceo"].includes(user.role) || !user.id || !user.email) continue;
          insertUser.run(user.id, propertyId, user.name, user.email, user.role, user.active ? 1 : 0, timestamp, timestamp);
        }
        const insertConversation = database.prepare(`
          INSERT OR IGNORE INTO conversations (id, property_id, guest_id, booking_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertMessage = database.prepare(`
          INSERT OR IGNORE INTO messages (id, property_id, conversation_id, guest_id, booking_id, sender_type, body, read_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const conversation of request.body.conversations || []) {
          const guest = database.prepare("SELECT id FROM guests WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(conversation.guestId, propertyId);
          if (!guest) continue;
          const booking = database.prepare("SELECT id FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(conversation.bookingId, propertyId);
          insertConversation.run(conversation.id, propertyId, guest.id, booking?.id || null, timestamp, timestamp);
          (conversation.messages || []).forEach((message, index) => {
            const messageId = `${conversation.id}-${index + 1}`;
            const readAt = message.from === "guest" && index < (conversation.messages.length - Number(conversation.unread || 0)) ? timestamp : null;
            insertMessage.run(messageId, propertyId, conversation.id, guest.id, booking?.id || null,
              message.from === "staff" ? "staff" : "guest", message.text, readAt, timestamp, timestamp);
          });
        }
        const insertRequest = database.prepare(`
          INSERT OR IGNORE INTO concierge_requests (
            id, property_id, booking_id, unit_id, guest_id, type, details, cost_kobo,
            status, assigned_to_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const service of request.body.requests || []) {
          const guest = database.prepare("SELECT id FROM guests WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(service.guestId, propertyId);
          const unit = database.prepare("SELECT id FROM units WHERE (id = ? OR number = ?) AND property_id = ? AND deleted_at IS NULL").get(service.unitId, service.unitNumber || service.unitId, propertyId);
          if (!guest || !unit) continue;
          const activeBooking = unit && database.prepare(`
            SELECT id FROM bookings WHERE guest_id = ? AND unit_id = ? AND property_id = ?
              AND status = 'checked_in' AND deleted_at IS NULL LIMIT 1
          `).get(guest.id, unit.id, propertyId);
          const validBooking = activeBooking || null;
          insertRequest.run(service.id, propertyId, validBooking?.id || null, unit?.id || null, guest.id,
            service.type, service.details || "", Math.max(0, Math.round(Number(service.costKobo || 0))),
            ["open", "pending", "done", "cancelled"].includes(service.status) ? service.status : "open",
            service.assignedTo || "Unassigned", timestamp, timestamp);
        }
        for (const review of request.body.reviews || []) {
          const booking = database.prepare("SELECT id, guest_id FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(review.bookingId, propertyId);
          if (!booking || booking.guest_id !== review.guestId) continue;
          database.prepare(`
            INSERT OR IGNORE INTO reviews (id, property_id, booking_id, guest_id, rating_overall, comment, reply, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(review.id, propertyId, booking.id, booking.guest_id, review.rating, review.comment || "", review.reply || "", timestamp, timestamp);
        }
        const defaults = { checkInTime: "14:00", checkOutTime: "12:00", servicePercent: 0, vatPercent: 0, cancellationHours: 48, currency: "NGN" };
        for (const [key, value] of Object.entries({ ...defaults, ...(request.body.settings || {}) })) {
          database.prepare(`
            INSERT OR IGNORE INTO property_settings (property_id, key, value_json, updated_at)
            VALUES (?, ?, ?, ?)
          `).run(propertyId, key, JSON.stringify(value), timestamp);
        }
        for (const closing of request.body.dailyClosings || []) {
          const closedBy = database.prepare("SELECT id FROM users WHERE property_id = ? AND name = ? AND deleted_at IS NULL").get(propertyId, closing.closedBy);
          database.prepare(`
            INSERT OR IGNORE INTO daily_closings (
              property_id, close_date, expected_json, counted_json, difference_kobo, note, closed_by, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(propertyId, closing.date, JSON.stringify(closing.expected || {}), JSON.stringify(closing.counted || {}),
            Number(closing.differenceKobo || 0), closing.note || "", closedBy?.id || null, closing.closedAt || timestamp);
        }
      });
      seed.immediate();
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/workspace", (_request, response) => response.json(readWorkspace(database, propertyId)));

  app.post("/api/conversations/:id/messages", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const body = String(request.body.body || "").trim();
    if (!body) return response.status(400).json({ error: "Message cannot be empty." });
    const conversation = database.prepare("SELECT * FROM conversations WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!conversation) return response.status(404).json({ error: "Conversation not found." });
    const id = `MSG-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    database.prepare(`
      INSERT INTO messages (id, property_id, conversation_id, guest_id, booking_id, sender_type, sender_id, body, read_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?)
    `).run(id, propertyId, conversation.id, conversation.guest_id, conversation.booking_id,
      request.user.id, body, timestamp, timestamp, timestamp);
    database.prepare("UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = 'guest' AND read_at IS NULL").run(timestamp, conversation.id);
    database.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(timestamp, conversation.id);
    audit(database, propertyId, request, "message", id, "sent", null, { conversationId: conversation.id, body });
    response.status(201).json({ id, from: "staff", text: body, createdAt: timestamp });
  });

  app.patch("/api/conversations/:id/read", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const timestamp = new Date().toISOString();
    const result = database.prepare(`
      UPDATE messages SET read_at = ?, updated_at = ?
      WHERE conversation_id = ? AND property_id = ? AND sender_type = 'guest' AND read_at IS NULL
    `).run(timestamp, timestamp, request.params.id, propertyId);
    response.json({ updated: result.changes });
  });

  app.patch("/api/reviews/:id/reply", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const reply = String(request.body.reply || "").trim();
    if (!reply) return response.status(400).json({ error: "Enter a reply." });
    const old = database.prepare("SELECT * FROM reviews WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!old) return response.status(404).json({ error: "Review not found." });
    database.prepare("UPDATE reviews SET reply = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(reply, old.id);
    const updated = database.prepare("SELECT reply FROM reviews WHERE id = ?").get(old.id);
    audit(database, propertyId, request, "review", old.id, "replied", old, updated);
    response.json({ id: old.id, reply });
  });

  app.post("/api/concierge", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const { guestId, unitId, type } = request.body;
    const details = String(request.body.details || "").trim();
    const costKobo = Math.round(Number(request.body.costKobo || 0));
    const guest = database.prepare("SELECT id FROM guests WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(guestId, propertyId);
    const unit = database.prepare("SELECT id FROM units WHERE (id = ? OR number = ?) AND property_id = ? AND deleted_at IS NULL").get(unitId, unitId, propertyId);
    if (!guest || !unit || !String(type || "").trim() || !details || !Number.isSafeInteger(costKobo) || costKobo < 0) {
      return response.status(400).json({ error: "Choose a guest and room, and enter a valid request and charge." });
    }
    const id = `CON-${crypto.randomUUID()}`;
    try {
      const create = database.transaction(() => {
        const booking = database.prepare(`
          SELECT * FROM bookings WHERE guest_id = ? AND unit_id = ? AND property_id = ?
            AND status = 'checked_in' AND deleted_at IS NULL LIMIT 1
        `).get(guest.id, unit.id, propertyId);
        const bookingId = booking?.id || null;
        const assignedTo = String(request.body.assignedTo || "Unassigned");
        const user = database.prepare("SELECT id, name FROM users WHERE property_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL").get(propertyId, assignedTo);
        database.prepare(`
          INSERT INTO concierge_requests (
            id, property_id, booking_id, unit_id, guest_id, type, details, cost_kobo,
            status, assigned_to, assigned_to_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(id, propertyId, bookingId, unit.id, guest.id, String(type).trim(), details, costKobo,
          user?.id || null, user ? null : assignedTo);
        const saved = { id, guestId: guest.id, unitId: unit.id, type: String(type).trim(), details, status: "open", assignedTo, costKobo, databaseRequest: true };
        audit(database, propertyId, request, "concierge_request", id, "created", null, saved);
        return saved;
      });
      response.status(201).json(create.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/concierge/:id/status", (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const { status } = request.body;
    if (!["open", "pending", "done", "cancelled"].includes(status)) return response.status(400).json({ error: "Invalid request status." });
    const old = database.prepare("SELECT * FROM concierge_requests WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!old) return response.status(404).json({ error: "Request not found." });
    const transitions = { open: ["pending", "cancelled"], pending: ["open", "done", "cancelled"], done: [], cancelled: [] };
    if (!transitions[old.status]?.includes(status)) return response.status(409).json({ error: `Cannot move a request from ${old.status} to ${status}.` });
    try {
      const update = database.transaction(() => {
        if (status === "done" && old.cost_kobo > 0) {
          if (!old.booking_id) throw fail("No active booking was linked to this request, so its charge cannot be posted.", 409);
          const booking = database.prepare("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND status IN ('checked_in', 'checked_out') AND deleted_at IS NULL").get(old.booking_id, propertyId);
          if (!booking) throw fail("The linked booking cannot accept a concierge charge.", 409);
          const invoice = database.prepare("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1").get(booking.id, propertyId);
          if (!invoice) throw fail("The booking has no invoice to charge.", 409);
          const settings = Object.fromEntries(database.prepare("SELECT key, value_json FROM property_settings WHERE property_id = ?").all(propertyId).map((entry) => [entry.key, parseJson(entry.value_json)]));
          const serviceKobo = Math.round(old.cost_kobo * Number(settings.servicePercent ?? 0) / 100);
          const vatKobo = Math.round(old.cost_kobo * Number(settings.vatPercent ?? 0) / 100);
          const totalKobo = old.cost_kobo + serviceKobo + vatKobo;
          database.prepare(`
            INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, 'concierge', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(`EXTRA-${crypto.randomUUID()}`, propertyId, booking.id, `Concierge: ${old.type}`, old.cost_kobo);
          database.prepare("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(totalKobo, invoice.id);
          database.prepare(`
            UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, service_kobo = service_kobo + ?,
              vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(old.cost_kobo, serviceKobo, vatKobo, totalKobo, booking.id);
        }
        database.prepare("UPDATE concierge_requests SET status = ?, completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(status, status, old.id);
        const updated = { id: old.id, status };
        audit(database, propertyId, request, "concierge_request", old.id, status, old, updated);
        return updated;
      });
      response.json(update.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/users", (request, response) => {
    if (!requireRole(request, response, ["ceo"])) return;
    const name = String(request.body.name || "").trim();
    const email = String(request.body.email || "").trim().toLowerCase();
    const role = request.body.role;
    const password = String(request.body.password || "");
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["worker", "manager", "ceo"].includes(role) || password.length < 12) {
      return response.status(400).json({ error: "Enter a name, valid email, role, and password of at least 12 characters." });
    }
    const id = `USR-${crypto.randomUUID()}`;
    try {
      database.prepare("INSERT INTO users (id, property_id, name, email, role, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        .run(id, propertyId, name, email, role, hashPassword(password));
      const saved = { id, name, email, role, active: true };
      audit(database, propertyId, request, "user", id, "created", null, saved);
      response.status(201).json(saved);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "A team member already uses that email." });
      sendError(response, error);
    }
  });

  app.patch("/api/users/:id/active", (request, response) => {
    if (!requireRole(request, response, ["ceo"])) return;
    const active = request.body.active ? 1 : 0;
    const old = database.prepare("SELECT id, name, email, role, active FROM users WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!old) return response.status(404).json({ error: "Team member not found." });
    if (request.user.id === old.id && !active) return response.status(409).json({ error: "You cannot deactivate the active account." });
    database.prepare("UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(active, old.id);
    const updated = { ...old, active: Boolean(active) };
    audit(database, propertyId, request, "user", old.id, active ? "activated" : "deactivated", old, updated);
    response.json(updated);
  });

  app.put("/api/users/:id/password", (request, response) => {
    if (!requireRole(request, response, ["ceo", "manager"])) return;
    const password = String(request.body.password || "");
    if (password.length < 12) return response.status(400).json({ error: "Password must be at least 12 characters." });
    const user = database.prepare("SELECT id FROM users WHERE id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
    if (!user) return response.status(404).json({ error: "Team member not found." });
    database.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(hashPassword(password), user.id);
    database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(user.id);
    audit(database, propertyId, request, "user", user.id, "password_reset", null, { passwordChanged: true });
    response.json({ id: user.id, passwordUpdated: true });
  });

  app.put("/api/settings", (request, response) => {
    if (!requireRole(request, response, ["ceo"])) return;
    const settings = request.body;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.checkInTime || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.checkOutTime || "") ||
        !Number.isFinite(Number(settings.servicePercent)) || Number(settings.servicePercent) < 0 || Number(settings.servicePercent) > 100 ||
        !Number.isFinite(Number(settings.vatPercent)) || Number(settings.vatPercent) < 0 || Number(settings.vatPercent) > 100) {
      return response.status(400).json({ error: "Enter valid check-in/out times and tax percentages." });
    }
    const before = Object.fromEntries(database.prepare("SELECT key, value_json FROM property_settings WHERE property_id = ?").all(propertyId).map((row) => [row.key, parseJson(row.value_json)]));
    const timestamp = new Date().toISOString();
    const user = request.user;
    const save = database.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        database.prepare(`
          INSERT INTO property_settings (property_id, key, value_json, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(property_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by
        `).run(propertyId, key, JSON.stringify(value), timestamp, user.id);
      }
      audit(database, propertyId, request, "settings", propertyId, "updated", before, settings);
    });
    save.immediate();
    response.json(settings);
  });

  app.post("/api/daily-closings", (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const { date, counted, note = "" } = request.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !counted) {
      return response.status(400).json({ error: "Enter a closing date and counted totals." });
    }
    const methods = ["cash", "transfer", "card"];
    const expected = Object.fromEntries(methods.map((method) => {
      const hotelReceipts = database.prepare(`
        SELECT COALESCE(sum(amount_kobo), 0) AS amount FROM payments
        WHERE property_id = ? AND method = ? AND status IN ('paid', 'part_refunded', 'refunded')
          AND amount_kobo > 0 AND date(paid_at) = ? AND deleted_at IS NULL
      `).get(propertyId, method, date).amount;
      const hotelRefunds = database.prepare(`
        SELECT COALESCE(sum(refund.amount_kobo), 0) AS amount
        FROM payments AS refund JOIN payments AS original ON original.id = refund.original_payment_id
        WHERE refund.property_id = ? AND refund.method = 'refund' AND refund.status = 'refunded'
          AND original.method = ? AND date(refund.paid_at) = ? AND refund.deleted_at IS NULL
      `).get(propertyId, method, date).amount;
      const fnbReceipts = database.prepare(`
        SELECT COALESCE(sum(amount_kobo), 0) AS amount FROM fnb_order_payments
        WHERE property_id = ? AND method = ? AND status = 'paid' AND amount_kobo > 0 AND date(created_at) = ?
      `).get(propertyId, method, date).amount;
      const fnbRefunds = database.prepare(`
        SELECT COALESCE(sum(refund.amount_kobo), 0) AS amount
        FROM fnb_order_payments AS refund
        JOIN fnb_order_payments AS original ON original.id = refund.original_payment_id
        WHERE refund.property_id = ? AND refund.method = 'refund' AND refund.status = 'refunded'
          AND original.method = ? AND date(refund.created_at) = ?
      `).get(propertyId, method, date).amount;
      return [method, hotelReceipts + hotelRefunds + fnbReceipts + fnbRefunds];
    }));
    const validCounted = Object.fromEntries(methods.map((method) => [method, Math.round(Number(counted[method] || 0))]));
    if (Object.values(validCounted).some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
      return response.status(400).json({ error: "Closing totals must be non-negative whole kobo amounts." });
    }
    const differenceKobo = methods.reduce((sum, method) => sum + validCounted[method] - expected[method], 0);
    if (differenceKobo !== 0 && !String(note || "").trim()) return response.status(400).json({ error: "Add a note explaining the reconciliation difference." });
    const closedBy = request.user.name;
    const timestamp = new Date().toISOString();
    const id = `CLOSE-${date}`;
    const user = database.prepare("SELECT id FROM users WHERE property_id = ? AND name = ? AND active = 1 AND deleted_at IS NULL").get(propertyId, closedBy);
    try {
      database.prepare(`
        INSERT INTO daily_closings (property_id, close_date, expected_json, counted_json, difference_kobo, note, closed_by, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(propertyId, date, JSON.stringify(expected), JSON.stringify(validCounted), differenceKobo, String(note || "Balanced").trim() || "Balanced", request.user.id, timestamp);
      const saved = { id, date, expected, counted: validCounted, differenceKobo, note: String(note || "Balanced").trim() || "Balanced", closedBy, closedAt: timestamp, databaseClosing: true };
      audit(database, propertyId, request, "daily_close", id, "closed", null, saved);
      response.status(201).json(saved);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "This day has already been closed." });
      sendError(response, error);
    }
  });
}