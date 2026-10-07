export const roomTypes = [
  {
    id: "studio",
    name: "Studio",
    size: 25,
    bed: "Queen bed",
    guests: 2,
    rateKobo: 4500000,
  },
  {
    id: "one-bedroom",
    name: "1-bedroom",
    size: 40,
    bed: "King bed",
    guests: 2,
    rateKobo: 7000000,
  },
  {
    id: "two-bedroom",
    name: "2-bedroom",
    size: 65,
    bed: "King + twin",
    guests: 4,
    rateKobo: 11000000,
  },
  {
    id: "executive",
    name: "Executive",
    size: 50,
    bed: "King bed",
    guests: 3,
    rateKobo: 15000000,
  },
  {
    id: "penthouse",
    name: "Penthouse",
    size: 110,
    bed: "2 king beds",
    guests: 6,
    rateKobo: 25000000,
  },
];

export const featuredFoodMenu = [
  {
    id: "noodles",
    name: "Noodles",
    category: "Noodles",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Noodles_with_Omelette.jpg/500px-Noodles_with_Omelette.jpg",
    imageCredit: "Gaurav Dhwaj Khadka",
    imageSource: "https://commons.wikimedia.org/wiki/File:Noodles_with_Omelette.jpg",
  },
  {
    id: "jollof-rice",
    name: "Jollof rice",
    category: "Rice",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Jollof_rice_with_vegetable.jpg/500px-Jollof_rice_with_vegetable.jpg",
    imageCredit: "Segun Famisa",
    imageSource: "https://commons.wikimedia.org/wiki/File:Jollof_rice_with_vegetable.jpg",
  },
  {
    id: "spaghetti",
    name: "Spaghetti",
    category: "Pasta",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Plate_of_spaghetti_jollof.jpg/500px-Plate_of_spaghetti_jollof.jpg",
    imageCredit: "Bukky658",
    imageSource: "https://commons.wikimedia.org/wiki/File:Plate_of_spaghetti_jollof.jpg",
  },
  {
    id: "white-rice",
    name: "White rice",
    category: "Rice",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Rice_in_the_plate.jpg/500px-Rice_in_the_plate.jpg",
    imageCredit: "Zahraswaty",
    imageSource: "https://commons.wikimedia.org/wiki/File:Rice_in_the_plate.jpg",
  },
  {
    id: "chicken-pepper-soup",
    name: "Chicken pepper soup",
    category: "Soups",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Chicken_pepper_soup.jpg/500px-Chicken_pepper_soup.jpg",
    imageCredit: "NiferO",
    imageSource: "https://commons.wikimedia.org/wiki/File:Chicken_pepper_soup.jpg",
  },
  {
    id: "catfish-pepper-soup",
    name: "Catfish pepper soup",
    category: "Soups",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Cat_fish_pepper_soup_with_curry_leaf.jpg/500px-Cat_fish_pepper_soup_with_curry_leaf.jpg",
    imageCredit: "Omolarabasirat",
    imageSource: "https://commons.wikimedia.org/wiki/File:Cat_fish_pepper_soup_with_curry_leaf.jpg",
  },
  {
    id: "ea-pepper-soup",
    name: "EA pepper soup",
    category: "Soups",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Meat_pepper_soup.jpg/500px-Meat_pepper_soup.jpg",
    imageCredit: "Don miraj",
    imageSource: "https://commons.wikimedia.org/wiki/File:Meat_pepper_soup.jpg",
  },
  {
    id: "afang-soup",
    name: "Afang soup",
    category: "Soups",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Afang_Soup.jpg/500px-Afang_Soup.jpg",
    imageCredit: "Yemisi Ogbe",
    imageSource: "https://commons.wikimedia.org/wiki/File:Afang_Soup.jpg",
  },
  {
    id: "egusi-soup",
    name: "Egusi soup",
    category: "Soups",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Egusi_soup_in_a_plate.jpg/500px-Egusi_soup_in_a_plate.jpg",
    imageCredit: "Tesleemah",
    imageSource: "https://commons.wikimedia.org/wiki/File:Egusi_soup_in_a_plate.jpg",
  },
];

