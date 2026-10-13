export function registerPublicWebsiteRoutes(app, database, propertyId) {
  app.get("/api/public/rooms", async (_request, response) => {
    try {
      const rows = await database.all(`
        SELECT room_types.id, room_types.name, room_types.size_m2,
               room_types.bed_type, room_types.max_guests,
               room_types.description, room_types.base_rate_kobo,
               room_types.photos_json
        FROM room_types
        WHERE room_types.property_id = ?
          AND room_types.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM units
            WHERE units.room_type_id = room_types.id
              AND units.property_id = room_types.property_id
              AND units.deleted_at IS NULL
          )
        ORDER BY room_types.name
      `, [propertyId]);
      response.json(rows.map((room) => {
        let images = [];
        try {
          const parsed = JSON.parse(room.photos_json || "[]");
          if (Array.isArray(parsed)) images = parsed.filter((image) => typeof image === "string");
        } catch {
          images = [];
        }
        return {
          id: room.id,
          name: room.name,
          sizeM2: Number(room.size_m2 || 0),
          bedType: room.bed_type || "",
          maxGuests: Number(room.max_guests || 2),
          description: room.description || "",
          rateKobo: Number(room.base_rate_kobo || 0),
          images,
        };
      }));
    } catch {
      response.status(500).json({ error: "Room information is unavailable." });
    }
  });
}