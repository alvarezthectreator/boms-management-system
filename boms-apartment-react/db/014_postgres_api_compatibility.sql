BEGIN;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS id_number TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_tier TEXT NOT NULL DEFAULT 'Silver',
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS room_type_id TEXT REFERENCES room_types(id),
  ADD COLUMN IF NOT EXISTS adults INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS requests TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS number TEXT,
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE bookings
SET room_type_id = units.room_type_id
FROM units
WHERE bookings.unit_id = units.id
  AND bookings.room_type_id IS NULL;

UPDATE guests SET loyalty_tier = 'Silver' WHERE loyalty_tier IS NULL;
UPDATE guests SET points = 0 WHERE points IS NULL;
UPDATE bookings SET adults = 1 WHERE adults IS NULL;
UPDATE bookings SET children = 0 WHERE children IS NULL;

COMMIT;