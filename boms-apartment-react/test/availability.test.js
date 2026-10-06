import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { findBookingConflict } from "../availability.js";

test("booking conflict checks preserve exclusive checkout boundaries", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      status TEXT NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO bookings VALUES ('existing', 'room-1', '2026-10-05', '2026-10-08', 'confirmed', NULL);
    INSERT INTO bookings VALUES ('cancelled', 'room-1', '2026-10-09', '2026-10-11', 'cancelled', NULL);
    INSERT INTO bookings VALUES ('deleted', 'room-1', '2026-10-09', '2026-10-11', 'confirmed', '2026-10-01');
  `);

  assert.equal(findBookingConflict(database, "room-1", "2026-10-07", "2026-10-09")?.id, "existing");
  assert.equal(findBookingConflict(database, "room-1", "2026-10-08", "2026-10-09"), undefined);
  assert.equal(findBookingConflict(database, "room-1", "2026-10-09", "2026-10-10"), undefined);
  assert.equal(findBookingConflict(database, "room-1", "2026-10-06", "2026-10-07", "existing"), undefined);
  database.close();
});