export function registerPublicWebsiteRoutes(app, database, propertyId) {
  const fallbackRooms = [
    {
      id: "studio-suite",
      name: "Azure",
      sizeM2: 42,
      bedType: "King bed",
      maxGuests: 3,
      description: "A comfortable stay at Boms Apartment.",
      rateKobo: 2000000,
      images: ["https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80"],
    },
    {
      id: "comfort-room",
      name: "Comfort",
      sizeM2: 38,
      bedType: "Queen bed",
      maxGuests: 3,
      description: "A comfortable stay at Boms Apartment.",
      rateKobo: 2500000,
      images: ["https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80&sat=-25"],
    },
    {
      id: "diamond-room",
      name: "Diamond",
      sizeM2: 41,
      bedType: "King bed",
      maxGuests: 3,
      description: "A comfortable stay at Boms Apartment.",
      rateKobo: 2000000,
      images: ["https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1200&q=80"],
    },
  ];
  const fallbackRatesByName = new Map(
    fallbackRooms.map((room) => [room.name, room.rateKobo]),
  );

  app.get("/api/public/rooms", async (_request, response) => {
    const livePromise = (async () => {
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

      return rows.map((room) => {
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
          rateKobo: Number(room.base_rate_kobo || fallbackRatesByName.get(room.name) || 0),
          images,
        };
      });
    })();

    const timeoutMs = Number(process.env.PUBLIC_ROOMS_TIMEOUT_MS || 4500);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error("Room information is unavailable."), { status: 200 })), timeoutMs);
    });

    try {
      const rooms = await Promise.race([livePromise, timeoutPromise]);
      response.json(rooms);
    } catch {
      response.json(fallbackRooms);
    }
  });
}
