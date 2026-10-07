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

async function audit(database, propertyId, request, entity, entityId, action, before, after) {
  const userId = request.user?.id || null;
  await database.run(`
    INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [`AUD-${crypto.randomUUID()}`, propertyId, userId, entity, entityId, action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]);
}

async function readWorkspace(database, propertyId, includeAuditLogs = false) {
  const users = (await database.all(`
    SELECT id, name, email, role, active FROM users
    WHERE property_id = ? AND deleted_at IS NULL ORDER BY name
  `, [propertyId])).map((user) => ({ ...user, active: Boolean(user.active) }));
  const conversationRows = await database.all(`
    SELECT conversations.*, guests.full_name
    FROM conversations JOIN guests ON guests.id = conversations.guest_id
    WHERE conversations.property_id = ? AND conversations.deleted_at IS NULL
    ORDER BY conversations.updated_at DESC
  `, [propertyId]);
  const conversations = await Promise.all(conversationRows.map(async (conversation) => {
    const messages = await database.all(`
      SELECT id, sender_type, body, read_at, created_at FROM messages
      WHERE conversation_id = ? AND property_id = ? AND deleted_at IS NULL
      ORDER BY created_at, id
    `, [conversation.id, propertyId]);
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
  }));
  const reviews = (await database.all(`
    SELECT id, guest_id, booking_id, rating_overall, comment, reply, created_at
    FROM reviews WHERE property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
  `, [propertyId])).map((review) => ({
    id: review.id,
    guestId: review.guest_id,
    bookingId: review.booking_id,
    rating: review.rating_overall,
    comment: review.comment || "",
    reply: review.reply || "",
    createdAt: review.created_at,
    databaseReview: true,
  }));
  const requests = (await database.all(`
    SELECT requests.*, guests.full_name AS guest_name, units.number AS unit_number,
           users.name AS assigned_to_name
    FROM concierge_requests AS requests
    LEFT JOIN guests ON guests.id = requests.guest_id
    LEFT JOIN units ON units.id = requests.unit_id
    LEFT JOIN users ON users.id = requests.assigned_to
    WHERE requests.property_id = ? AND requests.deleted_at IS NULL
    ORDER BY requests.created_at DESC
  `, [propertyId])).map((request) => ({
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
  const settings = Object.fromEntries((await database.all(`
    SELECT key, value_json FROM property_settings WHERE property_id = ?
  `, [propertyId])).map((entry) => [entry.key, parseJson(entry.value_json)]));
  const dailyClosings = (await database.all(`
    SELECT daily_closings.*, users.name AS closed_by_name
    FROM daily_closings LEFT JOIN users ON users.id = daily_closings.closed_by
    WHERE daily_closings.property_id = ? ORDER BY daily_closings.close_date DESC
  `, [propertyId])).map((closing) => ({
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
  const auditLogs = includeAuditLogs ? (await database.all(`
    SELECT audit_logs.*, users.name AS user_name, users.role AS user_role
    FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
    WHERE audit_logs.property_id = ? ORDER BY audit_logs.created_at DESC LIMIT 500
  `, [propertyId])).map((entry) => ({
    id: entry.id,
    entity: entry.entity,
    entityId: entry.entity_id,
    action: entry.action,
    oldValue: parseJson(entry.old_json),
    newValue: parseJson(entry.new_json),
    user: entry.user_name || entry.user_role || "System",
    at: entry.created_at,
  })) : [];
  return { users, conversations, reviews, requests, settings, dailyClosings, auditLogs };
}

export function registerWorkspaceRoutes(app, database, propertyId) {
  app.post("/api/workspace/bootstrap", async (request, response) => {
    try {
      await database.withTransaction(async (transaction) => {
        const timestamp = new Date().toISOString();
        const insertUser = `
          INSERT OR IGNORE INTO users (id, property_id, name, email, role, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        for (const user of request.body.users || []) {
          if (!["worker", "manager", "ceo"].includes(user.role) || !user.id || !user.email) continue;
          await transaction.run(insertUser, [user.id, propertyId, user.name, user.email, user.role, user.active ? 1 : 0, timestamp, timestamp]);
        }
        const insertConversation = `
          INSERT OR IGNORE INTO conversations (id, property_id, guest_id, booking_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertMessage = `
          INSERT OR IGNORE INTO messages (id, property_id, conversation_id, guest_id, booking_id, sender_type, body, read_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        for (const conversation of request.body.conversations || []) {
          const guest = await transaction.get("SELECT id FROM guests WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [conversation.guestId, propertyId]);
          if (!guest) continue;
          const booking = await transaction.get("SELECT id FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [conversation.bookingId, propertyId]);
          await transaction.run(insertConversation, [conversation.id, propertyId, guest.id, booking?.id || null, timestamp, timestamp]);
          for (const [index, message] of (conversation.messages || []).entries()) {
            const messageId = `${conversation.id}-${index + 1}`;
            const readAt = message.from === "guest" && index < (conversation.messages.length - Number(conversation.unread || 0)) ? timestamp : null;
            await transaction.run(insertMessage, [messageId, propertyId, conversation.id, guest.id, booking?.id || null,
              message.from === "staff" ? "staff" : "guest", message.text, readAt, timestamp, timestamp]);
          }
        }
        const insertRequest = `
          INSERT OR IGNORE INTO concierge_requests (
            id, property_id, booking_id, unit_id, guest_id, type, details, cost_kobo,
            status, assigned_to_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        for (const service of request.body.requests || []) {
          const guest = await transaction.get("SELECT id FROM guests WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [service.guestId, propertyId]);
          const unit = await transaction.get("SELECT id FROM units WHERE (id = ? OR number = ?) AND property_id = ? AND deleted_at IS NULL", [service.unitId, service.unitNumber || service.unitId, propertyId]);
          if (!guest || !unit) continue;
          const activeBooking = await transaction.get(`
            SELECT id FROM bookings WHERE guest_id = ? AND unit_id = ? AND property_id = ?
              AND status = 'checked_in' AND deleted_at IS NULL LIMIT 1
          `, [guest.id, unit.id, propertyId]);
          const validBooking = activeBooking || null;
          await transaction.run(insertRequest, [service.id, propertyId, validBooking?.id || null, unit.id, guest.id,
            service.type, service.details || "", Math.max(0, Math.round(Number(service.costKobo || 0))),
            ["open", "pending", "done", "cancelled"].includes(service.status) ? service.status : "open",
            service.assignedTo || "Unassigned", timestamp, timestamp]);
        }
        for (const review of request.body.reviews || []) {
          const booking = await transaction.get("SELECT id, guest_id FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [review.bookingId, propertyId]);
          if (!booking || booking.guest_id !== review.guestId) continue;
          await transaction.run(`
            INSERT OR IGNORE INTO reviews (id, property_id, booking_id, guest_id, rating_overall, comment, reply, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [review.id, propertyId, booking.id, booking.guest_id, review.rating, review.comment || "", review.reply || "", timestamp, timestamp]);
        }
        const defaults = { checkInTime: "14:00", checkOutTime: "12:00", servicePercent: 0, vatPercent: 0, cancellationHours: 48, currency: "NGN" };
        for (const [key, value] of Object.entries({ ...defaults, ...(request.body.settings || {}) })) {
          await transaction.run(`
            INSERT OR IGNORE INTO property_settings (property_id, key, value_json, updated_at)
            VALUES (?, ?, ?, ?)
          `, [propertyId, key, JSON.stringify(value), timestamp]);
        }
        for (const closing of request.body.dailyClosings || []) {
          const closedBy = await transaction.get("SELECT id FROM users WHERE property_id = ? AND name = ? AND deleted_at IS NULL", [propertyId, closing.closedBy]);
          await transaction.run(`
            INSERT OR IGNORE INTO daily_closings (
              property_id, close_date, expected_json, counted_json, difference_kobo, note, closed_by, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [propertyId, closing.date, JSON.stringify(closing.expected || {}), JSON.stringify(closing.counted || {}),
            Number(closing.differenceKobo || 0), closing.note || "", closedBy?.id || null, closing.closedAt || timestamp]);
        }
      });
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/workspace", async (request, response) => response.json(await readWorkspace(database, propertyId, request.user?.role === "ceo")));

  app.post("/api/conversations/:id/messages", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const body = String(request.body.body || "").trim();
    if (!body) return response.status(400).json({ error: "Message cannot be empty." });
    const conversation = await database.get("SELECT * FROM conversations WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!conversation) return response.status(404).json({ error: "Conversation not found." });
    const id = `MSG-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    await database.run(`
      INSERT INTO messages (id, property_id, conversation_id, guest_id, booking_id, sender_type, sender_id, body, read_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?)
    `, [id, propertyId, conversation.id, conversation.guest_id, conversation.booking_id,
      request.user.id, body, timestamp, timestamp, timestamp]);
    await database.run("UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = 'guest' AND read_at IS NULL", [timestamp, conversation.id]);
    await database.run("UPDATE conversations SET updated_at = ? WHERE id = ?", [timestamp, conversation.id]);
    await audit(database, propertyId, request, "message", id, "sent", null, { conversationId: conversation.id, body });
    response.status(201).json({ id, from: "staff", text: body, createdAt: timestamp });
  });

  app.patch("/api/conversations/:id/read", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const timestamp = new Date().toISOString();
    const result = await database.run(`
      UPDATE messages SET read_at = ?, updated_at = ?
      WHERE conversation_id = ? AND property_id = ? AND sender_type = 'guest' AND read_at IS NULL
    `, [timestamp, timestamp, request.params.id, propertyId]);
    response.json({ updated: result.changes });
  });

  app.patch("/api/reviews/:id/reply", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const reply = String(request.body.reply || "").trim();
    if (!reply) return response.status(400).json({ error: "Enter a reply." });
    const old = await database.get("SELECT * FROM reviews WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!old) return response.status(404).json({ error: "Review not found." });
    await database.run("UPDATE reviews SET reply = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reply, old.id]);
    const updated = await database.get("SELECT reply FROM reviews WHERE id = ?", [old.id]);
    await audit(database, propertyId, request, "review", old.id, "replied", old, updated);
    response.json({ id: old.id, reply });
  });

  app.post("/api/concierge", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const { guestId, unitId, type } = request.body;
    const details = String(request.body.details || "").trim();
    const costKobo = Math.round(Number(request.body.costKobo || 0));
    const guest = await database.get("SELECT id FROM guests WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [guestId, propertyId]);
    const unit = await database.get("SELECT id FROM units WHERE (id = ? OR number = ?) AND property_id = ? AND deleted_at IS NULL", [unitId, unitId, propertyId]);
    if (!guest || !unit || !String(type || "").trim() || !details || !Number.isSafeInteger(costKobo) || costKobo < 0) {
      return response.status(400).json({ error: "Choose a guest and room, and enter a valid request and charge." });
    }
    const id = `CON-${crypto.randomUUID()}`;
    try {
      const saved = await database.withTransaction(async (transaction) => {
        const booking = await transaction.get(`
          SELECT * FROM bookings WHERE guest_id = ? AND unit_id = ? AND property_id = ?
            AND status = 'checked_in' AND deleted_at IS NULL LIMIT 1
        `, [guest.id, unit.id, propertyId]);
        const bookingId = booking?.id || null;
        const assignedTo = String(request.body.assignedTo || "Unassigned");
        const user = await transaction.get("SELECT id, name FROM users WHERE property_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL", [propertyId, assignedTo]);
        await transaction.run(`
          INSERT INTO concierge_requests (
            id, property_id, booking_id, unit_id, guest_id, type, details, cost_kobo,
            status, assigned_to, assigned_to_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [id, propertyId, bookingId, unit.id, guest.id, String(type).trim(), details, costKobo,
          user?.id || null, user ? null : assignedTo]);
        const result = { id, guestId: guest.id, unitId: unit.id, type: String(type).trim(), details, status: "open", assignedTo, costKobo, databaseRequest: true };
        await audit(transaction, propertyId, request, "concierge_request", id, "created", null, result);
        return result;
      });
      response.status(201).json(saved);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch("/api/concierge/:id/status", async (request, response) => {
    if (!requireRole(request, response, ["worker", ...managerRoles])) return;
    const { status } = request.body;
    if (!["open", "pending", "done", "cancelled"].includes(status)) return response.status(400).json({ error: "Invalid request status." });
    const old = await database.get("SELECT * FROM concierge_requests WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!old) return response.status(404).json({ error: "Request not found." });
    const transitions = { open: ["pending", "cancelled"], pending: ["open", "done", "cancelled"], done: [], cancelled: [] };
    if (!transitions[old.status]?.includes(status)) return response.status(409).json({ error: `Cannot move a request from ${old.status} to ${status}.` });
    try {
      const updated = await database.withTransaction(async (transaction) => {
        if (status === "done" && old.cost_kobo > 0) {
          if (!old.booking_id) throw fail("No active booking was linked to this request, so its charge cannot be posted.", 409);
          const booking = await transaction.get("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND status IN ('checked_in', 'checked_out') AND deleted_at IS NULL", [old.booking_id, propertyId]);
          if (!booking) throw fail("The linked booking cannot accept a concierge charge.", 409);
          const invoice = await transaction.get("SELECT * FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1", [booking.id, propertyId]);
          if (!invoice) throw fail("The booking has no invoice to charge.", 409);
          const settings = Object.fromEntries((await transaction.all("SELECT key, value_json FROM property_settings WHERE property_id = ?", [propertyId])).map((entry) => [entry.key, parseJson(entry.value_json)]));
          const serviceKobo = Math.round(old.cost_kobo * Number(settings.servicePercent ?? 0) / 100);
          const vatKobo = Math.round(old.cost_kobo * Number(settings.vatPercent ?? 0) / 100);
          const totalKobo = old.cost_kobo + serviceKobo + vatKobo;
          await transaction.run(`
            INSERT INTO booking_extras (id, property_id, booking_id, description, qty, unit_price_kobo, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, 'concierge', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [`EXTRA-${crypto.randomUUID()}`, propertyId, booking.id, `Concierge: ${old.type}`, old.cost_kobo]);
          await transaction.run("UPDATE invoices SET total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [totalKobo, invoice.id]);
          await transaction.run(`
            UPDATE bookings SET subtotal_kobo = subtotal_kobo + ?, service_kobo = service_kobo + ?,
              vat_kobo = vat_kobo + ?, total_kobo = total_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `, [old.cost_kobo, serviceKobo, vatKobo, totalKobo, booking.id]);
        }
        await transaction.run("UPDATE concierge_requests SET status = ?, completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, status, old.id]);
        const result = { id: old.id, status };
        await audit(transaction, propertyId, request, "concierge_request", old.id, status, old, result);
        return result;
      });
      response.json(updated);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/users", async (request, response) => {
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
      await database.run("INSERT INTO users (id, property_id, name, email, role, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [id, propertyId, name, email, role, hashPassword(password)]);
      const saved = { id, name, email, role, active: true };
      await audit(database, propertyId, request, "user", id, "created", null, saved);
      response.status(201).json(saved);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "A team member already uses that email." });
      sendError(response, error);
    }
  });

  app.patch("/api/users/:id/active", async (request, response) => {
    if (!requireRole(request, response, ["ceo"])) return;
    const active = request.body.active ? 1 : 0;
    const old = await database.get("SELECT id, name, email, role, active FROM users WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!old) return response.status(404).json({ error: "Team member not found." });
    if (request.user.id === old.id && !active) return response.status(409).json({ error: "You cannot deactivate the active account." });
    await database.run("UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [active, old.id]);
    const updated = { ...old, active: Boolean(active) };
    await audit(database, propertyId, request, "user", old.id, active ? "activated" : "deactivated", old, updated);
    response.json(updated);
  });

  app.put("/api/users/:id/password", async (request, response) => {
    if (!requireRole(request, response, ["ceo", "manager"])) return;
    const password = String(request.body.password || "");
    if (password.length < 12) return response.status(400).json({ error: "Password must be at least 12 characters." });
    const user = await database.get("SELECT id FROM users WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
    if (!user) return response.status(404).json({ error: "Team member not found." });
    await database.run("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [hashPassword(password), user.id]);
    await database.run("DELETE FROM auth_sessions WHERE user_id = ?", [user.id]);
    await audit(database, propertyId, request, "user", user.id, "password_reset", null, { passwordChanged: true });
    response.json({ id: user.id, passwordUpdated: true });
  });

  app.put("/api/settings", async (request, response) => {
    if (!requireRole(request, response, ["ceo"])) return;
    const settings = request.body;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.checkInTime || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.checkOutTime || "") ||
        !Number.isFinite(Number(settings.servicePercent)) || Number(settings.servicePercent) < 0 || Number(settings.servicePercent) > 100 ||
        !Number.isFinite(Number(settings.vatPercent)) || Number(settings.vatPercent) < 0 || Number(settings.vatPercent) > 100) {
      return response.status(400).json({ error: "Enter valid check-in/out times and tax percentages." });
    }
    const before = Object.fromEntries((await database.all("SELECT key, value_json FROM property_settings WHERE property_id = ?", [propertyId])).map((row) => [row.key, parseJson(row.value_json)]));
    const timestamp = new Date().toISOString();
    const user = request.user;
    await database.withTransaction(async (transaction) => {
      for (const [key, value] of Object.entries(settings)) {
        await transaction.run(`
          INSERT INTO property_settings (property_id, key, value_json, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(property_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by
        `, [propertyId, key, JSON.stringify(value), timestamp, user.id]);
      }
      await audit(transaction, propertyId, request, "settings", propertyId, "updated", before, settings);
    });
    response.json(settings);
  });

  app.post("/api/daily-closings", async (request, response) => {
    if (!requireRole(request, response, managerRoles)) return;
    const { date, counted, note = "" } = request.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !counted) {
      return response.status(400).json({ error: "Enter a closing date and counted totals." });
    }
    const methods = ["cash", "transfer", "card"];
    const expectedEntries = await Promise.all(methods.map(async (method) => {
      const hotelReceipts = await database.get(`
        SELECT COALESCE(sum(amount_kobo), 0) AS amount FROM payments
        WHERE property_id = ? AND method = ? AND status IN ('paid', 'part_refunded', 'refunded')
          AND amount_kobo > 0 AND date(paid_at) = ? AND deleted_at IS NULL
      `, [propertyId, method, date]);
      const hotelRefunds = await database.get(`
        SELECT COALESCE(sum(refund.amount_kobo), 0) AS amount
        FROM payments AS refund JOIN payments AS original ON original.id = refund.original_payment_id
        WHERE refund.property_id = ? AND refund.method = 'refund' AND refund.status = 'refunded'
          AND original.method = ? AND date(refund.paid_at) = ? AND refund.deleted_at IS NULL
      `, [propertyId, method, date]);
      const fnbReceipts = await database.get(`
        SELECT COALESCE(sum(amount_kobo), 0) AS amount FROM fnb_order_payments
        WHERE property_id = ? AND method = ? AND status = 'paid' AND amount_kobo > 0 AND date(created_at) = ?
      `, [propertyId, method, date]);
      const fnbRefunds = await database.get(`
        SELECT COALESCE(sum(refund.amount_kobo), 0) AS amount
        FROM fnb_order_payments AS refund
        JOIN fnb_order_payments AS original ON original.id = refund.original_payment_id
        WHERE refund.property_id = ? AND refund.method = 'refund' AND refund.status = 'refunded'
          AND original.method = ? AND date(refund.created_at) = ?
      `, [propertyId, method, date]);
      return [method, Number(hotelReceipts.amount) + Number(hotelRefunds.amount) + Number(fnbReceipts.amount) + Number(fnbRefunds.amount)];
    }));
    const expected = Object.fromEntries(expectedEntries);
    const validCounted = Object.fromEntries(methods.map((method) => [method, Math.round(Number(counted[method] || 0))]));
    if (Object.values(validCounted).some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
      return response.status(400).json({ error: "Closing totals must be non-negative whole kobo amounts." });
    }
    const differenceKobo = methods.reduce((sum, method) => sum + validCounted[method] - expected[method], 0);
    if (differenceKobo !== 0 && !String(note || "").trim()) return response.status(400).json({ error: "Add a note explaining the reconciliation difference." });
    const closedBy = request.user.name;
    const timestamp = new Date().toISOString();
    const id = `CLOSE-${date}`;
    const user = request.user;
    try {
      await database.run(`
        INSERT INTO daily_closings (property_id, close_date, expected_json, counted_json, difference_kobo, note, closed_by, closed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [propertyId, date, JSON.stringify(expected), JSON.stringify(validCounted), differenceKobo, String(note || "Balanced").trim() || "Balanced", user.id, timestamp]);
      const saved = { id, date, expected, counted: validCounted, differenceKobo, note: String(note || "Balanced").trim() || "Balanced", closedBy, closedAt: timestamp, databaseClosing: true };
      await audit(database, propertyId, request, "daily_close", id, "closed", null, saved);
      response.status(201).json(saved);
    } catch (error) {
      if (["SQLITE_CONSTRAINT_UNIQUE", "23505"].includes(error.code)) return response.status(409).json({ error: "This day has already been closed." });
      sendError(response, error);
    }
  });
}