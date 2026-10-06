ALTER TABLE fnb_orders
  ADD COLUMN service_kobo INTEGER NOT NULL DEFAULT 0 CHECK (service_kobo >= 0);