export function createInitialData() {
  return {
    roomTypes,
    rateRules: [],
    units: [
      {
        id: "u101",
        number: "101",
        roomTypeId: "studio",
        floor: "1",
        status: "occupied",
        rateKobo: 4500000,
        maxGuests: 2,
      },
      {
        id: "u102",
        number: "102",
        roomTypeId: "studio",
        floor: "1",
        status: "available",
        rateKobo: 4500000,
        maxGuests: 2,
      },
      {
        id: "u103",
        number: "103",
        roomTypeId: "studio",
        floor: "1",
        status: "dirty",
        rateKobo: 4500000,
        maxGuests: 2,
      },
      {
        id: "u104",
        number: "104",
        roomTypeId: "studio",
        floor: "1",
        status: "out_of_order",
        rateKobo: 4500000,
        maxGuests: 2,
      },
      {
        id: "u201",
        number: "201",
        roomTypeId: "one-bedroom",
        floor: "2",
        status: "occupied",
        rateKobo: 7000000,
        maxGuests: 2,
      },
      {
        id: "u202",
        number: "202",
        roomTypeId: "one-bedroom",
        floor: "2",
        status: "available",
        rateKobo: 7000000,
        maxGuests: 2,
      },
      {
        id: "u203",
        number: "203",
        roomTypeId: "one-bedroom",
        floor: "2",
        status: "inspected",
        rateKobo: 7000000,
        maxGuests: 2,
      },
      {
        id: "u301",
        number: "301",
        roomTypeId: "two-bedroom",
        floor: "3",
        status: "occupied",
        rateKobo: 11000000,
        maxGuests: 4,
      },
      {
        id: "u302",
        number: "302",
        roomTypeId: "two-bedroom",
        floor: "3",
        status: "available",
        rateKobo: 11000000,
        maxGuests: 4,
      },
      {
        id: "u401",
        number: "401",
        roomTypeId: "executive",
        floor: "4",
        status: "occupied",
        rateKobo: 15000000,
        maxGuests: 3,
      },
      {
        id: "u501",
        number: "501",
        roomTypeId: "penthouse",
        floor: "5",
        status: "available",
        rateKobo: 25000000,
        maxGuests: 6,
      },
      {
        id: "u502",
        number: "502",
        roomTypeId: "penthouse",
        floor: "5",
        status: "occupied",
        rateKobo: 25000000,
        maxGuests: 6,
      },
    ],
    guests: [
      {
        id: "G-00124",
        name: "Chidi Okafor",
        phone: "+234 803 789 1234",
        email: "chidi.okafor@example.com",
        nationality: "Nigerian",
        idNumber: "A12345678",
        tier: "Platinum",
        points: 15200,
      },
      {
        id: "G-00123",
        name: "Ngozi Eze",
        phone: "+234 803 555 0198",
        email: "ngozi.eze@example.com",
        nationality: "Nigerian",
        idNumber: "B84920118",
        tier: "Gold",
        points: 6800,
      },
      {
        id: "G-00122",
        name: "Tunde Adeyemi",
        phone: "+234 802 442 3011",
        email: "tunde.a@example.com",
        nationality: "Nigerian",
        idNumber: "C22904165",
        tier: "Silver",
        points: 1200,
      },
      {
        id: "G-00121",
        name: "Amaka Obi",
        phone: "+234 809 013 9240",
        email: "amaka.obi@example.com",
        nationality: "Nigerian",
        idNumber: "D60031759",
        tier: "Gold",
        points: 7400,
      },
      {
        id: "G-00120",
        name: "Johan Manulang",
        phone: "+62 812 2210 4980",
        email: "johan.m@example.com",
        nationality: "Indonesian",
        idNumber: "E98115543",
        tier: "Silver",
        points: 1900,
      },
      {
        id: "G-00119",
        name: "Suzi Matsuda",
        phone: "+81 90 2214 1310",
        email: "suzi.m@example.com",
        nationality: "Japanese",
        idNumber: "F10332015",
        tier: "Silver",
        points: 400,
      },
    ],
    bookings: [
      {
        id: "BA-B00124",
        guestId: "G-00124",
        unitId: "u101",
        checkIn: "2026-10-04",
        checkOut: "2026-10-08",
        adults: 2,
        children: 0,
        status: "checked_in",
        source: "Walk-in",
        requests: "Extra pillows",
        totalKobo: 20250000,
        paidKobo: 20250000,
      },
      {
        id: "BA-B00125",
        guestId: "G-00123",
        unitId: "u201",
        checkIn: "2026-10-03",
        checkOut: "2026-10-06",
        adults: 2,
        children: 0,
        status: "checked_in",
        source: "Website",
        requests: "Airport pickup",
        totalKobo: 23625000,
        paidKobo: 18000000,
      },
      {
        id: "BA-B00126",
        guestId: "G-00122",
        unitId: "u301",
        checkIn: "2026-10-02",
        checkOut: "2026-10-07",
        adults: 2,
        children: 1,
        status: "checked_in",
        source: "Phone",
        requests: "Cot required",
        totalKobo: 72187500,
        paidKobo: 72187500,
      },
      {
        id: "BA-B00127",
        guestId: "G-00121",
        unitId: "u401",
        checkIn: "2026-10-05",
        checkOut: "2026-10-08",
        adults: 2,
        children: 0,
        status: "checked_in",
        source: "Booking.com",
        requests: "",
        totalKobo: 50625000,
        paidKobo: 0,
      },
      {
        id: "BA-B00128",
        guestId: "G-00120",
        unitId: "u502",
        checkIn: "2026-10-01",
        checkOut: "2026-10-07",
        adults: 2,
        children: 0,
        status: "checked_in",
        source: "Phone",
        requests: "Late checkout",
        totalKobo: 168750000,
        paidKobo: 100000000,
      },
      {
        id: "BA-B00129",
        guestId: "G-00123",
        unitId: "u102",
        checkIn: "2026-10-06",
        checkOut: "2026-10-09",
        adults: 2,
        children: 0,
        status: "confirmed",
        source: "Website",
        requests: "",
        totalKobo: 15187500,
        paidKobo: 5000000,
      },
      {
        id: "BA-B00130",
        guestId: "G-00121",
        unitId: "u203",
        checkIn: "2026-10-05",
        checkOut: "2026-10-07",
        adults: 1,
        children: 0,
        status: "confirmed",
        source: "Walk-in",
        requests: "",
        totalKobo: 15750000,
        paidKobo: 0,
      },
      {
        id: "BA-B00131",
        guestId: "G-00119",
        unitId: "u302",
        checkIn: "2026-10-09",
        checkOut: "2026-10-12",
        adults: 2,
        children: 0,
        status: "hold",
        source: "Website",
        requests: "",
        totalKobo: 37125000,
        paidKobo: 0,
      },
      {
        id: "BA-B00132",
        guestId: "G-00120",
        unitId: "u501",
        checkIn: "2026-10-12",
        checkOut: "2026-10-14",
        adults: 2,
        children: 0,
        status: "confirmed",
        source: "Phone",
        requests: "",
        totalKobo: 56250000,
        paidKobo: 0,
      },
    ],
    payments: [
      {
        id: "PAY-00881",
        bookingId: "BA-B00124",
        method: "Transfer",
        amountKobo: 20250000,
        status: "paid",
        reference: "TRF-88124",
        paidAt: "2026-10-04",
      },
      {
        id: "PAY-00882",
        bookingId: "BA-B00125",
        method: "Card",
        amountKobo: 18000000,
        status: "paid",
        reference: "POS-77402",
        paidAt: "2026-10-03",
      },
      {
        id: "PAY-00883",
        bookingId: "BA-B00126",
        method: "Transfer",
        amountKobo: 72187500,
        status: "paid",
        reference: "TRF-88126",
        paidAt: "2026-10-02",
      },
      {
        id: "PAY-00884",
        bookingId: "BA-B00128",
        method: "Cash",
        amountKobo: 100000000,
        status: "paid",
        reference: "CSH-128",
        paidAt: "2026-10-01",
      },
    ],
    invoices: [
      {
        id: "BA-INV-00324",
        bookingId: "BA-B00124",
        guestId: "G-00124",
        totalKobo: 20250000,
        paidKobo: 20250000,
        status: "paid",
        dueDate: "2026-10-04",
      },
      {
        id: "BA-INV-00325",
        bookingId: "BA-B00125",
        guestId: "G-00123",
        totalKobo: 23625000,
        paidKobo: 18000000,
        status: "issued",
        dueDate: "2026-10-06",
      },
      {
        id: "BA-INV-00327",
        bookingId: "BA-B00127",
        guestId: "G-00121",
        totalKobo: 50625000,
        paidKobo: 0,
        status: "issued",
        dueDate: "2026-10-08",
      },
    ],
    tasks: [
      {
        id: "HK-00115",
        unitId: "u103",
        type: "Checkout clean",
        status: "open",
        priority: "High",
        assignedTo: "Grace Ade",
        updatedAt: "08:25",
      },
      {
        id: "HK-00116",
        unitId: "u302",
        type: "Checkout clean",
        status: "in_progress",
        priority: "Medium",
        assignedTo: "Peter Bello",
        updatedAt: "09:10",
      },
      {
        id: "HK-00117",
        unitId: "u203",
        type: "Inspection",
        status: "done",
        priority: "Low",
        assignedTo: "Ify Nwosu",
        updatedAt: "09:35",
      },
    ],
    inventory: [
      {
        id: "IT-001",
        name: "Bath towels",
        category: "Linen",
        unit: "pcs",
        quantity: 28,
        minimum: 30,
        costKobo: 850000,
        supplierId: "SUP-001",
      },
      {
        id: "IT-002",
        name: "Bed sheets",
        category: "Linen",
        unit: "pcs",
        quantity: 64,
        minimum: 40,
        costKobo: 1250000,
        supplierId: "SUP-001",
      },
      {
        id: "IT-003",
        name: "Toiletry kits",
        category: "Supplies",
        unit: "pcs",
        quantity: 120,
        minimum: 60,
        costKobo: 175000,
        supplierId: "SUP-002",
      },
      {
        id: "IT-004",
        name: "Rice",
        category: "Food",
        unit: "kg",
        quantity: 40,
        minimum: 10,
        costKobo: 220000,
        supplierId: "SUP-003",
      },
      {
        id: "IT-005",
        name: "Chicken",
        category: "Food",
        unit: "kg",
        quantity: 8,
        minimum: 8,
        costKobo: 1450000,
        supplierId: "SUP-003",
      },
    ],
    stockMovements: [],
    suppliers: [
      { id: "SUP-001", name: "Lagos Linen Co." },
      { id: "SUP-002", name: "Guest Essentials Ltd." },
      { id: "SUP-003", name: "Fresh Basket Foods" },
    ],
    purchaseOrders: [
      {
        id: "PO-0018",
        supplierId: "SUP-001",
        itemId: "IT-001",
        quantity: 40,
        costKobo: 850000,
        status: "approved",
        date: "2026-10-04",
      },
    ],
    expenses: [
      {
        id: "EXP-0084",
        category: "Power and fuel",
        amountKobo: 9600000,
        note: "Generator diesel",
        status: "approved",
        date: "2026-10-03",
      },
      {
        id: "EXP-0085",
        category: "Repairs",
        amountKobo: 18500000,
        note: "Lift maintenance",
        status: "pending",
        date: "2026-10-04",
      },
      {
        id: "EXP-0086",
        category: "Internet",
        amountKobo: 4800000,
        note: "October service",
        status: "approved",
        date: "2026-10-01",
      },
    ],
    conversations: [
      {
        id: "MSG-01",
        guestId: "G-00124",
        bookingId: "BA-B00124",
        unread: 2,
        messages: [
          { from: "guest", text: "Can I get a late check-out on October 8?" },
          { from: "staff", text: "I can check that with the front desk." },
        ],
      },
      {
        id: "MSG-02",
        guestId: "G-00123",
        bookingId: "BA-B00125",
        unread: 0,
        messages: [
          { from: "guest", text: "Thanks, the airport pickup was great." },
        ],
      },
      {
        id: "MSG-03",
        guestId: "G-00122",
        bookingId: "BA-B00126",
        unread: 1,
        messages: [{ from: "guest", text: "Please send my invoice." }],
      },
    ],
    reviews: [
      {
        id: "REV-001",
        guestId: "G-00120",
        bookingId: "BA-B00128",
        rating: 5,
        comment:
          "Fantastic stay. The apartment was spotless and the staff were helpful.",
        reply: "",
      },
      {
        id: "REV-002",
        guestId: "G-00119",
        bookingId: "BA-B00119",
        rating: 4,
        comment: "Cosy and well kept. Breakfast could offer more variety.",
        reply: "Thank you for sharing this feedback.",
      },
      {
        id: "REV-003",
        guestId: "G-00122",
        bookingId: "BA-B00126",
        rating: 3,
        comment:
          "Comfortable bed, but the air conditioning was not working properly.",
        reply: "",
      },
    ],
    requests: [
      {
        id: "CON-0024",
        guestId: "G-00124",
        unitId: "u101",
        type: "Airport pickup",
        details: "Pickup at 6:00 PM",
        status: "open",
        assignedTo: "Emeka",
        costKobo: 0,
      },
      {
        id: "CON-0025",
        guestId: "G-00123",
        unitId: "u201",
        type: "Extra pillows",
        details: "Two additional pillows",
        status: "pending",
        assignedTo: "Grace Ade",
        costKobo: 0,
      },
      {
        id: "CON-0026",
        guestId: "G-00122",
        unitId: "u301",
        type: "Laundry pickup",
        details: "Collect before 11:00 AM",
        status: "done",
        assignedTo: "Ify Nwosu",
        costKobo: 250000,
      },
    ],
    users: [
      {
        id: "USR-001",
        name: "Bola Adeyemi",
        email: "bola@bomsapartment.com",
        role: "ceo",
        active: true,
      },
      {
        id: "USR-002",
        name: "Ewilliam Ndamiye",
        email: "emeka@bomsapartment.com",
        role: "manager",
        active: true,
      },
      {
        id: "USR-003",
        name: "Grace Ade",
        email: "grace@bomsapartment.com",
        role: "worker",
        active: true,
      },
      {
        id: "USR-004",
        name: "Peter Bello",
        email: "peter@bomsapartment.com",
        role: "worker",
        active: true,
      },
    ],
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
      .sort(
        (left, right) => {
          const dateSpanDifference =
            Date.parse(left.endDate) -
            Date.parse(left.startDate) -
            (Date.parse(right.endDate) - Date.parse(right.startDate));
          if (dateSpanDifference) return dateSpanDifference;
          return (right.minNights || 0) - (left.minNights || 0);
        },
      );
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
