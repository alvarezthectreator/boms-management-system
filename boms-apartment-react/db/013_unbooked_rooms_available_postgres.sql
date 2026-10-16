BEGIN;

UPDATE units AS unit
SET status = 'available',
    updated_at = NOW()
WHERE unit.deleted_at IS NULL
  AND unit.status IS DISTINCT FROM 'out_of_order'
  AND unit.status IS DISTINCT FROM 'available'
  AND NOT EXISTS (
    SELECT 1
    FROM bookings AS booking
    WHERE booking.unit_id = unit.id
      AND booking.deleted_at IS NULL
      AND booking.status IN ('hold', 'confirmed', 'checked_in')
  );

COMMIT;