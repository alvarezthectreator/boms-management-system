import assert from "node:assert/strict";
import test from "node:test";
import { buildDeskWorkerDashboardSummary, buildRouteForPage, calculateQuote, createInitialData, defaultCheckoutDate, featuredFoodMenu, nightsBetween, resolvePageFromRoute } from "../src/data.js";

test("routes resolve to stable page URLs", () => {
  assert.equal(buildRouteForPage("dashboard"), "/dashboard");
  assert.equal(buildRouteForPage("bookings"), "/bookings");
  assert.equal(resolvePageFromRoute("/bookings"), "bookings");
  assert.equal(resolvePageFromRoute("#/guests"), "guests");
  assert.equal(resolvePageFromRoute("/"), "dashboard");
});

test("room quotes default to zero service charge and VAT", () => {
  const settings = createInitialData().settings;
  const quote = calculateQuote(10000, 1, settings);
  assert.equal(settings.servicePercent, 0);
  assert.equal(settings.vatPercent, 0);
  assert.equal(quote.serviceKobo, 0);
  assert.equal(quote.vatKobo, 0);
  assert.equal(quote.totalKobo, quote.subtotalKobo);
});

test("default checkout is one night after check-in", () => {
  const checkIn = "2026-10-06";
  const checkOut = defaultCheckoutDate(checkIn);
  assert.equal(checkOut, "2026-10-07");
  assert.equal(nightsBetween(checkIn, checkOut), 1);
});

test("featured food menu contains the requested dishes with attributed photos", () => {
  assert.deepEqual(featuredFoodMenu.map((item) => item.name), [
    "Noodles",
    "Jollof rice",
    "Spaghetti",
    "White rice",
    "Chicken pepper soup",
    "Catfish pepper soup",
    "EA pepper soup",
    "Afang soup",
    "Egusi soup",
  ]);
  assert.ok(featuredFoodMenu.every((item) => item.imageUrl && item.imageCredit && item.imageSource));
});

test("desk worker summary counts distinct rooms occupied today", () => {
  const summary = buildDeskWorkerDashboardSummary({
    units: [
      { id: "room-1" },
      { id: "room-2" },
      { id: "room-3" },
      { id: "room-4" },
    ],
    bookings: [
      { unitId: "room-1", checkIn: "2026-10-06", checkOut: "2026-10-07", status: "confirmed" },
      { unitId: "room-1", checkIn: "2026-10-06", checkOut: "2026-10-08", status: "hold" },
      { unitId: "room-2", checkIn: "2026-10-05", checkOut: "2026-10-06", status: "checked_in" },
      { unitId: "room-3", checkIn: "2026-10-07", checkOut: "2026-10-08", status: "confirmed" },
      { unitId: "room-4", checkIn: "2026-10-05", checkOut: "2026-10-06", status: "checked_out" },
      { unitId: "unknown-room", checkIn: "2026-10-06", checkOut: "2026-10-08", status: "confirmed" },
    ],
  }, "2026-10-06");

  assert.equal(summary.roomsBookedToday, 2);
});

test("desk worker summary highlights arrivals, departures, and ready rooms", () => {
  const data = {
    bookings: [
      { id: "B1", guestId: "G1", unitId: "U1", checkIn: "2026-10-06", checkOut: "2026-10-08", status: "confirmed" },
      { id: "B2", guestId: "G2", unitId: "U2", checkIn: "2026-10-05", checkOut: "2026-10-06", status: "checked_in" },
      { id: "B3", guestId: "G3", unitId: "U3", checkIn: "2026-10-06", checkOut: "2026-10-07", status: "checked_in" },
      { id: "B4", guestId: "G4", unitId: "U4", checkIn: "2026-10-07", checkOut: "2026-10-08", status: "confirmed" },
      { id: "B5", guestId: "G5", unitId: "U5", checkIn: "2026-10-06", checkOut: "2026-10-06", status: "checked_in" },
    ],
    guests: [
      { id: "G1", name: "Guest 1" },
      { id: "G2", name: "Guest 2" },
      { id: "G3", name: "Guest 3" },
      { id: "G4", name: "Guest 4" },
      { id: "G5", name: "Guest 5" },
    ],
    units: [
      { id: "U1", number: "101", status: "available" },
      { id: "U2", number: "102", status: "dirty" },
      { id: "U3", number: "103", status: "inspected" },
      { id: "U4", number: "104", status: "out_of_order" },
      { id: "U5", number: "105", status: "occupied" },
    ],
    inventory: [
      { databaseItem: true, name: "Toilet roll", quantity: 2, minimum: 5 },
      { databaseItem: true, name: "Milk", quantity: 10, minimum: 5 },
    ],
    settings: { checkOutTime: "12:00" },
  };

  const summary = buildDeskWorkerDashboardSummary(data, "2026-10-06", "12:15");

  assert.equal(summary.arrivalsToday, 1);
  assert.equal(summary.departuresToday, 2);
  assert.equal(summary.readyRooms, 2);
  assert.equal(summary.lowStockItems, 1);
  assert.equal(summary.priorityActions, 2);
  assert.equal(summary.arrivalQueue[0].guestName, "Guest 1");
  assert.equal(summary.departureQueue[0].roomNumber, "102");
});
