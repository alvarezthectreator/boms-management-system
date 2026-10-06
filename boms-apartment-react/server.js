import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";
import { findBookingConflict } from "./availability.js";
import { registerOperationsRoutes } from "./operations-api.js";
import { registerFnbRoutes } from "./fnb-api.js";
import { registerWorkspaceRoutes } from "./workspace-api.js";
import { getLagosDateTime, registerReservationWorkflowRoutes, workerMayCheckOut } from "./reservation-workflow-api.js";
import { createAuthMiddleware, registerAuthRoutes } from "./auth-api.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(process.env.BOMS_DB_PATH || path.join(root, "data", "boms.sqlite"));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");
database.exec(fs.readFileSync(path.join(root, "db", "002_named_rooms.sql"), "utf8"));
database.exec(fs.readFileSync(path.join(root, "db", "003_room_defaults.sql"), "utf8"));
database.exec(fs.readFileSync(path.join(root, "db", "004_manager_name.sql"), "utf8"));
database.exec(fs.readFileSync(path.join(root, "db", "005_fnb_inventory.sql"), "utf8"));
if (!database.pragma("table_info(fnb_orders)").some((column) => column.name === "service_kobo")) {
  database.exec(fs.readFileSync(path.join(root, "db", "006_fnb_service_charge.sql"), "utf8"));
}
if (!database.pragma("table_info(purchase_order_lines)").some((column) => column.name === "expiry_date")) {
  database.exec(fs.readFileSync(path.join(root, "db", "007_purchase_expiry.sql"), "utf8"));
}
database.exec(fs.readFileSync(path.join(root, "db", "008_auth_sessions.sql"), "utf8"));

const app = express();
const port = Number(process.env.API_PORT || 3001);
const propertyId = "property_boms";
database.exec("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
if (!database.prepare("SELECT name FROM app_migrations WHERE name = ?").get("zero_service_and_vat_rates")) {
  const migrateChargeRates = database.transaction(() => {
    database.prepare("UPDATE property_settings SET value_json = '0', updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND key IN ('servicePercent', 'vatPercent')")
      .run(propertyId);
    database.prepare("INSERT INTO app_migrations (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)")
      .run("zero_service_and_vat_rates");
  });
  migrateChargeRates.immediate();
}
app.use(express.json({ limit: "7mb" }));
app.use("/api/room-images", express.static(path.join(root, "public", "room-images")));
app.use("/api", createAuthMiddleware(database, "property_boms"));
registerAuthRoutes(app, database, "property_boms");

function listRooms() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Lagos",
  }).format(new Date());
  return database.prepare(`
    SELECT
      units.id,
      units.name,
      units.number,
      units.floor,
      units.status,
      room_types.id AS room_type_id,
      room_types.name AS room_type_name,
      room_types.size_m2,
      room_types.bed_type,
      room_types.max_guests,
      room_types.description,
      room_types.base_rate_kobo,
      room_types.photos_json,
      (
        SELECT count(*)
        FROM bookings
        WHERE bookings.unit_id = units.id
          AND bookings.status IN ('hold', 'confirmed', 'checked_in')
          AND bookings.check_in <= @today
          AND bookings.check_out > @today
          AND bookings.deleted_at IS NULL
      ) AS active_reservations
    FROM units
    JOIN room_types ON room_types.id = units.room_type_id
    WHERE units.property_id = @propertyId
      AND units.deleted_at IS NULL
      AND room_types.deleted_at IS NULL
    ORDER BY units.name
  `).all({ propertyId, today }).map((room) => ({
    id: room.id,
    name: room.name,
    number: room.number,
    floor: room.floor,
    status: room.status,
    roomTypeId: room.room_type_id,
    roomTypeName: room.room_type_name,
    sizeM2: room.size_m2,
    bedType: room.bed_type,
    maxGuests: room.max_guests || 3,
    description: room.description,
    rateKobo: room.base_rate_kobo,
    images: JSON.parse(room.photos_json || "[]"),
    activeReservations: room.active_reservations,
  }));
}

