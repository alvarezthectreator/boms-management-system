UPDATE users
SET name = 'Ewilliam Ndamiye',
    updated_at = CURRENT_TIMESTAMP
WHERE property_id = 'property_boms'
  AND role = 'manager'
  AND (id = 'USR-002' OR name = 'Emeka Okoro');