export function findBookingConflict(database, unitId, checkIn, checkOut, existingId = null) {
  return database.prepare(`
    SELECT id FROM bookings
    WHERE unit_id = ? AND deleted_at IS NULL
      AND status IN ('hold', 'confirmed', 'checked_in')
      AND check_in < ? AND check_out > ? AND id != ?
    LIMIT 1
  `).get(unitId, checkOut, checkIn, existingId || "");
}

export async function findBookingConflictAsync(database, unitId, checkIn, checkOut, existingId = null) {
  return database.get(`
    SELECT id FROM bookings
    WHERE unit_id = ? AND deleted_at IS NULL
      AND status IN ('hold', 'confirmed', 'checked_in')
      AND check_in < ? AND check_out > ? AND id != ?
    LIMIT 1
  `, [unitId, checkOut, checkIn, existingId || ""]);
}