function getRoom(id) {
  return database.prepare(`
    SELECT units.id, units.number, units.status, units.room_type_id,
           room_types.base_rate_kobo, room_types.max_guests
    FROM units
    JOIN room_types ON room_types.id = units.room_type_id
    WHERE units.id = ? AND units.property_id = ?
      AND units.deleted_at IS NULL AND room_types.deleted_at IS NULL
  `).get(id, propertyId);
}

function parseImage(body, roomId) {
  if (body.imageUrl) {
    const imageUrl = String(body.imageUrl).trim();
    if (!imageUrl.startsWith("/") && !/^https:\/\//i.test(imageUrl)) {
      throw Object.assign(new Error("Use an HTTPS image URL."), { status: 400 });
    }
    return imageUrl;
  }
  if (!body.imageDataUrl) return null;
  const match = String(body.imageDataUrl).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw Object.assign(new Error("Choose a JPG, PNG, or WebP image."), { status: 400 });
  }
  const image = Buffer.from(match[2], "base64");
  if (image.length > 5 * 1024 * 1024) {
    throw Object.assign(new Error("Images must be 5 MB or smaller."), { status: 413 });
  }
  const folder = path.join(root, "public", "room-images");
  fs.mkdirSync(folder, { recursive: true });
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const fileName = `${roomId}-${Date.now()}.${extension}`;
  fs.writeFileSync(path.join(folder, fileName), image);
  return `/api/room-images/${fileName}`;
}

function sendError(response, error) {
  response.status(error.status || 500).json({ error: error.message || "Request failed." });
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/rooms", (_request, response) => {
  response.json(listRooms());
});

