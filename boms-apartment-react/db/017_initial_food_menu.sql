-- Can run on its own; adds image_url if migration 016 has not run yet.
-- Prices are NGN converted to kobo. Rerunning updates the same stable item IDs.
-- Menu items remain unavailable for ordering until recipes are linked to real inventory.

BEGIN;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_location_id TEXT;

WITH category AS (
  INSERT INTO public.menu_categories (
    id, property_id, name, station, active, created_at, updated_at
  )
  VALUES (
    'CAT-BOMS-FOOD-MENU', 'property_boms', 'Meals', 'kitchen', 1, NOW(), NOW()
  )
  ON CONFLICT (property_id, name) DO UPDATE
    SET station = EXCLUDED.station,
        active = 1,
        updated_at = NOW()
  RETURNING id
), menu_rows(id, name, price_kobo, image_url) AS (
  VALUES
    ('MENU-BOMS-NOODLES', 'Noodles', 300000, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-RICE-STEW', 'Rice and stew', 400000, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-JOLLOF-RICE', 'Jollof rice', 400000, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-FISH-PEPPER-SOUP', 'Fish pepper soup', 400000, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-CHICKEN-PEPPER-SOUP', 'Chicken pepper soup', 450000, 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-AFANG-SOUP', 'Afang soup', 500000, 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-EGUSI-SOUP', 'Egusi soup', 500000, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-NATIVE-SOUP', 'Native soup', 500000, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80'),
    ('MENU-BOMS-PASTA', 'Pasta', 500000, 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80')
)
INSERT INTO public.menu_items (
  id, property_id, category_id, name, description, image_url, fulfillment_location_id, price_kobo,
  station, available, created_at, updated_at, deleted_at
)
SELECT
  menu_rows.id,
  'property_boms',
  category.id,
  menu_rows.name,
  NULL,
  menu_rows.image_url,
  'location-building-2',
  menu_rows.price_kobo,
  'kitchen',
  1,
  NOW(),
  NOW(),
  NULL
FROM menu_rows
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