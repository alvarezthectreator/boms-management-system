BEGIN IMMEDIATE;

WITH room_names(name, slug) AS (
  VALUES
    ('Pearl', 'pearl'),
    ('Silver', 'silver'),
    ('Gold', 'gold'),
    ('Royal', 'royal'),
    ('Diamond', 'diamond'),
    ('Emerald', 'emerald'),
    ('Ruby', 'ruby'),
    ('Oasis', 'oasis'),
    ('Harmony', 'harmony'),
    ('Azure', 'azure'),
    ('Prestige', 'prestige'),
    ('Comfort', 'comfort'),
    ('Grand', 'grand')
)
INSERT OR IGNORE INTO room_types (
  id,
  property_id,
  name,
  created_at,
  updated_at
)
SELECT
  'room_type_' || room_names.slug,
  properties.id,
  room_names.name,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM room_names
CROSS JOIN properties
WHERE properties.id = 'property_boms';

WITH room_names(name, slug) AS (
  VALUES
    ('Pearl', 'pearl'),
    ('Silver', 'silver'),
    ('Gold', 'gold'),
    ('Royal', 'royal'),
    ('Diamond', 'diamond'),
    ('Emerald', 'emerald'),
    ('Ruby', 'ruby'),
    ('Oasis', 'oasis'),
    ('Harmony', 'harmony'),
    ('Azure', 'azure'),
    ('Prestige', 'prestige'),
    ('Comfort', 'comfort'),
    ('Grand', 'grand')
)
INSERT OR IGNORE INTO units (
  id,
  property_id,
  name,
  number,
  room_type_id,
  status,
  created_at,
  updated_at
)
SELECT
  'unit_' || room_names.slug,
  properties.id,
  room_names.name,
  room_names.name,
  'room_type_' || room_names.slug,
  'available',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM room_names
CROSS JOIN properties
WHERE properties.id = 'property_boms';

UPDATE units
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'unit_rugby';

UPDATE room_types
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'room_type_rugby';

COMMIT;
