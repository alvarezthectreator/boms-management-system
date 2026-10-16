import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import Database from "better-sqlite3";
import { findBookingConflictAsync } from "./availability.js";
import { registerOperationsRoutes } from "./operations-api.js";
import { registerFnbRoutes } from "./fnb-api.js";
import { registerWorkspaceRoutes } from "./workspace-api.js";
import { getLagosDateTime, registerReservationWorkflowRoutes, workerMayCheckOut } from "./reservation-workflow-api.js";
import { createAuthMiddleware, registerAuthRoutes } from "./auth-api.js";
import { registerPublicWebsiteRoutes } from "./public-website-api.js";
import { createPostgresDatabase, createPostgresPool } from "./postgres-db.js";
import { supabaseSessionMiddleware } from "./utils/supabase/middleware.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const postgresMode = Boolean(process.env.DATABASE_URL);
let database;
if (postgresMode) {
  database = createPostgresDatabase(createPostgresPool());
} else {
  const databasePath = path.resolve(process.env.BOMS_DB_PATH || path.join(root, "data", "boms.sqlite"));
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.get = (sql, values = []) => database.prepare(sql).get(...values);
  database.all = (sql, values = []) => database.prepare(sql).all(...values);
  database.run = (sql, values = []) => database.prepare(sql).run(...values);
  database.withTransaction = async (callback) => {
    const transaction = {
      prepare: (sql) => database.prepare(sql),
      get: database.get,
      getForUpdate: database.get,
      all: database.all,
      run: database.run,
    };
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = await callback(transaction);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
  database.transaction = database.withTransaction;
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
  database.exec(fs.readFileSync(path.join(root, "db", "009_idempotency.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "db", "010_audit_append_only.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "db", "011_restock_requests.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "db", "015_staff_messaging.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "db", "019_location_workflow.sql"), "utf8"));
  if (!database.pragma("table_info(users)").some((column) => column.name === "last_seen_at")) {
    database.exec("ALTER TABLE users ADD COLUMN last_seen_at TEXT");
  }
  if (!database.pragma("table_info(menu_items)").some((column) => column.name === "image_url")) {
    database.exec(fs.readFileSync(path.join(root, "db", "016_menu_item_images.sql"), "utf8"));
  }
  const locationColumns = {
    units: { location_id: "TEXT" },
    users: { location_id: "TEXT" },
    inventory_items: { location_id: "TEXT" },
    stock_movements: { location_id: "TEXT" },
    menu_items: { fulfillment_location_id: "TEXT" },
    fnb_orders: { origin_location_id: "TEXT", service_mode: "TEXT NOT NULL DEFAULT 'lounge'" },
    fnb_order_items: { fulfillment_location_id: "TEXT" },
  };
  for (const [table, columns] of Object.entries(locationColumns)) {
    const existingColumns = new Set(database.pragma(`table_info(${table})`).map((column) => column.name));
    for (const [column, definition] of Object.entries(columns)) {
      if (!existingColumns.has(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  database.exec(`
    UPDATE inventory_items SET location_id = 'location-building-2' WHERE location_id IS NULL;
    UPDATE menu_items
    SET fulfillment_location_id = CASE WHEN station = 'bar' THEN 'location-bar' ELSE 'location-building-2' END
    WHERE fulfillment_location_id IS NULL;
    UPDATE fnb_orders SET service_mode = CASE WHEN room_unit_id IS NULL THEN 'lounge' ELSE 'room' END,
      origin_location_id = CASE WHEN room_unit_id IS NULL THEN 'location-bar'
        ELSE (SELECT location_id FROM units WHERE units.id = fnb_orders.room_unit_id) END
    WHERE origin_location_id IS NULL;
    UPDATE fnb_order_items SET fulfillment_location_id = (
      SELECT fulfillment_location_id FROM menu_items WHERE menu_items.id = fnb_order_items.menu_item_id
    ) WHERE fulfillment_location_id IS NULL;
  `);
  const housekeepingColumns = new Set(database.pragma("table_info(housekeeping_tasks)").map((column) => column.name));
  const missingHousekeepingColumns = {
    unit_id: "TEXT",
    booking_id: "TEXT",
    type: "TEXT",
    priority: "TEXT NOT NULL DEFAULT 'medium'",
    assigned_to: "TEXT",
    started_at: "TEXT",
    finished_at: "TEXT",
    inspected_by: "TEXT",
    inspection_note: "TEXT",
  };
  for (const [column, definition] of Object.entries(missingHousekeepingColumns)) {
    if (!housekeepingColumns.has(column)) {
      database.exec(`ALTER TABLE housekeeping_tasks ADD COLUMN ${column} ${definition}`);
    }
  }
}
if (postgresMode) {
  await database.query(fs.readFileSync(path.join(root, "db", "011_restock_requests_postgres.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "012_housekeeping_tasks_postgres.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "013_unbooked_rooms_available_postgres.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "014_postgres_api_compatibility.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "015_staff_messaging_postgres.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "016_menu_item_images_postgres.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "019_location_workflow_postgres.sql"), "utf8"));
  await database.query(fs.readFileSync(path.join(root, "db", "020_auth_sessions_postgres.sql"), "utf8"));
}

const app = express();
const port = Number(process.env.API_PORT || 3001);
const propertyId = "property_boms";
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
app.set("trust proxy", trustProxyHops);
app.disable("x-powered-by");
if (!postgresMode) {
  database.exec("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
}
if (!postgresMode && !database.prepare("SELECT name FROM app_migrations WHERE name = ?").get("zero_service_and_vat_rates")) {
  await database.transaction(() => {
    database.prepare("UPDATE property_settings SET value_json = '0', updated_at = CURRENT_TIMESTAMP WHERE property_id = ? AND key IN ('servicePercent', 'vatPercent')")
      .run(propertyId);
    database.prepare("INSERT INTO app_migrations (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)")
      .run("zero_service_and_vat_rates");
  });
}
app.use(express.json({ limit: "7mb" }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=15552000");
  next();
});
app.use("/api/room-images", express.static(path.join(root, "public", "room-images")));
registerPublicWebsiteRoutes(app, database, propertyId);
app.use("/api", (request, response, next) => {
  if (request.headers.cookie?.includes("sb_")) {
    return supabaseSessionMiddleware(request, response, next);
  }
  return next();
});
app.use("/api", createAuthMiddleware(database, "property_boms"));
registerAuthRoutes(app, database, "property_boms");

async function listRooms() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Lagos",
  }).format(new Date());
  const rows = await database.all(`
    SELECT
      units.id,
      COALESCE(NULLIF(units.name, ''), room_types.name) AS name,
      units.number,
      units.floor,
      units.status,
      units.location_id,
      property_locations.name AS location_name,
      room_types.id AS room_type_id,
      room_types.name AS room_type_name,
      room_types.size_m2,
      room_types.bed_type,
      room_types.max_guests,
      room_types.description,
      room_types.base_rate_kobo,
      room_types.photos_json
    FROM units
    JOIN room_types ON room_types.id = units.room_type_id
    LEFT JOIN property_locations ON property_locations.id = units.location_id
    WHERE units.property_id = ?
      AND units.deleted_at IS NULL
      AND room_types.deleted_at IS NULL
    ORDER BY units.name
  `, [propertyId]);

  let activeReservationsByUnit = new Map();
  try {
    const reservations = await database.all(`
      SELECT unit_id, count(*) AS active_reservations
      FROM bookings
      WHERE property_id = ?
        AND status IN ('hold', 'confirmed', 'checked_in')
        AND check_in <= ?
        AND check_out > ?
        AND deleted_at IS NULL
      GROUP BY unit_id
    `, [propertyId, today, today]);
    activeReservationsByUnit = new Map(reservations.map((reservation) => [
      reservation.unit_id,
      Number(reservation.active_reservations || 0),
    ]));
  } catch (error) {
    console.error("Room list loaded without active reservation counts.", error);
  }

  return rows.map((room) => ({
    id: room.id,
    name: room.name,
    number: room.number,
    floor: room.floor || null,
    status: room.status,
    locationId: room.location_id || "",
    locationName: room.location_name || "Unassigned",
    roomTypeId: room.room_type_id,
    roomTypeName: room.room_type_name,
    sizeM2: room.size_m2,
    bedType: room.bed_type,
    maxGuests: room.max_guests || 3,
    description: room.description,
    rateKobo: room.base_rate_kobo,
    images: roomImages(room.photos_json),
    activeReservations: activeReservationsByUnit.get(room.id) || 0,
  }));
}

function roomImages(value) {
  if (Array.isArray(value)) return value.filter((image) => typeof image === "string");
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((image) => typeof image === "string") : [];
  } catch {
    return [];
  }
}

async function getRoom(id, connection = database) {
  return connection.get(`
    SELECT units.id, units.number, units.status, units.room_type_id, units.location_id,
           room_types.base_rate_kobo, room_types.max_guests
    FROM units
    JOIN room_types ON room_types.id = units.room_type_id
    WHERE units.id = ? AND units.property_id = ?
      AND units.deleted_at IS NULL AND room_types.deleted_at IS NULL
  `, [id, propertyId]);
}

async function updateRoomDetails(request, id) {
  const room = await getRoom(id);
  if (!room) throw Object.assign(new Error("Room not found."), { status: 404 });
  const before = (await listRooms()).find((item) => item.id === room.id);
  const values = cleanRoomValues(request.body);
  const image = parseImage(request.body);
  const floor = request.body.floor === "" || request.body.floor == null ? null : Number(request.body.floor);
  if (floor !== null && (!Number.isInteger(floor) || floor < 0)) throw Object.assign(new Error("Enter a valid floor."), { status: 400 });
  const location = await database.get("SELECT id FROM property_locations WHERE id = ? AND property_id = ? AND kind = 'accommodation' AND active = 1", [values.locationId, propertyId]);
  if (!location) throw Object.assign(new Error("Choose Building 1 or Building 2 for this room."), { status: 400 });
  await database.withTransaction(async (transaction) => {
    await transaction.run(`
      UPDATE room_types SET name = ?, size_m2 = ?, bed_type = ?, max_guests = ?, description = ?, base_rate_kobo = ?, updated_at = CURRENT_TIMESTAMP
      ${image ? ", photos_json = ?" : ""}
      WHERE id = ? AND property_id = ?
    `, [...[values.name, values.sizeM2, values.bedType, values.maxGuests, values.description, values.rateKobo],
      ...(image ? [JSON.stringify([image])] : []), room.room_type_id, propertyId]);
    await transaction.run(`UPDATE units SET name = ?, number = ?, floor = ?, location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?`,
      [values.name, values.number, floor, values.locationId, room.id, propertyId]);
  });
  const updated = (await listRooms()).find((item) => item.id === room.id);
  await writeAudit(request, "room", room.id, "updated", before, updated);
  return updated;
}

function parseImage(body) {
  if (body.imageUrl) {
    const imageUrl = String(body.imageUrl).trim();
    if (!/^https:\/\//i.test(imageUrl)) {
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
  return body.imageDataUrl;
}

function cleanRoomValues(body) {
  const name = String(body.name || "").trim();
  const number = String(body.number || "").trim();
  const rateNaira = Number(body.rateNaira);
  const maxGuests = Number(body.maxGuests);
  const sizeM2 = Number(body.sizeM2 || 0);
  if (!name || !number) throw Object.assign(new Error("Enter a room name and room number."), { status: 400 });
  if (!Number.isFinite(rateNaira) || rateNaira <= 0) throw Object.assign(new Error("Enter a nightly rate greater than zero."), { status: 400 });
  if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 20) throw Object.assign(new Error("Maximum guests must be between 1 and 20."), { status: 400 });
  if (!Number.isFinite(sizeM2) || sizeM2 < 0 || sizeM2 > 10000) throw Object.assign(new Error("Enter a valid room size."), { status: 400 });
  const bedType = String(body.bedType || "").trim();
  if (!bedType) throw Object.assign(new Error("Enter the bed type."), { status: 400 });
  return { name, number, locationId: String(body.locationId || "").trim(), rateKobo: Math.round(rateNaira * 100), maxGuests, sizeM2, bedType, description: String(body.description || "").trim() };
}

function sendError(response, error) {
  response.status(error.status || 500).json({ error: error.message || "Request failed." });
}

async function writeAudit(request, entity, entityId, action, before, after, connection = database) {
  await connection.run(`
    INSERT INTO audit_logs (id, property_id, user_id, entity, entity_id, action, old_json, new_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [`AUD-${crypto.randomUUID()}`, propertyId, request.user?.id || null, entity, entityId, action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]);
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/rooms", async (_request, response) => {
  response.json(await listRooms());
});

app.post("/api/rooms", async (request, response) => {
  try {
    if (request.body?.action === "update") {
      if (!['manager', 'ceo'].includes(request.user.role)) {
        return response.status(403).json({ error: "Only a manager or admin can edit room details." });
      }
      return response.json(await updateRoomDetails(request, request.body.roomId));
    }
    if (request.user.role !== "ceo") return response.status(403).json({ error: "Only an admin can create rooms." });
    const values = cleanRoomValues(request.body);
    const location = await database.get("SELECT id FROM property_locations WHERE id = ? AND property_id = ? AND kind = 'accommodation' AND active = 1", [values.locationId, propertyId]);
    if (!location) return response.status(400).json({ error: "Choose Building 1 or Building 2 for this room." });
    const image = parseImage(request.body);
    const idSuffix = crypto.randomUUID();
    const roomTypeId = `RT-${idSuffix}`;
    const unitId = `ROOM-${idSuffix}`;
    const floor = request.body.floor === "" || request.body.floor == null ? null : Number(request.body.floor);
    if (floor !== null && (!Number.isInteger(floor) || floor < 0)) return response.status(400).json({ error: "Enter a valid floor." });
    await database.withTransaction(async (transaction) => {
      await transaction.run(`
        INSERT INTO room_types (id, property_id, name, size_m2, bed_type, max_guests, description, base_rate_kobo, photos_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [roomTypeId, propertyId, values.name, values.sizeM2, values.bedType, values.maxGuests, values.description,
        values.rateKobo, JSON.stringify(image ? [image] : [])]);
      await transaction.run(`
        INSERT INTO units (id, property_id, name, number, floor, room_type_id, location_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [unitId, propertyId, values.name, values.number, floor, roomTypeId, values.locationId]);
    });
    const room = (await listRooms()).find((item) => item.id === unitId);
    await writeAudit(request, "room", unitId, "created", null, room);
    response.status(201).json(room);
  } catch (error) {
    sendError(response, error);
  }
});

app.patch("/api/rooms/:id", async (request, response) => {
  try {
    if (!['manager', 'ceo'].includes(request.user.role)) {
      return response.status(403).json({ error: "Only a manager or admin can edit room details." });
    }
    response.json(await updateRoomDetails(request, request.params.id));
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/rooms/:id", async (request, response) => {
  if (request.user.role !== "ceo") return response.status(403).json({ error: "Only an admin can delete rooms." });
  try {
    const room = await getRoom(request.params.id);
    if (!room) return response.status(404).json({ error: "Room not found." });
    const booking = await database.get(`
      SELECT id FROM bookings WHERE unit_id = ? AND property_id = ? AND deleted_at IS NULL
        AND status IN ('hold', 'confirmed', 'checked_in') LIMIT 1
    `, [room.id, propertyId]);
    if (booking) return response.status(409).json({ error: "This room has an active reservation. Cancel or move it before deleting the room." });
    const before = (await listRooms()).find((item) => item.id === room.id);
    await database.withTransaction(async (transaction) => {
      await transaction.run("UPDATE units SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?", [room.id, propertyId]);
      await transaction.run(`
        UPDATE room_types SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND property_id = ? AND NOT EXISTS (
          SELECT 1 FROM units WHERE room_type_id = ? AND property_id = ? AND deleted_at IS NULL
        )
      `, [room.room_type_id, propertyId, room.room_type_id, propertyId]);
    });
    await writeAudit(request, "room", room.id, "deleted", before, null);
    response.json({ id: room.id, roomTypeId: room.room_type_id, deleted: true });
  } catch (error) {
    sendError(response, error);
  }
});

app.patch("/api/rooms/:id/status", async (request, response) => {
  if (!['manager', 'ceo'].includes(request.user.role)) {
    return response.status(403).json({ error: "Only a manager or admin can change room status." });
  }
  const statuses = ["available", "occupied", "dirty", "cleaning", "inspected", "out_of_order"];
  const { status } = request.body;
  if (!statuses.includes(status)) return response.status(400).json({ error: "Invalid room status." });
  const before = (await listRooms()).find((room) => room.id === request.params.id);
  const update = await database.run(`
    UPDATE units SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ? AND deleted_at IS NULL
  `, [status, request.params.id, propertyId]);
  if (!update.changes) return response.status(404).json({ error: "Room not found." });
  const updated = (await listRooms()).find((room) => room.id === request.params.id);
  await writeAudit(request, "room", request.params.id, "status_changed", before, updated);
  response.json(updated);
});

app.get("/api/blocks", async (_request, response) => {
  const blocks = (await database.all(`
    SELECT id, unit_id, start_date, end_date, reason
    FROM out_of_order_blocks
    WHERE property_id = ? AND deleted_at IS NULL
    ORDER BY start_date
  `, [propertyId])).map((block) => ({
    id: block.id,
    unitId: block.unit_id,
    start: block.start_date,
    end: block.end_date,
    reason: block.reason,
    databaseBlock: true,
  }));
  response.json(blocks);
});

app.post("/api/rooms/:id/blocks", async (request, response) => {
  if (!["manager", "ceo"].includes(request.user.role)) {
    return response.status(403).json({ error: "Only a manager or admin can block room dates." });
  }
  const room = await getRoom(request.params.id);
  const { start, end, reason } = request.body;
  if (!room) return response.status(404).json({ error: "Room not found." });
  if (!start || !end || end <= start || !String(reason || "").trim()) {
    return response.status(400).json({ error: "Enter a valid date range and reason." });
  }
  const insert = database.withTransaction(async (transaction) => {
    const booking = await transaction.get(`
      SELECT id FROM bookings
      WHERE unit_id = ? AND deleted_at IS NULL
        AND status IN ('hold', 'confirmed', 'checked_in')
        AND check_in < ? AND check_out > ?
      LIMIT 1
    `, [room.id, end, start]);
    if (booking) throw Object.assign(new Error("Move overlapping reservations before blocking this room."), { status: 409 });
    const block = {
      id: `BLK-${crypto.randomUUID()}`,
      unitId: room.id,
      start,
      end,
      reason: String(reason).trim(),
    };
    await transaction.run(`
      INSERT INTO out_of_order_blocks (
        id, property_id, unit_id, start_date, end_date, reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [block.id, propertyId, block.unitId, block.start, block.end, block.reason]);
    await writeAudit(request, "room_block", block.id, "created", null, block);
    return block;
  });
  try {
    response.status(201).json(await insert);
  } catch (error) {
    sendError(response, error);
  }
});

export async function readReservations(database, propertyId) {
  const reservationRows = await database.all(`
    SELECT bookings.*, guests.full_name, guests.phone, guests.email, guests.nationality,
          guests.id_number, guests.loyalty_tier, guests.points,
          COALESCE(payment_totals.paid_kobo, 0) AS paid_kobo
    FROM bookings
    JOIN guests ON guests.id = bookings.guest_id
    LEFT JOIN (
      SELECT booking_id,
             SUM(CASE WHEN status IN ('paid', 'refunded', 'part_refunded') THEN amount_kobo ELSE 0 END) AS paid_kobo
      FROM payments WHERE deleted_at IS NULL GROUP BY booking_id
    ) AS payment_totals ON payment_totals.booking_id = bookings.id
    WHERE bookings.property_id = ? AND bookings.deleted_at IS NULL
    ORDER BY bookings.created_at DESC
  `, [propertyId]);
  return reservationRows.map((booking) => ({
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
    totalKobo: Number(booking.total_kobo || 0),
    paidKobo: Number(booking.paid_kobo || 0),
    discountKobo: Number(booking.discount_kobo || 0),
    subtotalKobo: Number(booking.subtotal_kobo || 0),
    serviceKobo: Number(booking.service_kobo || 0),
    vatKobo: Number(booking.vat_kobo || 0),
  }));
}

app.get("/api/reservations", async (_request, response) => {
  response.json(await readReservations(database, propertyId));
});

app.patch("/api/reservations/:id/status", async (request, response) => {
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
    const result = await database.withTransaction(async (transaction) => {
      const booking = await transaction.getForUpdate(`
        SELECT *
        FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL
      `, [request.params.id, propertyId]);
      if (!booking) throw Object.assign(new Error("Reservation not found."), { status: 404 });
      if (workerCheckout) {
        const { date, time } = getLagosDateTime();
        const invoice = await transaction.getForUpdate(`
          SELECT COALESCE(sum(max(0, total_kobo - paid_kobo)), 0) AS balance_kobo
          FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL
        `, [request.params.id, propertyId]);
        if (!workerMayCheckOut(booking.status, booking.check_out, date, time, Number(invoice?.balance_kobo || 0))) {
          throw Object.assign(new Error("Staff can check out a guest due today after noon, once the balance is paid."), { status: 409 });
        }
      }
      const room = await transaction.get(`
        SELECT units.id, units.number, units.status, units.room_type_id,
               room_types.base_rate_kobo, room_types.max_guests
        FROM units JOIN room_types ON room_types.id = units.room_type_id
        WHERE units.id = ? AND units.property_id = ? AND units.deleted_at IS NULL AND room_types.deleted_at IS NULL
      `, [booking.unit_id, propertyId]);
      if (status === "checked_in" && !["available", "inspected"].includes(room?.status)) {
        throw Object.assign(new Error("This room is not ready for check-in."), { status: 409 });
      }
      if (["hold", "confirmed", "checked_in"].includes(status) && room?.status === "out_of_order") {
        throw Object.assign(new Error("This room is out of order."), { status: 409 });
      }
      if (["hold", "confirmed", "checked_in"].includes(status)) {
        const conflict = await transaction.get(`
          SELECT id FROM bookings
          WHERE unit_id = ? AND id != ? AND deleted_at IS NULL
            AND status IN ('hold', 'confirmed', 'checked_in')
            AND check_in < ? AND check_out > ?
          LIMIT 1
        `, [booking.unit_id, request.params.id, booking.check_out, booking.check_in]);
        const block = await transaction.get(`
          SELECT id FROM out_of_order_blocks
          WHERE unit_id = ? AND deleted_at IS NULL
            AND start_date < ? AND end_date > ?
          LIMIT 1
        `, [booking.unit_id, booking.check_out, booking.check_in]);
        if (conflict || block) throw Object.assign(new Error("This reservation no longer fits the room availability."), { status: 409 });
      }
      await transaction.run(`
        UPDATE bookings SET status = ?, cancellation_reason = ?,
          checked_in_at = CASE WHEN ? = 'checked_in' THEN CURRENT_TIMESTAMP ELSE checked_in_at END,
          checked_out_at = CASE WHEN ? = 'checked_out' THEN CURRENT_TIMESTAMP ELSE checked_out_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND property_id = ?
      `, [status, status === "cancelled" ? String(reason).trim() : null,
        status, status, request.params.id, propertyId]);
      if (status === "checked_in" || status === "checked_out") {
        const roomBefore = room;
        await transaction.run(`
          UPDATE units SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND property_id = ? AND deleted_at IS NULL
        `, [status === "checked_in" ? "occupied" : "dirty", booking.unit_id, propertyId]);
        const roomAfter = await transaction.get(`
          SELECT units.id, units.number, units.status, units.room_type_id,
                 room_types.base_rate_kobo, room_types.max_guests
          FROM units JOIN room_types ON room_types.id = units.room_type_id
          WHERE units.id = ? AND units.property_id = ?
        `, [booking.unit_id, propertyId]);
        await writeAudit(request, "room", booking.unit_id, "status_changed", roomBefore, roomAfter, transaction);
      }
      let housekeepingTask = null;
      if (status === "checked_out" && booking.status !== "checked_out") {
        const nextArrival = await transaction.get(`
          SELECT id FROM bookings WHERE unit_id = ? AND check_in = ?
            AND status IN ('hold', 'confirmed') AND deleted_at IS NULL LIMIT 1
        `, [booking.unit_id, booking.check_out]);
        const taskId = `HK-${crypto.randomUUID()}`;
        await transaction.run(`
          INSERT INTO housekeeping_tasks (
            id, property_id, unit_id, booking_id, type, status, priority,
            assigned_to_label, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Checkout clean', 'open', ?, 'Unassigned', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [taskId, propertyId, booking.unit_id, request.params.id, nextArrival ? "high" : "medium"]);
        housekeepingTask = await transaction.get("SELECT * FROM housekeeping_tasks WHERE id = ?", [taskId]);
      }
      const refunds = [];
      if (status === "cancelled" && requestedRefund > 0) {
        let remaining = requestedRefund;
        const originalPayments = await transaction.all(`
          SELECT * FROM payments
          WHERE booking_id = ? AND property_id = ? AND amount_kobo > 0
            AND status IN ('paid', 'part_refunded') AND deleted_at IS NULL
          ORDER BY created_at DESC
        `, [request.params.id, propertyId]);
        for (const payment of originalPayments) {
          const alreadyRefundedRow = await transaction.get(`
            SELECT COALESCE(sum(-amount_kobo), 0) AS amount
            FROM payments WHERE original_payment_id = ? AND status = 'refunded' AND deleted_at IS NULL
          `, [payment.id]);
          const alreadyRefunded = Number(alreadyRefundedRow.amount);
          const amount = Math.min(remaining, payment.amount_kobo - alreadyRefunded);
          if (amount <= 0) continue;
          const refundId = `PAY-${crypto.randomUUID()}`;
          await transaction.run(`
            INSERT INTO payments (
              id, property_id, booking_id, invoice_id, method, amount_kobo,
              reference, status, original_payment_id, paid_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'refund', ?, ?, 'refunded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [refundId, propertyId, request.params.id, payment.invoice_id, -amount, `REF-${crypto.randomUUID()}`, payment.id]);
          const newRefundedTotal = alreadyRefunded + amount;
          await transaction.run("UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newRefundedTotal >= payment.amount_kobo ? "refunded" : "part_refunded", payment.id]);
          refunds.push(await transaction.get("SELECT * FROM payments WHERE id = ?", [refundId]));
          remaining -= amount;
          if (remaining === 0) break;
        }
        if (remaining > 0) throw Object.assign(new Error("Refund exceeds collected database payments."), { status: 409 });
        const invoice = await transaction.getForUpdate("SELECT id, paid_kobo FROM invoices WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL", [request.params.id, propertyId]);
        if (invoice) await transaction.run("UPDATE invoices SET paid_kobo = ?, status = 'issued', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [Math.max(0, Number(invoice.paid_kobo) - requestedRefund), invoice.id]);
        for (const refund of refunds) {
          await writeAudit(request, "payment", refund.id, "cancel_refund", null, refund, transaction);
        }
      }
      const updatedBooking = await transaction.get("SELECT * FROM bookings WHERE id = ? AND property_id = ?", [request.params.id, propertyId]);
      await writeAudit(request, "reservation", request.params.id, status, booking, updatedBooking, transaction);
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
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
});

async function validateReservation(input, existingId = null, connection = database) {
  const room = await getRoom(input.unitId, connection);
  if (!room) throw Object.assign(new Error("Choose a room from the active room list."), { status: 400 });
  if (room.status === "out_of_order") throw Object.assign(new Error("This room is out of order and cannot be reserved."), { status: 409 });
  const checkIn = String(input.checkIn || "");
  const checkOut = String(input.checkOut || "");
  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
  if (!Number.isInteger(nights) || nights < 1) throw Object.assign(new Error("Choose valid check-in and check-out dates."), { status: 400 });
  const adults = Number(input.adults);
  const children = Number(input.children || 0);
  const maxGuests = Number(room.max_guests || 3);
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0 || adults + children > maxGuests) {
    throw Object.assign(new Error(`This room accommodates a maximum of ${maxGuests} guests.`), { status: 400 });
  }
  if (!room.base_rate_kobo) throw Object.assign(new Error("Set this room's nightly rate before booking."), { status: 409 });
  const conflict = await findBookingConflictAsync(connection, input.unitId, checkIn, checkOut, existingId);
  if (conflict) throw Object.assign(new Error("This room already has a reservation during those dates."), { status: 409 });
  const blocked = await connection.get(`
    SELECT id FROM out_of_order_blocks
    WHERE unit_id = ? AND deleted_at IS NULL
      AND start_date < ? AND end_date > ?
    LIMIT 1
  `, [input.unitId, checkOut, checkIn]);
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

async function saveReservation(input, request, existingId = null) {
  const reservationId = existingId || `BA-B${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
  return database.withTransaction(async (transaction) => {
    const before = existingId
      ? await transaction.getForUpdate("SELECT * FROM bookings WHERE id = ? AND property_id = ? AND deleted_at IS NULL", [existingId, propertyId])
      : null;
    const quote = await validateReservation(input, existingId, transaction);
    const guest = input.guest;
    if (!guest?.name || !guest?.phone) throw Object.assign(new Error("Guest name and phone are required."), { status: 400 });
    const guestId = String(input.guestId || guest.id || `guest_${crypto.randomUUID()}`);
    await transaction.run(`
      INSERT OR IGNORE INTO guests (
        id, property_id, full_name, phone, email, nationality, id_number,
        loyalty_tier, points, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [guestId, propertyId, guest.name, guest.phone, guest.email || null,
      guest.nationality || null, guest.idNumber || null, guest.tier || "Silver", Number(guest.points || 0)]);
    const status = ["hold", "confirmed"].includes(input.status) ? input.status : "confirmed";
    const values = [
      input.unitId, quote.room.room_type_id, input.checkIn, input.checkOut,
      quote.nights, Number(input.adults), Number(input.children || 0), status,
      input.source || "Walk-in", input.requests || null, quote.room.base_rate_kobo,
      quote.subtotalKobo, quote.discountKobo, quote.vatKobo,
      quote.serviceKobo, quote.totalKobo,
    ];
    if (existingId) {
      const result = await transaction.run(`
        UPDATE bookings SET unit_id = ?, room_type_id = ?, check_in = ?, check_out = ?,
          nights = ?, adults = ?, children = ?, status = ?, source = ?, requests = ?,
          rate_kobo = ?, subtotal_kobo = ?, discount_kobo = ?, vat_kobo = ?,
          service_kobo = ?, total_kobo = ?, guest_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND property_id = ? AND deleted_at IS NULL
      `, [...values, guestId, existingId, propertyId]);
      if (!result.changes) throw Object.assign(new Error("Reservation not found."), { status: 404 });
      await transaction.run(`
        UPDATE invoices SET total_kobo = ?,
          status = CASE WHEN paid_kobo >= ? THEN 'paid' ELSE 'issued' END,
          updated_at = CURRENT_TIMESTAMP
        WHERE booking_id = ? AND property_id = ? AND deleted_at IS NULL
      `, [quote.totalKobo, quote.totalKobo, existingId, propertyId]);
    } else {
      await transaction.run(`
        INSERT INTO bookings (
          id, property_id, guest_id, unit_id, room_type_id, check_in, check_out,
          nights, adults, children, status, source, requests, rate_kobo,
          subtotal_kobo, discount_kobo, vat_kobo, service_kobo, total_kobo,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [reservationId, propertyId, guestId, ...values]);
      await transaction.run(`
        INSERT INTO invoices (
          id, property_id, booking_id, number, issue_date, due_date,
          total_kobo, paid_kobo, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [`INV-${crypto.randomUUID()}`, propertyId, reservationId,
        `BA-INV-${reservationId}`, input.checkIn, input.checkIn, quote.totalKobo]);
    }
    const saved = await transaction.get("SELECT * FROM bookings WHERE id = ? AND property_id = ?", [reservationId, propertyId]);
    await writeAudit(request, "reservation", reservationId, existingId ? "updated" : "created", before, saved, transaction);
    return reservationId;
  });
}

app.post("/api/public/reservations", async (request, response) => {
  try {
    const roomTypeId = String(request.body.roomTypeId || "").trim();
    const name = String(request.body.name || "").trim();
    const phone = String(request.body.phone || "").trim();
    const email = String(request.body.email || "").trim();
    const checkIn = String(request.body.checkIn || "");
    const checkOut = String(request.body.checkOut || "");
    const adults = Number(request.body.adults || 1);
    const children = Number(request.body.children || 0);
    if (!roomTypeId) return response.status(400).json({ error: "Choose a room type." });
    if (!name || !phone) return response.status(400).json({ error: "Enter your name and phone number." });
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Lagos" }).format(new Date());
    if (checkIn < today) return response.status(400).json({ error: "Choose today or a future check-in date." });
    if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
      return response.status(400).json({ error: "Enter a valid number of adults and children." });
    }

    const candidates = await database.all(`
      SELECT units.id, room_types.max_guests
      FROM units
      JOIN room_types ON room_types.id = units.room_type_id AND room_types.property_id = units.property_id
      WHERE units.property_id = ? AND room_types.id = ?
        AND units.deleted_at IS NULL AND room_types.deleted_at IS NULL
        AND units.status <> 'out_of_order'
      ORDER BY CASE WHEN units.status = 'available' THEN 0 WHEN units.status = 'inspected' THEN 1 ELSE 2 END, units.number
    `, [propertyId, roomTypeId]);
    const eligibleUnits = candidates.filter((unit) => adults + children <= Number(unit.max_guests || 3));
    if (!eligibleUnits.length) {
      return response.status(candidates.length ? 400 : 404).json({
        error: candidates.length ? "This room type does not have capacity for this group." : "This room type is no longer available.",
      });
    }

    const existingGuest = await database.get(
      "SELECT id FROM guests WHERE property_id = ? AND phone = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
      [propertyId, phone],
    );
    const input = {
      ...request.body,
      guestId: existingGuest?.id,
      guest: { name, phone, email },
      checkIn,
      checkOut,
      adults,
      children,
      status: "confirmed",
      source: "Website",
      requests: String(request.body.requests || "").trim(),
      discountKobo: 0,
      servicePercent: 0,
      vatPercent: 0,
    };
    let lastAvailabilityError = null;
    for (const unit of eligibleUnits) {
      try {
        const id = await saveReservation({ ...input, unitId: unit.id }, request);
        return response.status(201).json({ id, status: "confirmed" });
      } catch (error) {
        if (error.status !== 409) throw error;
        lastAvailabilityError = error;
      }
    }
    throw Object.assign(new Error(lastAvailabilityError?.message || "No rooms of this type are available for those dates."), { status: 409 });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/reservations", async (request, response) => {
  try {
    const id = await saveReservation(request.body, request);
    response.status(201).json({ id });
  } catch (error) {
    sendError(response, error);
  }
});

app.put("/api/reservations/:id", async (request, response) => {
  if (!['manager', 'ceo'].includes(request.user.role)) {
    return response.status(403).json({ error: "Only a manager or admin can edit reservations." });
  }
  try {
    const id = await saveReservation(request.body, request, request.params.id);
    response.json({ id });
  } catch (error) {
    sendError(response, error);
  }
});

registerOperationsRoutes(app, database, propertyId);
registerFnbRoutes(app, database, propertyId);
registerWorkspaceRoutes(app, database, propertyId);
registerReservationWorkflowRoutes(app, database, propertyId);

const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");
const rootIndexFile = path.join(root, "index.html");

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

app.get(/^(?!\/api\/).*$/, (request, response, next) => {
  if (request.path.includes(".")) return next();
  const target = fs.existsSync(path.join(distDir, "index.html"))
    ? path.join(distDir, "index.html")
    : rootIndexFile;
  return response.sendFile(target);
});

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Boms Apartment API listening on http://127.0.0.1:${port}`);
  });
}

export default app;
