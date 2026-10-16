-- Draft mid-range Nigerian hotel/bar prices. These are estimates, not an official tariff.
-- Package assumptions: Hero 60cl, Desperados 45cl, Predator 40cl,
-- Hollandia 315ml, Maltina 33cl, Coke 50cl, Fanta 35cl.
-- Prices are editable later from Food & drink > Edit.
-- This seed adds menu rows and images only; link each drink to real inventory before ordering.

BEGIN;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_location_id TEXT;

WITH category AS (
  INSERT INTO public.menu_categories (
    id, property_id, name, station, active, created_at, updated_at
  )
  VALUES (
    'CAT-BOMS-DRINKS', 'property_boms', 'Drinks', 'bar', 1, NOW(), NOW()
  )
  ON CONFLICT (property_id, name) DO UPDATE
    SET station = EXCLUDED.station,
        active = 1,
        updated_at = NOW()
  RETURNING id
), drink_rows(id, name, description, price_kobo, image_url) AS (
  VALUES
    ('MENU-BOMS-HERO', 'Hero Lager 60cl', 'Hero Lager bottle, 60cl', 150000, 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-DESPERADOS', 'Desperados 45cl', 'Desperados bottle, 45cl', 350000, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-PREDATOR', 'Predator 40cl', 'Predator energy drink, 40cl', 150000, 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-HOLLANDIA', 'Hollandia 315ml', 'Hollandia yoghurt drink, 315ml', 150000, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-MALTINA', 'Maltina 33cl', 'Maltina malt drink, 33cl', 150000, 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-COKE', 'Coke 50cl', 'Coca-Cola bottle, 50cl', 100000, 'https://images.unsplash.com/photo-1527960471264-932f39eb5846?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-FANTA', 'Fanta 35cl', 'Fanta bottle, 35cl', 100000, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=80')
)
INSERT INTO public.menu_items (
  id, property_id, category_id, name, description, image_url, fulfillment_location_id, price_kobo,
  station, available, created_at, updated_at, deleted_at
)
SELECT
  drink_rows.id,
  'property_boms',
  category.id,
  drink_rows.name,
  drink_rows.description,
  drink_rows.image_url,
  'location-bar',
  drink_rows.price_kobo,
  'bar',
  1,
  NOW(),
  NOW(),
  NULL
FROM drink_rows
CROSS JOIN category
ON CONFLICT (id) DO UPDATE
  SET property_id = EXCLUDED.property_id,
      category_id = EXCLUDED.category_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      image_url = EXCLUDED.image_url,
      fulfillment_location_id = EXCLUDED.fulfillment_location_id,
      price_kobo = EXCLUDED.price_kobo,
      station = EXCLUDED.station,
      available = EXCLUDED.available,
      updated_at = NOW(),
      deleted_at = NULL;

COMMIT;