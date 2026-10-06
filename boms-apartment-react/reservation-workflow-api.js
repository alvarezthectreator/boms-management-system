import crypto from "node:crypto";

function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function sendError(response, error) {
  response.status(error.status || 500).json({ error: error.message || "Request failed." });
}

export function getLagosDateTime(now = new Date()) {
  return {
    date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Lagos" }).format(now),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
  };
}

export function workerMayCheckOut(status, checkOut, today, time, balanceKobo) {
  return status === "checked_in" && checkOut === today && time >= "12:00" && balanceKobo <= 0;
}

function settingPercent(database, propertyId, key) {
  const row = database.prepare("SELECT value_json FROM property_settings WHERE property_id = ? AND key = ?").get(propertyId, key);
  const value = Number(row ? JSON.parse(row.value_json) : 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function registerReservationWorkflowRoutes(
  app,
  database,
  propertyId,
  { getDateTime = getLagosDateTime } = {},
) {
  app.patch("/api/reservations/:id/extend", (request, response) => {
    const role = request.user?.role;
    if (!["worker", "manager", "ceo"].includes(role)) {
      return response.status(403).json({ error: "Your role cannot extend a stay." });
    }

    const { date, time } = getDateTime();
    if (role === "worker" && !(time >= "11:00" && time < "12:00")) {
      return response.status(409).json({ error: "Call the guest and extend between 11:00 a.m. and noon on the checkout day." });
    }

    try {
      const extend = database.transaction(() => {
        const booking = database.prepare(`
          SELECT id, unit_id, check_in, check_out, nights, rate_kobo, status,
                 subtotal_kobo, service_kobo, vat_kobo, total_kobo
          FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL
        `).get(request.params.id, propertyId);
        if (!booking) throw problem("Reservation not found.", 404);
        if (booking.status !== "checked_in" || booking.check_out !== date) {
          throw problem("Only a checked-in guest due to check out today can be extended.", 409);
        }

        const nextCheckOut = new Date(Date.parse(`${booking.check_out}T00:00:00Z`) + 86400000)
          .toISOString()
          .slice(0, 10);
        const conflict = database.prepare(`
          SELECT id FROM bookings
          WHERE unit_id = ? AND id != ? AND property_id = ? AND deleted_at IS NULL
            AND status IN ('hold', 'confirmed', 'checked_in')
            AND check_in < ? AND check_out > ?
          LIMIT 1
        `).get(booking.unit_id, booking.id, propertyId, nextCheckOut, booking.check_out);
        if (conflict) throw problem("The room is already booked for the extra night.", 409);
        const block = database.prepare(`
          SELECT id FROM out_of_order_blocks
          WHERE unit_id = ? AND property_id = ? AND deleted_at IS NULL
            AND start_date < ? AND end_date > ?
          LIMIT 1
        `).get(booking.unit_id, propertyId, nextCheckOut, booking.check_out);
        if (block) throw problem("The room is blocked for the extra night.", 409);
        const nightlyRate = Number(booking.rate_kobo);
        if (!Number.isSafeInteger(nightlyRate) || nightlyRate <= 0) {
          throw problem("This reservation has no valid nightly rate. Ask a manager to review it.", 409);
        }

        const serviceKobo = Math.round(nightlyRate * settingPercent(database, propertyId, "servicePercent") / 100);
        const vatKobo = Math.round(nightlyRate * settingPercent(database, propertyId, "vatPercent") / 100);
        const totalKobo = nightlyRate + serviceKobo + vatKobo;
        const updated = {
          ...booking,
          check_out: nextCheckOut,
          nights: Number(booking.nights || 0) + 1,
          subtotal_kobo: Number(booking.subtotal_kobo || 0) + nightlyRate,
          service_kobo: Number(booking.service_kobo || 0) + serviceKobo,
          vat_kobo: Number(booking.vat_kobo || 0) + vatKobo,
          total_kobo: Number(booking.total_kobo || 0) + totalKobo,
        };
        database.prepare(`
          UPDATE bookings SET check_out = ?, nights = ?, subtotal_kobo = ?,
            service_kobo = ?, vat_kobo = ?, total_kobo = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND property_id = ?
        `).run(updated.check_out, updated.nights, updated.subtotal_kobo,
          updated.service_kobo, updated.vat_kobo, updated.total_kobo, booking.id, propertyId);
        database.prepare(`
          UPDATE invoices SET total_kobo = ?,
            status = CASE WHEN paid_kobo >= ? THEN 'paid' ELSE 'issued' END,
            updated_at = CURRENT_TIMESTAMP
          WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL
        `).run(updated.total_kobo, updated.total_kobo, booking.id, propertyId);
        database.prepare(`
          INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
          VALUES (?, ?, ?, 'booking', ?, 'extended_one_night', ?, ?, CURRENT_TIMESTAMP)
        `).run(`AUD-${crypto.randomUUID()}`, propertyId, request.user.id, booking.id,
          JSON.stringify(booking), JSON.stringify(updated));

        return {
          id: booking.id,
          checkOut: updated.check_out,
          nights: updated.nights,
          subtotalKobo: updated.subtotal_kobo,
          serviceKobo: updated.service_kobo,
          vatKobo: updated.vat_kobo,
          totalKobo: updated.total_kobo,
        };
      });
      response.json(extend.immediate());
    } catch (error) {
      sendError(response, error);
    }
  });
}