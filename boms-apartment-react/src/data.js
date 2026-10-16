export function createInitialData() {
  return {
    roomTypes: [],
    rateRules: [],
    units: [],
    locations: [],
    guests: [],
    bookings: [],
    payments: [],
    invoices: [],
    tasks: [],
    inventory: [],
    stockMovements: [],
    suppliers: [],
    purchaseOrders: [],
    expenses: [],
    conversations: [],
    staffMessages: {},
    reviews: [],
    requests: [],
    users: [],
    settings: {
      checkInTime: "14:00",
      checkOutTime: "12:00",
      servicePercent: 0,
      vatPercent: 0,
      cancellationHours: 48,
      currency: "NGN",
    },
    blocks: [],
    auditLogs: [],
    dailyClosings: [],
  };
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) /
      86400000,
  );
}

export function defaultCheckoutDate(checkIn) {
  return new Date(Date.parse(`${checkIn}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
}

export function calculateQuote(
  rateKobo,
  nights,
  settings,
  extrasKobo = 0,
  discountKobo = 0,
) {
  const roomKobo = Math.max(
    0,
    Array.isArray(rateKobo)
      ? rateKobo.reduce((sum, nightlyRate) => sum + nightlyRate, 0)
      : rateKobo * nights,
  );
  const subtotalKobo = roomKobo + extrasKobo;
  const taxableKobo = Math.max(0, subtotalKobo - discountKobo);
  const serviceKobo = Math.round((taxableKobo * settings.servicePercent) / 100);
  const vatKobo = Math.round((taxableKobo * settings.vatPercent) / 100);
  return {
    nights,
    roomKobo,
    subtotalKobo,
    discountKobo,
    serviceKobo,
    vatKobo,
    totalKobo: taxableKobo + serviceKobo + vatKobo,
  };
}

export function getNightlyRates(unit, checkIn, nights, rateRules = []) {
  return Array.from({ length: nights }, (_, index) => {
    const date = new Date(
      Date.parse(`${checkIn}T00:00:00Z`) + index * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const matches = rateRules
      .filter(
        (rule) =>
          rule.roomTypeId === unit.roomTypeId &&
          rule.startDate <= date &&
          rule.endDate > date &&
          (!rule.minNights || nights >= rule.minNights),
      )
      .sort((left, right) => {
        const dateSpanDifference =
          Date.parse(left.endDate) -
          Date.parse(left.startDate) -
          (Date.parse(right.endDate) - Date.parse(right.startDate));
        if (dateSpanDifference) return dateSpanDifference;
        return (right.minNights || 0) - (left.minNights || 0);
      });
    return matches[0]?.rateKobo ?? unit.rateKobo;
  });
}

export function formatMoney(kobo) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(kobo) || 0) / 100);
}

export function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export const appRoutes = {
  dashboard: "/dashboard",
  bookings: "/bookings",
  guests: "/guests",
  rooms: "/rooms",
  calendar: "/calendar",
  housekeeping: "/housekeeping",
  restaurant: "/restaurant",
  inventory: "/inventory",
  purchasing: "/purchasing",
  payments: "/payments",
  financials: "/financials",
  weeklyReport: "/weekly-report",
  messages: "/messages",
  concierge: "/concierge",
  reviews: "/reviews",
  team: "/team",
  audit: "/audit",
};

export function buildRouteForPage(page = "dashboard") {
  return appRoutes[page] || appRoutes.dashboard;
}

export function resolvePageFromRoute(route = "") {
  const raw = String(route || "");
  const value = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
  const cleaned = value.replace(/^\/+|\/+$/g, "");
  if (!cleaned || cleaned === "login") return "dashboard";
  const match = Object.entries(appRoutes).find(([, url]) => url === `/${cleaned}`);
  return match ? match[0] : "dashboard";
}

export function buildDeskWorkerDashboardSummary(
  data = {},
  today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Lagos",
  }).format(new Date()),
  now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date()),
) {
  const bookings = Array.isArray(data.bookings) ? data.bookings : [];
  const units = Array.isArray(data.units) ? data.units : [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const guests = Array.isArray(data.guests) ? data.guests : [];

  const guestById = new Map(guests.map((guest) => [guest.id, guest]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const roomsBookedToday = new Set(bookings.filter((booking) =>
    unitById.has(booking.unitId) &&
    ["hold", "confirmed", "checked_in"].includes(booking.status) &&
    booking.checkIn <= today &&
    (booking.checkOut > today || (booking.status === "checked_in" && booking.checkOut === today)),
  ).map((booking) => booking.unitId)).size;

  const arrivalsToday = bookings.filter(
    (booking) => booking.checkIn === today && booking.status === "confirmed",
  );
  const departuresToday = bookings.filter(
    (booking) => booking.checkOut === today && booking.status === "checked_in",
  );
  const lowStockItems = inventory.filter(
    (item) => item.databaseItem && Number(item.quantity) <= Number(item.minimum),
  );
  const readyRooms = units.filter((unit) =>
    ["available", "inspected"].includes(unit.status),
  ).length;

  const arrivalQueue = arrivalsToday.map((booking) => ({
    id: booking.id,
    guestName: guestById.get(booking.guestId)?.name || "Guest",
    roomNumber: unitById.get(booking.unitId)?.number || "—",
  }));
  const departureQueue = departuresToday.map((booking) => ({
    id: booking.id,
    guestName: guestById.get(booking.guestId)?.name || "Guest",
    roomNumber: unitById.get(booking.unitId)?.number || "—",
    isLate: now > (data.settings?.checkOutTime || "12:00"),
  }));

  return {
    roomsBookedToday,
    arrivalsToday: arrivalQueue.length,
    departuresToday: departureQueue.length,
    readyRooms,
    lowStockItems: lowStockItems.length,
    priorityActions: departureQueue.length,
    arrivalQueue,
    departureQueue,
  };
}

export function makeCode(prefix, records) {
  const highest = records.reduce(
    (max, record) => Math.max(max, Number(record.id.match(/\d+$/)?.[0] || 0)),
    0,
  );
  return `${prefix}${String(highest + 1).padStart(5, "0")}`;
}

export function isUnitAvailable(
  unit,
  checkIn,
  checkOut,
  bookings,
  blocks = [],
) {
  const blockedByBooking = bookings.some(
    (booking) =>
      booking.unitId === unit.id &&
      ["hold", "confirmed", "checked_in"].includes(booking.status) &&
      booking.checkIn < checkOut &&
      booking.checkOut > checkIn,
  );
  const blockedByMaintenance = blocks.some(
    (block) =>
      block.unitId === unit.id && block.start < checkOut && block.end > checkIn,
  );
  const localToday = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Lagos",
  }).format(new Date());
  const unavailableToday =
    checkIn <= localToday &&
    ["occupied", "dirty", "cleaning", "out_of_order"].includes(unit.status);
  return !unavailableToday && !blockedByBooking && !blockedByMaintenance;
}