UPDATE room_types
SET max_guests = 3,
    photos_json = CASE name
      WHEN 'Pearl' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Silver' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Gold' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Royal' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Diamond' THEN CASE WHEN photos_json = '[]' OR photos_json LIKE '%1566665797738-1674de7a421a%' THEN '["https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Emerald' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Ruby' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Oasis' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Harmony' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Azure' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80"]' ELSE photos_json END
      WHEN 'Prestige' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80&sat=-20"]' ELSE photos_json END
      WHEN 'Comfort' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80&sat=-25"]' ELSE photos_json END
      WHEN 'Grand' THEN CASE WHEN photos_json = '[]' THEN '["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80&sat=-35"]' ELSE photos_json END
      ELSE photos_json
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE property_id = 'property_boms'
  AND deleted_at IS NULL;