app.patch("/api/rooms/:id", (request, response) => {
  try {
    if (request.user.role !== "ceo") {
      return response.status(403).json({ error: "Only an admin can edit room details." });
    }
    const room = getRoom(request.params.id);
    if (!room) return response.status(404).json({ error: "Room not found." });
    const imageUrl = parseImage(request.body, room.id);
    const rateNaira = request.body.rateNaira;
    const bedType = request.body.sharedBedType;
    if (rateNaira !== undefined && rateNaira !== "" && (!Number.isFinite(Number(rateNaira)) || Number(rateNaira) <= 0)) {
      return response.status(400).json({ error: "Enter a nightly rate greater than zero." });
    }
    if (bedType !== undefined && !String(bedType).trim()) {
      return response.status(400).json({ error: "Enter the shared bed size." });
    }
    const update = database.transaction(() => {
      if (imageUrl) {
        database.prepare(`UPDATE room_types SET photos_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(JSON.stringify([imageUrl]), room.room_type_id);
      }
      if (rateNaira !== undefined && rateNaira !== "") {
        database.prepare(`UPDATE room_types SET base_rate_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(Math.round(Number(rateNaira) * 100), room.room_type_id);
      }
      if (bedType !== undefined) {
        database.prepare(`
          UPDATE room_types SET bed_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE property_id = ? AND deleted_at IS NULL
        `).run(String(bedType).trim(), propertyId);
      }
    });
    update();
    response.json(listRooms().find((item) => item.id === room.id));
  } catch (error) {
    sendError(response, error);
  }
});

app.patch("/api/rooms/:id/status", (request, response) => {
  if (!['manager', 'ceo'].includes(request.user.role)) {
    return response.status(403).json({ error: "Only a manager or admin can change room status." });
  }
  const statuses = ["available", "occupied", "dirty", "cleaning", "inspected", "out_of_order"];
  const { status } = request.body;
  if (!statuses.includes(status)) return response.status(400).json({ error: "Invalid room status." });
  const update = database.prepare(`
    UPDATE units SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ? AND deleted_at IS NULL
  `).run(status, request.params.id, propertyId);
  if (!update.changes) return response.status(404).json({ error: "Room not found." });
  response.json(listRooms().find((room) => room.id === request.params.id));
});

app.get("/api/blocks", (_request, response) => {
  const blocks = database.prepare(`
    SELECT id, unit_id, start_date, end_date, reason
    FROM out_of_order_blocks
    WHERE property_id = ? AND deleted_at IS NULL
    ORDER BY start_date
  `).all(propertyId).map((block) => ({
    id: block.id,
    unitId: block.unit_id,
    start: block.start_date,
    end: block.end_date,
    reason: block.reason,
    databaseBlock: true,
  }));
  response.json(blocks);
});

app.post("/api/rooms/:id/blocks", (request, response) => {
  if (!["manager", "ceo"].includes(request.user.role)) {
    return response.status(403).json({ error: "Only a manager or admin can block room dates." });
  }
  const room = getRoom(request.params.id);
  const { start, end, reason } = request.body;
  if (!room) return response.status(404).json({ error: "Room not found." });
  if (!start || !end || end <= start || !String(reason || "").trim()) {
    return response.status(400).json({ error: "Enter a valid date range and reason." });
  }
  const insert = database.transaction(() => {
    const booking = database.prepare(`
      SELECT id FROM bookings
      WHERE unit_id = ? AND deleted_at IS NULL
        AND status IN ('hold', 'confirmed', 'checked_in')
        AND check_in < ? AND check_out > ?
      LIMIT 1
    `).get(room.id, end, start);
    if (booking) throw Object.assign(new Error("Move overlapping reservations before blocking this room."), { status: 409 });
    const block = {
      id: `BLK-${crypto.randomUUID()}`,
      unitId: room.id,
      start,
      end,
      reason: String(reason).trim(),
    };
    database.prepare(`
      INSERT INTO out_of_order_blocks (
        id, property_id, unit_id, start_date, end_date, reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(block.id, propertyId, block.unitId, block.start, block.end, block.reason);
    return block;
  });
  try {
    response.status(201).json(insert.immediate());
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/api/reservations", (_request, response) => {
  const reservations = database.prepare(`
    SELECT bookings.*, guests.full_name, guests.phone, guests.email, guests.nationality,
          guests.id_number, guests.loyalty_tier, guests.points,
          COALESCE(sum(CASE WHEN payments.status IN ('paid', 'refunded', 'part_refunded') THEN payments.amount_kobo ELSE 0 END), 0) AS paid_kobo
    FROM bookings
    JOIN guests ON guests.id = bookings.guest_id
        LEFT JOIN payments ON payments.booking_id = bookings.id AND payments.deleted_at IS NULL
    WHERE bookings.property_id = ? AND bookings.deleted_at IS NULL
        GROUP BY bookings.id
    ORDER BY bookings.created_at DESC
  `).all(propertyId).map((booking) => ({
    id: booking.id,
    guestId: booking.guest_id,
    guest: {
      id: booking.guest_id,
      name: booking.full_name,
      phone: booking.phone,
      email: booking.email || "",
      nationality: booking.nationality || "—",
      idNumber: booking.id_number || "",
      tier: booking.loyalty_tier,
      points: booking.points,
    },
    unitId: booking.unit_id,
    roomTypeId: booking.room_type_id,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    adults: booking.adults,
    children: booking.children,
    status: booking.status,
    source: booking.source,
    requests: booking.requests || "",
    totalKobo: booking.total_kobo,
    paidKobo: booking.paid_kobo,
    discountKobo: booking.discount_kobo,
    subtotalKobo: booking.subtotal_kobo,
    serviceKobo: booking.service_kobo,
    vatKobo: booking.vat_kobo,
  }));
  response.json(reservations);
});

app.patch("/api/reservations/:id/status", (request, response) => {
  const { status, reason = "", refundKobo = 0 } = request.body;
  const role = request.user.role;
  const allowedStatuses = ["hold", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"];
  if (!allowedStatuses.includes(status)) return response.status(400).json({ error: "Invalid reservation status." });
  const workerCheckout = role === "worker" && status === "checked_out";
  if (!["manager", "ceo"].includes(role) && !(role === "worker" && ["checked_in", "checked_out"].includes(status))) {
    return response.status(403).json({ error: "Your role cannot change this reservation status." });
  }
  if (status === "cancelled" && !String(reason).trim()) {
    return response.status(400).json({ error: "A cancellation reason is required." });
  }
  const requestedRefund = Math.round(Number(refundKobo));
  if (!Number.isSafeInteger(requestedRefund) || requestedRefund < 0) {
    return response.status(400).json({ error: "Invalid cancellation refund amount." });
  }
  if (role === "manager" && requestedRefund > 5000000) {
    return response.status(403).json({ error: "Manager refunds are limited to ₦50,000." });
  }
  try {
    const update = database.transaction(() => {
      const booking = database.prepare(`
        SELECT unit_id, check_in, check_out, status
        FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL
      `).get(request.params.id, propertyId);
      if (!booking) throw Object.assign(new Error("Reservation not found."), { status: 404 });
      if (workerCheckout) {
        const { date, time } = getLagosDateTime();
        const invoice = database.prepare(`
          SELECT COALESCE(sum(max(0, total_kobo - paid_kobo)), 0) AS balance_kobo
          FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL
        `).get(request.params.id, propertyId);
        if (!workerMayCheckOut(booking.status, booking.check_out, date, time, Number(invoice?.balance_kobo || 0))) {
          throw Object.assign(new Error("Staff can check out a guest due today after noon, once the balance is paid."), { status: 409 });
        }
      }
      const room = getRoom(booking.unit_id);
      if (status === "checked_in" && !["available", "inspected"].includes(room?.status)) {
        throw Object.assign(new Error("This room is not ready for check-in."), { status: 409 });
      }
      if (["hold", "confirmed", "checked_in"].includes(status) && room?.status === "out_of_order") {
        throw Object.assign(new Error("This room is out of order."), { status: 409 });
      }
      if (["hold", "confirmed", "checked_in"].includes(status)) {
        const conflict = database.prepare(`
          SELECT id FROM bookings
          WHERE unit_id = ? AND id != ? AND deleted_at IS NULL
            AND status IN ('hold', 'confirmed', 'checked_in')
            AND check_in < ? AND check_out > ?
          LIMIT 1
        `).get(booking.unit_id, request.params.id, booking.check_out, booking.check_in);
        const block = database.prepare(`
          SELECT id FROM out_of_order_blocks
          WHERE unit_id = ? AND deleted_at IS NULL
            AND start_date < ? AND end_date > ?
          LIMIT 1
        `).get(booking.unit_id, booking.check_out, booking.check_in);
        if (conflict || block) throw Object.assign(new Error("This reservation no longer fits the room availability."), { status: 409 });
      }
      database.prepare(`
        UPDATE bookings SET status = ?, cancellation_reason = ?,
          checked_in_at = CASE WHEN ? = 'checked_in' THEN CURRENT_TIMESTAMP ELSE checked_in_at END,
          checked_out_at = CASE WHEN ? = 'checked_out' THEN CURRENT_TIMESTAMP ELSE checked_out_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND property_id = ?
      `).run(status, status === "cancelled" ? String(reason).trim() : null,
        status, status, request.params.id, propertyId);
      if (status === "checked_in" || status === "checked_out") {
        database.prepare(`
          UPDATE units SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND property_id = ? AND deleted_at IS NULL
        `).run(status === "checked_in" ? "occupied" : "dirty", booking.unit_id, propertyId);
      }
      let housekeepingTask = null;
      if (status === "checked_out" && booking.status !== "checked_out") {
        const nextArrival = database.prepare(`
          SELECT id FROM bookings WHERE unit_id = ? AND check_in = ?
            AND status IN ('hold', 'confirmed') AND deleted_at IS NULL LIMIT 1
        `).get(booking.unit_id, booking.check_out);
        const taskId = `HK-${crypto.randomUUID()}`;
        database.prepare(`
          INSERT INTO housekeeping_tasks (
            id, property_id, unit_id, booking_id, type, status, priority,
            assigned_to_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Checkout clean', 'open', ?, 'Unassigned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(taskId, propertyId, booking.unit_id, request.params.id, nextArrival ? "high" : "medium");
        housekeepingTask = database.prepare("SELECT * FROM housekeeping_tasks WHERE id = ?").get(taskId);
      }
      const refunds = [];
      if (status === "cancelled" && requestedRefund > 0) {
        let remaining = requestedRefund;
        const originalPayments = database.prepare(`
          SELECT * FROM payments
          WHERE booking_id = ? AND property_id = ? AND amount_kobo > 0
            AND status IN ('paid', 'part_refunded') AND deleted_at IS NULL
          ORDER BY created_at DESC
        `).all(request.params.id, propertyId);
        for (const payment of originalPayments) {
          const alreadyRefunded = database.prepare(`
            SELECT COALESCE(sum(-amount_kobo), 0) AS amount
            FROM payments WHERE original_payment_id = ? AND status = 'refunded' AND deleted_at IS NULL
          `).get(payment.id).amount;
          const amount = Math.min(remaining, payment.amount_kobo - alreadyRefunded);
          if (amount <= 0) continue;
          const refundId = `PAY-${crypto.randomUUID()}`;
          database.prepare(`
            INSERT INTO payments (
              id, property_id, booking_id, invoice_id, method, amount_kobo,
              reference, status, original_payment_id, paid_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'refund', ?, ?, 'refunded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(refundId, propertyId, request.params.id, payment.invoice_id, -amount, `REF-${crypto.randomUUID()}`, payment.id);
          const newRefundedTotal = alreadyRefunded + amount;
          database.prepare("UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(newRefundedTotal >= payment.amount_kobo ? "refunded" : "part_refunded", payment.id);
          refunds.push(database.prepare("SELECT * FROM payments WHERE id = ?").get(refundId));
          remaining -= amount;
          if (remaining === 0) break;
        }
        if (remaining > 0) throw Object.assign(new Error("Refund exceeds collected database payments."), { status: 409 });
        const invoice = database.prepare("SELECT id, paid_kobo FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL").get(request.params.id, propertyId);
        if (invoice) database.prepare("UPDATE invoices SET paid_kobo = ?, status = 'issued', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(Math.max(0, invoice.paid_kobo - requestedRefund), invoice.id);
        for (const refund of refunds) {
          database.prepare(`
            INSERT INTO audit_logs (id, property_id, entity, entity_id, action, new_json, created_at)
            VALUES (?, ?, 'payment', ?, 'cancel_refund', ?, CURRENT_TIMESTAMP)
          `).run(`AUD-${crypto.randomUUID()}`, propertyId, refund.id, JSON.stringify(refund));
        }
      }
      return {
        id: request.params.id,
        status,
        housekeepingTask,
        refunds: refunds.map((refund) => ({
          id: refund.id,
          bookingId: refund.booking_id,
          invoiceId: refund.invoice_id,
          originalPaymentId: refund.original_payment_id,
          method: "Refund",
          amountKobo: refund.amount_kobo,
          reference: refund.reference,
          status: refund.status,
          paidAt: refund.paid_at?.slice(0, 10) || "",
          databasePayment: true,
        })),
      };
    });
    response.json(update.immediate());
  } catch (error) {
    sendError(response, error);
  }
});

function validateReservation(input, existingId = null) {
  const room = getRoom(input.unitId);
  if (!room) throw Object.assign(new Error("Choose a room from the active room list."), { status: 400 });
  if (room.status === "out_of_order") throw Object.assign(new Error("This room is out of order and cannot be reserved."), { status: 409 });
  const checkIn = String(input.checkIn || "");
  const checkOut = String(input.checkOut || "");
  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
  if (!Number.isInteger(nights) || nights < 1) throw Object.assign(new Error("Choose valid check-in and check-out dates."), { status: 400 });
  const adults = Number(input.adults);
  const children = Number(input.children || 0);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0 || adults + children > Math.min(3, room.max_guests || 3)) {
    throw Object.assign(new Error("Each room accommodates a maximum of 3 guests."), { status: 400 });
  }
  if (!room.base_rate_kobo) throw Object.assign(new Error("Set this room's nightly rate before booking."), { status: 409 });
  const conflict = findBookingConflict(database, input.unitId, checkIn, checkOut, existingId);
  if (conflict) throw Object.assign(new Error("This room already has a reservation during those dates."), { status: 409 });
  const blocked = database.prepare(`
    SELECT id FROM out_of_order_blocks
    WHERE unit_id = ? AND deleted_at IS NULL
      AND start_date < ? AND end_date > ?
    LIMIT 1
  `).get(input.unitId, checkOut, checkIn);
  if (blocked) throw Object.assign(new Error("This room is blocked during those dates."), { status: 409 });
  const subtotalKobo = room.base_rate_kobo * nights;
  const discountKobo = Math.max(0, Math.round(Number(input.discountKobo || 0)));
  if (discountKobo > subtotalKobo) throw Object.assign(new Error("Discount cannot exceed the room total."), { status: 400 });
  const taxableKobo = subtotalKobo - discountKobo;
  const servicePercent = Number(input.servicePercent ?? 0);
  const vatPercent = Number(input.vatPercent ?? 0);
  const serviceKobo = Math.round(taxableKobo * servicePercent / 100);
  const vatKobo = Math.round(taxableKobo * vatPercent / 100);
  return {
    room,
    nights,
    subtotalKobo,
    discountKobo,
    serviceKobo,
    vatKobo,
    totalKobo: taxableKobo + serviceKobo + vatKobo,
  };
}

function saveReservation(input, existingId = null) {
  const reservationId = existingId || `BA-B${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
  const run = database.transaction(() => {
    const quote = validateReservation(input, existingId);
    const guest = input.guest;
    if (!guest?.name || !guest?.phone) throw Object.assign(new Error("Guest name and phone are required."), { status: 400 });
    const guestId = String(input.guestId || guest.id || `guest_${crypto.randomUUID()}`);
    database.prepare(`
      INSERT OR IGNORE INTO guests (
        id, property_id, full_name, phone, email, nationality, id_number,
        loyalty_tier, points, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(guestId, propertyId, guest.name, guest.phone, guest.email || null,
      guest.nationality || null, guest.idNumber || null, guest.tier || "Silver", Number(guest.points || 0));
    const status = ["hold", "confirmed"].includes(input.status) ? input.status : "confirmed";
    const values = [
      input.unitId, quote.room.room_type_id, input.checkIn, input.checkOut,
      quote.nights, Number(input.adults), Number(input.children || 0), status,
      input.source || "Walk-in", input.requests || null, quote.room.base_rate_kobo,
      quote.subtotalKobo, quote.discountKobo, quote.vatKobo,
      quote.serviceKobo, quote.totalKobo,
    ];
    if (existingId) {
      const result = database.prepare(`
        UPDATE bookings SET unit_id = ?, room_type_id = ?, check_in = ?, check_out = ?,
          nights = ?, adults = ?, children = ?, status = ?, source = ?, requests = ?,
          rate_kobo = ?, subtotal_kobo = ?, discount_kobo = ?, vat_kobo = ?,
          service_kobo = ?, total_kobo = ?, guest_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND property_id = ? AND deleted_at IS NULL
      `).run(...values, guestId, existingId, propertyId);
      if (!result.changes) throw Object.assign(new Error("Reservation not found."), { status: 404 });
      database.prepare(`
        UPDATE invoices SET total_kobo = ?,
          status = CASE WHEN paid_kobo >= ? THEN 'paid' ELSE 'issued' END,
          updated_at = CURRENT_TIMESTAMP
        WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL
      `).run(quote.totalKobo, quote.totalKobo, existingId, propertyId);
    } else {
      database.prepare(`
        INSERT INTO bookings (
          id, property_id, guest_id, unit_id, room_type_id, check_in, check_out,
          nights, adults, children, status, source, requests, rate_kobo,
          subtotal_kobo, discount_kobo, vat_kobo, service_kobo, total_kobo,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(reservationId, propertyId, guestId, ...values);
      database.prepare(`
        INSERT INTO invoices (
          id, property_id, booking_id, number, issue_date, due_date,
          total_kobo, paid_kobo, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(`INV-${crypto.randomUUID()}`, propertyId, reservationId,
        `BA-INV-${reservationId}`, input.checkIn, input.checkIn, quote.totalKobo);
    }
    return reservationId;
  });
  return run.immediate();
}

app.post("/api/reservations", (request, response) => {
  try {
    const id = saveReservation(request.body);
    response.status(201).json({ id });
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/reservations/:id", (request, response) => {
  if (!['manager', 'ceo'].includes(request.user.role)) {
    return response.status(403).json({ error: "Only a manager or admin can edit reservations." });
  }
  try {
    const id = saveReservation(request.body, request.params.id);
    response.json({ id });
  } catch (error) {
    sendError(response, error);
  }
});

registerOperationsRoutes(app, database, propertyId);
registerFnbRoutes(app, database, propertyId);
registerWorkspaceRoutes(app, database, propertyId);
registerReservationWorkflowRoutes(app, database, propertyId);

app.listen(port, "127.0.0.1", () => {
  console.log(`Boms Apartment API listening on http://127.0.0.1:${port}`);
});
