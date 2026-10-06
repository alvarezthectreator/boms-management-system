import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Package,
  PhoneCall,
  Plus,
  Printer,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  Utensils,
  Upload,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  buildDeskWorkerDashboardSummary,
  appRoutes,
  buildRouteForPage,
  calculateQuote,
  createInitialData,
  defaultCheckoutDate,
  featuredFoodMenu,
  formatDate,
  formatMoney,
  getNightlyRates,
  isUnitAvailable,
  makeCode,
  nightsBetween,
  resolvePageFromRoute,
} from "./data.js";

const STORAGE_KEY = "boms-hotel-demo-v1";
function getLagosDateTime() {
  const now = new Date();
  return {
    date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Lagos" }).format(now),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
  };
}
const TODAY = getLagosDateTime().date;
const getTimestamp = () => new Date().toISOString();
const roleActions = {
  worker: [
    "booking",
    "checkin",
    "checkout_paid",
    "housekeeping",
    "stock_use",
    "fnb_order",
    "message",
    "concierge",
  ],
  manager: [
    "booking",
    "checkin",
    "checkout_paid",
    "checkout_credit",
    "edit_booking",
    "cancel",
    "discount",
    "refund",
    "housekeeping",
    "inspect",
    "stock",
    "stock_use",
    "purchase",
    "expense",
    "revenue",
    "message",
    "concierge",
  ],
  ceo: ["all"],
};
const navGroups = [
  { label: "Overview", items: [["dashboard", "Dashboard", LayoutDashboard]] },
  {
    label: "Front desk",
    items: [
      ["bookings", "Reservations", CalendarDays],
      ["guests", "Guests", Users],
      ["rooms", "Rooms", BedDouble],
      ["calendar", "Calendar", CalendarDays],
    ],
  },
  {
    label: "Operations",
    items: [
      ["housekeeping", "Housekeeping", ClipboardList],
      ["restaurant", "Food & drink", Utensils],
      ["inventory", "Inventory", Package],
      ["purchasing", "Purchasing", ShoppingCart],
    ],
  },
  {
    label: "Finance",
    items: [
      ["payments", "Payments & invoices", CreditCard],
      ["financials", "Financials", Wallet],
    ],
  },
  {
    label: "Guest experience",
    items: [
      ["messages", "Messages", MessageSquare],
      ["concierge", "Concierge", Sparkles],
      ["reviews", "Reviews", Star],
    ],
  },
  {
    label: "Administration",
    items: [
      ["team", "Team & settings", Settings],
      ["audit", "Audit log", ShieldCheck],
    ],
  },
];
const pageNames = Object.fromEntries(
  navGroups.flatMap((group) => group.items.map(([key, label]) => [key, label])),
);
const buttonBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16836b] disabled:cursor-not-allowed disabled:opacity-50";

function readDemoData() {
  try {
    const defaults = createInitialData();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return defaults;
    const users = (stored.users || defaults.users).map((user) =>
      user.id === "USR-002" ? { ...user, name: "Ewilliam Ndamiye" } : user,
    );
    return {
      ...defaults,
      ...stored,
      users,
      settings: {
        ...defaults.settings,
        ...stored.settings,
        checkOutTime: "12:00",
      },
      auditLogs: stored.auditLogs || [],
      blocks: stored.blocks || [],
    };
  } catch {
    return createInitialData();
  }
}

function allowed(role, action) {
  return (
    roleActions[role]?.includes("all") || roleActions[role]?.includes(action)
  );
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function guestFor(data, guestId) {
  return data.guests.find((guest) => guest.id === guestId);
}

function unitFor(data, unitId) {
  return data.units.find((unit) => unit.id === unitId);
}

function roomTypeFor(data, typeId) {
  return data.roomTypes.find((type) => type.id === typeId);
}

function balanceFor(booking) {
  return Math.max(0, (booking.totalKobo || 0) - (booking.paidKobo || 0));
}

function mergeById(localRows, databaseRows) {
  const rows = new Map(localRows.map((row) => [row.id, row]));
  for (const row of databaseRows) rows.set(row.id, row);
  return [...rows.values()];
}

function Status({ value }) {
  const styles = {
    available: "bg-emerald-50 text-emerald-700",
    inspected: "bg-emerald-50 text-emerald-700",
    paid: "bg-emerald-50 text-emerald-700",
    done: "bg-emerald-50 text-emerald-700",
    confirmed: "bg-emerald-50 text-emerald-700",
    approved: "bg-emerald-50 text-emerald-700",
    checked_in: "bg-sky-50 text-sky-700",
    in_progress: "bg-sky-50 text-sky-700",
    issued: "bg-sky-50 text-sky-700",
    pending: "bg-amber-50 text-amber-700",
    hold: "bg-amber-50 text-amber-700",
    dirty: "bg-orange-50 text-orange-700",
    cleaning: "bg-orange-50 text-orange-700",
    cancelled: "bg-rose-50 text-rose-700",
    no_show: "bg-rose-50 text-rose-700",
    overdue: "bg-rose-50 text-rose-700",
    out_of_order: "bg-rose-50 text-rose-700",
    failed: "bg-rose-50 text-rose-700",
  };
  const label = (value || "unknown").replaceAll("_", " ");
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles[value] || "bg-slate-100 text-slate-600"}`}
    >
      {label}
    </span>
  );
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary:
      "bg-[#176b54] text-white hover:bg-[#125842] focus-visible:outline-[#176b54]",
    secondary:
      "border border-[#dce5df] bg-white text-[#26342d] hover:bg-[#f6f8f6]",
    quiet:
      "bg-transparent text-[#637168] hover:bg-[#eff4f0] hover:text-[#1b2c24]",
    danger: "bg-rose-50 text-rose-700 hover:bg-rose-100",
    lime: "bg-[#eaf58a] text-[#27310b] hover:bg-[#e0ef76]",
  };
  return (
    <button
      className={`${buttonBase} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Panel({ children, className = "" }) {
  return (
    <section
      className={`rounded-xl border border-[#e5ebe7] bg-white shadow-[0_2px_8px_rgba(26,45,34,0.025)] ${className}`}
    >
      {children}
    </section>
  );
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.13em] text-[#73827a]">
          {eyebrow || "Boms Apartment"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1c2922] sm:text-[27px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm text-[#718078]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, note, icon: Icon, trend }) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#718078]">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-[#1d2b24]">
            {value}
          </p>
          <p className="mt-2 text-xs text-[#718078]">{note}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#edf6f0] text-[#176b54]">
          <Icon size={19} />
        </span>
      </div>
      {trend && (
        <p className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-700">
          <TrendingUp size={14} />
          {trend}
        </p>
      )}
    </Panel>
  );
}

function SearchBox({ value, onChange, placeholder = "Search records…" }) {
  return (
    <label className="flex h-10 min-w-52 items-center gap-2 rounded-lg border border-[#e0e7e2] bg-white px-3 text-[#87938b] focus-within:border-[#73a996] focus-within:ring-2 focus-within:ring-[#176b54]/10">
      <Search size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-[#26342d] outline-none placeholder:text-[#9ba69f]"
      />
    </label>
  );
}

function DataTable({ columns, rows, empty = "No records found." }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[#e9eeea] bg-[#f7f9f7] text-xs font-medium uppercase tracking-wide text-[#738078]">
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1ee]">
          {rows.length ? (
            rows.map((row) => (
              <tr
                key={row.id}
                className="text-[#34423a] transition hover:bg-[#fbfcfb]"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="whitespace-nowrap px-4 py-3.5"
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-14 text-center text-sm text-[#7b8981]"
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyPanel({ icon: Icon = FileText, title, detail }) {
  return (
    <div className="grid min-h-48 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-[#eef5f0] text-[#176b54]">
          <Icon size={20} />
        </span>
        <h3 className="font-medium text-[#26342d]">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-[#77857d]">{detail}</p>
      </div>
    </div>
  );
}

function ModalFrame({
  title,
  description,
  onClose,
  children,
  width = "max-w-xl",
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#13251d]/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`my-auto w-full ${width} overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#edf1ee] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1c2922]">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-[#718078]">{description}</p>
            )}
          </div>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[#718078] hover:bg-[#f1f5f2]"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function InputField({ field, value, onChange }) {
  const base =
    "mt-1.5 w-full rounded-lg border border-[#dfe7e1] bg-white px-3 py-2.5 text-sm text-[#27362e] outline-none transition placeholder:text-[#9aa69e] focus:border-[#5c9d85] focus:ring-2 focus:ring-[#176b54]/10";
  const valueProps = onChange ? { value, onChange } : { defaultValue: value };
  return (
    <label className={`block ${field.full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-[#46544c]">{field.label}</span>
      {field.type === "select" ? (
        <select
          required={field.required !== false}
          name={field.name}
          {...valueProps}
          className={base}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          required={field.required}
          name={field.name}
          rows={3}
          {...valueProps}
          placeholder={field.placeholder}
          className={`${base} resize-y`}
        />
      ) : (
        <input
          required={field.required}
          min={field.min}
          max={field.max}
          step={field.step || (field.type === "number" ? "any" : undefined)}
          type={field.type || "text"}
          name={field.name}
          {...valueProps}
          placeholder={field.placeholder}
          className={base}
        />
      )}
      {field.hint && (
        <span className="mt-1 block text-xs text-[#829087]">{field.hint}</span>
      )}
    </label>
  );
}

const roomOptionList = (data) =>
  data.roomTypes.map((type) => ({
    value: type.id,
    label: type.size ? `${type.name} · ${type.size} m²` : type.name,
  }));
const guestOptionList = (data) =>
  data.guests.map((guest) => ({
    value: guest.id,
    label: `${guest.name} · ${guest.phone}`,
  }));
const unitOptionList = (data) =>
  data.units.map((unit) => ({
    value: unit.id,
    label: `${unit.number} · ${roomTypeFor(data, unit.roomTypeId)?.name || "Room"}`,
  }));
const staffOptionList = (data) =>
  data.users
    .filter((user) => user.active)
    .map((user) => ({ value: user.name, label: user.name }));

function BookingDialog({ data, role, onClose, onSave, record }) {
  const editing = Boolean(record?.id);
  const initialCheckIn = record?.checkIn || TODAY;
  const initialCheckOut = record?.checkOut || defaultCheckoutDate(initialCheckIn);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const initialUnit = record && unitFor(data, record.unitId);
  const managedRoomTypes = data.roomTypes.filter((type) =>
    data.units.some((unit) => unit.databaseRoom && unit.roomTypeId === type.id),
  );
  const bookingRoomTypes = record && !initialUnit?.databaseRoom
    ? data.roomTypes.filter((type) => type.id === initialUnit?.roomTypeId)
    : managedRoomTypes.length
      ? managedRoomTypes
      : data.roomTypes;
  const [roomTypeId, setRoomTypeId] = useState(initialUnit?.roomTypeId || managedRoomTypes[0]?.id || data.roomTypes[0]?.id || "");
  const effectiveRoomTypeId = bookingRoomTypes.some((type) => type.id === roomTypeId)
    ? roomTypeId
    : bookingRoomTypes[0]?.id || "";
  const [unitId, setUnitId] = useState(record?.unitId || "");
  const [guestId, setGuestId] = useState(record?.guestId || data.guests[0]?.id || "");
  const [adults, setAdults] = useState(record?.adults || 1);
  const [children, setChildren] = useState(record?.children || 0);
  const [source, setSource] = useState(record?.source || "Walk-in");
  const [requests, setRequests] = useState(record?.requests || "");
  const [discountNaira, setDiscountNaira] = useState(record?.discountKobo ? (record.discountKobo / 100).toFixed(2) : "");
  const [status, setStatus] = useState(record?.status || "confirmed");
  const [error, setError] = useState("");
  const nights = nightsBetween(checkIn, checkOut);
  const candidates = data.units.filter(
    (unit) =>
      ((unit.databaseRoom && unit.rateKobo > 0) || unit.id === record?.unitId) &&
      unit.roomTypeId === effectiveRoomTypeId &&
      isUnitAvailable(
        unit,
        checkIn,
        checkOut,
        data.bookings.filter((booking) => booking.id !== record?.id),
        data.blocks || [],
      ),
  );
  const selectedUnit =
    candidates.find((unit) => unit.id === unitId) || candidates[0];
  const discountKobo = Math.round(Number(discountNaira || 0) * 100);
  const nightlyRates = selectedUnit && nights > 0
    ? getNightlyRates(selectedUnit, checkIn, nights, data.rateRules || [])
    : [];
  const quote =
    selectedUnit && nights > 0
      ? calculateQuote(
          nightlyRates,
          nights,
          data.settings,
          0,
          discountKobo,
        )
      : null;
  function submit(event) {
    event.preventDefault();
    if (!guestId || !selectedUnit || nights < 1) {
      setError("Choose a guest, available room, and valid date range.");
      return;
    }
    if (Number(adults) + Number(children) > selectedUnit.maxGuests) {
      setError("Guest count exceeds this room’s maximum occupancy.");
      return;
    }
    if (discountKobo > 0 && !allowed(role, "discount")) {
      setError("Discounts require manager approval.");
      return;
    }
    if (
      role === "manager" &&
      quote &&
      discountKobo > quote.subtotalKobo * 0.1
    ) {
      setError("Manager discounts are limited to 10%.");
      return;
    }
    onSave({
      recordId: record?.id,
      guestId,
      roomTypeId: selectedUnit.roomTypeId,
      unitId: selectedUnit.id,
      checkIn,
      checkOut,
      adults: Number(adults),
      children: Number(children),
      source,
      requests,
      status,
      quote,
    });
  }
  return (
    <ModalFrame
      title={editing ? `Edit reservation · ${record.id}` : "Create reservation"}
      description={editing ? "Update dates, room, guests, and the quoted total." : "Check availability and confirm the stay details."}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            field={{
              name: "guestId",
              label: "Guest",
              type: "select",
              options: guestOptionList(data),
            }}
            value={guestId}
            onChange={(event) => setGuestId(event.target.value)}
          />
          <InputField
            field={{
              name: "roomTypeId",
              label: "Room type",
              type: "select",
              options: roomOptionList({ ...data, roomTypes: bookingRoomTypes }),
            }}
            value={effectiveRoomTypeId}
            onChange={(event) => {
              setRoomTypeId(event.target.value);
              setUnitId("");
            }}
          />
          {!data.units.some((unit) => unit.databaseRoom && unit.rateKobo > 0) && (
            <p className="text-sm text-amber-800 sm:col-span-2">
              An admin must enter each room’s nightly rate before it can be reserved.
            </p>
          )}
          <InputField
            field={{
              name: "checkIn",
              label: "Check-in",
              type: "date",
              value: checkIn,
            }}
            value={checkIn}
            onChange={(event) => setCheckIn(event.target.value)}
          />
          <InputField
            field={{
              name: "checkOut",
              label: "Check-out",
              type: "date",
              value: checkOut,
            }}
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
          />
          <InputField
            field={{ name: "adults", label: "Adults", type: "number", min: 1 }}
            value={adults}
            onChange={(event) => setAdults(event.target.value)}
          />
          <InputField
            field={{
              name: "children",
              label: "Children",
              type: "number",
              min: 0,
            }}
            value={children}
            onChange={(event) => setChildren(event.target.value)}
          />
          <InputField
            field={{
              name: "unitId",
              label: "Available unit",
              type: "select",
              options: candidates.map((unit) => ({
                value: unit.id,
                label: `Unit ${unit.number} · ${formatMoney(unit.rateKobo)}/night`,
              })),
            }}
            value={selectedUnit?.id || ""}
            onChange={(event) => setUnitId(event.target.value)}
          />
          <InputField
            field={{
              name: "source",
              label: "Booking source",
              type: "select",
              options: [
                "Walk-in",
                "Phone",
                "Website",
                "Booking.com",
                "Other",
              ].map((value) => ({ value, label: value })),
            }}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <InputField
            field={{
              name: "status",
              label: "Initial status",
              type: "select",
              options: [
                { value: "confirmed", label: "Confirmed" },
                { value: "hold", label: "Payment hold · 15 min" },
              ],
            }}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          {allowed(role, "discount") && (
            <InputField
              field={{
                name: "discount",
                label: "Discount (₦)",
                type: "number",
                min: 0,
              }}
              value={discountNaira}
              onChange={(event) => setDiscountNaira(event.target.value)}
            />
          )}
          <InputField
            field={{
              name: "requests",
              label: "Guest requests",
              type: "textarea",
              full: true,
              required: false,
            }}
            value={requests}
            onChange={(event) => setRequests(event.target.value)}
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        {!candidates.length && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No units of this type are available for those dates.
          </p>
        )}
        {quote && (
          <div className="rounded-xl bg-[#f5f8f5] p-4">
            <div className="flex items-center justify-between text-sm text-[#617068]">
              <span>{nights} nights · room subtotal</span>
              <span>{formatMoney(quote.roomKobo)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-[#617068]">
              <span>Service charge · {data.settings.servicePercent}%</span>
              <span>{formatMoney(quote.serviceKobo)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-[#617068]">
              <span>VAT · {data.settings.vatPercent}%</span>
              <span>{formatMoney(quote.vatKobo)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#dfe8e1] pt-3 font-semibold text-[#1c2922]">
              <span>Estimated total</span>
              <span>{formatMoney(quote.totalKobo)}</span>
            </div>
            <p className="mt-2 text-xs text-[#77857d]">
              VAT is calculated on the taxable subtotal in this demo. Confirm
              the tax basis with your accountant.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!candidates.length}>
            <Plus size={16} />
            Create booking
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function RoomEditorDialog({ room, onClose, onSave }) {
  const [imageUrl, setImageUrl] = useState(room.images?.[0] || "");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [rateNaira, setRateNaira] = useState(
    room.rateKobo ? String(room.rateKobo / 100) : "",
  );
  const [sharedBedType, setSharedBedType] = useState(room.bedType || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function chooseImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setError("Choose an image no larger than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ""));
      setImageUrl("");
      setError("");
    };
    reader.onerror = () => setError("The selected image could not be read.");
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    if (!imageDataUrl && !imageUrl.trim()) {
      setError("Choose an image or enter an HTTPS image URL.");
      return;
    }
    setSaving(true);
    setError("");
    const result = await onSave(room, {
      imageDataUrl,
      imageUrl: imageDataUrl ? "" : imageUrl.trim(),
      rateNaira,
      sharedBedType: sharedBedType.trim() || undefined,
    });
    setSaving(false);
    if (result?.error) setError(result.error);
    else onClose();
  }

  return (
    <ModalFrame
      title={`Edit ${room.name}`}
      description="Room photos and rates are saved to the hotel database."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="aspect-[16/9] overflow-hidden rounded-lg bg-[#edf2ed]">
          {(imageDataUrl || imageUrl) && (
            <img
              src={imageDataUrl || imageUrl}
              alt={`${room.name} room preview`}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <label className="block text-sm font-medium text-[#34443a]">
          Upload a room photo
          <span className="mt-1 block text-xs font-normal text-[#718078]">JPG, PNG, or WebP. Maximum 5 MB.</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={chooseImage}
            className="mt-2 block w-full text-sm text-[#59695f] file:mr-3 file:rounded-md file:border-0 file:bg-[#edf3ef] file:px-3 file:py-2 file:font-medium file:text-[#284237]"
          />
        </label>
        <InputField
          field={{ name: "imageUrl", label: "Or use an HTTPS image URL", required: false, type: "url" }}
          value={imageUrl}
          onChange={(event) => {
            setImageUrl(event.target.value);
            setImageDataUrl("");
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            field={{ name: "rateNaira", label: "Nightly rate (₦)", type: "number", min: 1, required: false }}
            value={rateNaira}
            onChange={(event) => setRateNaira(event.target.value)}
          />
          <InputField
            field={{ name: "sharedBedType", label: "Shared bed size for all rooms", placeholder: "e.g. Queen bed", required: false }}
            value={sharedBedType}
            onChange={(event) => setSharedBedType(event.target.value)}
          />
        </div>
        <p className="text-xs text-[#718078]">Maximum occupancy is fixed at 3 guests per room.</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : <><Upload size={16} />Save room</>}
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function RecordDialog({ type, data, onClose, onSave, record }) {
  const configurations = {
    guest: {
      title: "Add guest",
      fields: [
        { name: "name", label: "Full name" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email", type: "email", required: false },
        { name: "nationality", label: "Nationality", required: false },
        { name: "idNumber", label: "ID number", required: false },
      ],
    },
    unit: {
      title: "Add unit",
      fields: [
        { name: "number", label: "Unit number" },
        {
          name: "roomTypeId",
          label: "Room type",
          type: "select",
          options: roomOptionList(data),
        },
        { name: "floor", label: "Floor", type: "number", min: 0 },
        {
          name: "rateNaira",
          label: "Nightly rate (₦)",
          type: "number",
          min: 1,
        },
        { name: "maxGuests", label: "Maximum guests", type: "number", min: 1 },
      ],
    },
    roomType: {
      title: "Add room type",
      fields: [
        { name: "name", label: "Room type name" },
        { name: "size", label: "Size (m²)", type: "number", min: 1 },
        { name: "bed", label: "Bed type" },
        { name: "guests", label: "Maximum guests", type: "number", min: 1 },
        {
          name: "rateNaira",
          label: "Base rate per night (₦)",
          type: "number",
          min: 1,
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          required: false,
        },
      ],
    },
    rateRule: {
      title: "Add seasonal or long-stay rate",
      fields: [
        { name: "roomTypeId", label: "Room type", type: "select", options: roomOptionList(data) },
        { name: "startDate", label: "Start date", type: "date" },
        { name: "endDate", label: "End date (exclusive)", type: "date" },
        { name: "rateNaira", label: "Rate per night (₦)", type: "number", min: 1 },
        { name: "minNights", label: "Minimum nights", type: "number", min: 1, required: false, hint: "Use 7 for weekly or 28 for monthly stays." },
      ],
    },
    payment: {
      title: "Record payment",
      fields: [
        {
          name: "bookingId",
          label: "Booking",
          type: "select",
          options: data.bookings
            .filter(
              (booking) => !["cancelled", "no_show"].includes(booking.status),
            )
            .map((booking) => ({
              value: booking.id,
              label: `${booking.id} · ${guestFor(data, booking.guestId)?.name || "Guest"} · balance ${formatMoney(balanceFor(booking))}`,
            })),
        },
        { name: "amountNaira", label: "Amount (₦)", type: "number", min: 0.01 },
        {
          name: "method",
          label: "Method",
          type: "select",
          options: [
            "Cash",
            "Transfer",
            "Card",
            "Online",
            "Bill to company",
          ].map((value) => ({ value, label: value })),
        },
        { name: "reference", label: "Reference", required: false },
      ],
    },
    voidInvoice: {
      title: `Void invoice ${record?.id || ""}`,
      fields: [{ name: "reason", label: "Reason for voiding", type: "textarea" }],
    },
    item: {
      title: "Add inventory item",
      fields: [
        { name: "name", label: "Item name" },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: ["Food", "Drinks", "Minibar", "Linen", "Supplies", "Maintenance"].map(
            (value) => ({ value, label: value }),
          ),
        },
        { name: "unit", label: "Unit of measure", placeholder: "pcs, kg, L…" },
        { name: "quantity", label: "Opening quantity", type: "number", min: 0 },
        { name: "minimum", label: "Minimum quantity", type: "number", min: 0 },
        { name: "costNaira", label: "Unit cost (₦)", type: "number", min: 0 },
      ],
    },
    stock: {
      title: "Receive stock",
      fields: [
        {
          name: "itemId",
          label: "Item",
          type: "select",
          options: data.inventory.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.quantity} ${item.unit} on hand`,
          })),
        },
        {
          name: "quantity",
          label: "Quantity received",
          type: "number",
          min: 0.01,
        },
        {
          name: "costNaira",
          label: "Cost per unit (₦)",
          type: "number",
          min: 0,
        },
        { name: "batchCode", label: "Batch / lot number", required: false },
        { name: "expiryDate", label: "Expiry date", type: "date", required: false },
        { name: "note", label: "Note", type: "textarea", required: false },
      ],
    },
    minibar: {
      title: `Record minibar · ${record?.name || "Item"}`,
      fields: [
        {
          name: "unitId",
          label: "Room",
          type: "select",
          options: data.units.filter((unit) => unit.databaseRoom).map((unit) => ({ value: unit.id, label: unit.number })),
        },
        {
          name: "bookingId",
          label: "Active stay (optional)",
          type: "select",
          required: false,
          options: [{ value: "", label: "No room charge" }, ...data.bookings.filter((booking) => booking.databaseBooking && booking.status === "checked_in").map((booking) => ({ value: booking.id, label: `${unitFor(data, booking.unitId)?.number || "Room"} · ${guestFor(data, booking.guestId)?.name || "Guest"}` }))],
        },
        { name: "quantity", label: `Quantity (${record?.unit || "units"})`, type: "number", min: 0.01, step: 0.01 },
        { name: "unitPriceNaira", label: "Charge per unit (₦)", type: "number", min: 0, required: false },
        { name: "reason", label: "Note", required: false },
      ],
    },
    purchase: {
      title: "Create purchase order",
      fields: [
        {
          name: "supplierId",
          label: "Supplier",
          type: "select",
          options: data.suppliers.map((supplier) => ({
            value: supplier.id,
            label: supplier.name,
          })),
        },
        {
          name: "itemId",
          label: "Item",
          type: "select",
          options: data.inventory.map((item) => ({
            value: item.id,
            label: item.name,
          })),
        },
        { name: "quantity", label: "Quantity", type: "number", min: 1 },
        { name: "costNaira", label: "Unit cost (₦)", type: "number", min: 0 },
        { name: "expiryDate", label: "Expiry date for received stock", type: "date", required: false },
      ],
    },
    expense: {
      title: "Record expense",
      fields: [
        {
          name: "category",
          label: "Category",
          type: "select",
          options: [
            "Salaries",
            "Power and fuel",
            "Repairs",
            "Internet",
            "Supplies",
            "Other",
          ].map((value) => ({ value, label: value })),
        },
        { name: "amountNaira", label: "Amount (₦)", type: "number", min: 0.01 },
        { name: "note", label: "Description", type: "textarea" },
      ],
    },
    dayClose: {
      title: `Close cash day · ${TODAY}`,
      fields: [
        { name: "cashNaira", label: "Cash counted (₦)", type: "number", min: 0 },
        { name: "transferNaira", label: "Transfer total (₦)", type: "number", min: 0 },
        { name: "cardNaira", label: "Card total (₦)", type: "number", min: 0 },
        { name: "note", label: "Reconciliation note", type: "textarea", required: false },
      ],
    },
    task: {
      title: "Create housekeeping task",
      fields: [
        {
          name: "unitId",
          label: "Unit",
          type: "select",
          options: data.units.map((unit) => ({
            value: unit.id,
            label: `${unit.number} · ${roomTypeFor(data, unit.roomTypeId)?.name}`,
          })),
        },
        {
          name: "type",
          label: "Task type",
          type: "select",
          options: [
            "Checkout clean",
            "Mid-stay clean",
            "Inspection",
            "Maintenance",
          ].map((value) => ({ value, label: value })),
        },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          options: ["Low", "Medium", "High"].map((value) => ({
            value,
            label: value,
          })),
        },
        {
          name: "assignedTo",
          label: "Assign to",
          type: "select",
          options: staffOptionList(data),
        },
      ],
    },
    request: {
      title: "New guest request",
      fields: [
        {
          name: "guestId",
          label: "Guest",
          type: "select",
          options: guestOptionList(data),
        },
        {
          name: "unitId",
          label: "Unit",
          type: "select",
          options: unitOptionList(data),
        },
        {
          name: "type",
          label: "Request type",
          type: "select",
          options: [
            "Airport pickup",
            "Laundry",
            "Extra items",
            "Restaurant booking",
            "Taxi",
            "Other",
          ].map((value) => ({ value, label: value })),
        },
        { name: "details", label: "Details", type: "textarea" },
        {
          name: "assignedTo",
          label: "Assign to",
          type: "select",
          options: staffOptionList(data),
        },
        {
          name: "costNaira",
          label: "Charge guest (₦)",
          type: "number",
          min: 0,
          required: false,
        },
      ],
    },
    user: {
      title: "Add team member",
      fields: [
        { name: "name", label: "Full name" },
        { name: "email", label: "Email", type: "email" },
        { name: "password", label: "Temporary password", type: "password", hint: "Use at least 12 characters." },
        {
          name: "role",
          label: "Role",
          type: "select",
          options: [
            { value: "worker", label: "Worker" },
            { value: "manager", label: "Manager" },
            { value: "ceo", label: "CEO / Admin" },
          ],
        },
      ],
    },
    setPassword: {
      title: `Set password · ${record?.name || "Team member"}`,
      fields: [{ name: "password", label: "New password", type: "password", hint: "Use at least 12 characters." }],
    },
    cancel: {
      title: "Cancel reservation",
      fields: [
        { name: "reason", label: "Cancellation reason", type: "textarea" },
        {
          name: "feeNaira",
          label: "Cancellation fee (₦)",
          type: "number",
          min: 0,
          required: true,
        },
      ],
    },
    checkout: {
      title: "Complete check-out",
      fields: [
        {
          name: "amountNaira",
          label: "Payment collected now (₦)",
          type: "number",
          min: 0,
          required: true,
        },
        {
          name: "method",
          label: "Payment method",
          type: "select",
          options: ["Cash", "Transfer", "Card", "Bill to company"].map(
            (value) => ({ value, label: value }),
          ),
        },
        {
          name: "reason",
          label: "Reason for outstanding balance",
          type: "textarea",
          required: false,
        },
      ],
    },
    block: {
      title: "Block unit dates",
      fields: [
        { name: "start", label: "From", type: "date" },
        { name: "end", label: "Until (exclusive)", type: "date" },
        { name: "reason", label: "Reason", type: "textarea" },
      ],
    },
    reply: {
      title: "Reply to review",
      fields: [{ name: "reply", label: "Your response", type: "textarea" }],
    },
  };
  const config = configurations[type];
  if (!config) return null;
  const fields = config.fields.map((field) =>
    field.name === "bookingId" && record
      ? {
          ...field,
          options: [
            {
              value: record.id,
              label: `${record.id} · ${guestFor(data, record.guestId)?.name}`,
            },
            ...field.options.filter((option) => option.value !== record.id),
          ],
        }
      : field,
  );
  const initial =
    type === "checkout" && record
      ? { amountNaira: (balanceFor(record) / 100).toFixed(2) }
      : type === "block"
        ? { start: TODAY, end: "2026-10-06" }
        : {};
  return (
    <ModalFrame
      title={config.title}
      description={
        type === "payment"
          ? "Payments are recorded in the demo ledger; gateway settlement is not connected."
          : ""
      }
      onClose={onClose}
    >
      <form
        className="space-y-5 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(
            new FormData(event.currentTarget).entries(),
          );
          onSave(type, values, record);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <InputField
              key={field.name}
              field={field}
              value={initial[field.name]}
            />
          ))}
        </div>
        {type === "cancel" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The cancellation rule is a demo input. Confirm the hotel policy
            before using real refunds.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <Check size={16} />
            Save
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function DashboardOrderComposer({ data, fnbData, loading, canAddMenu, onAddMenu, onSave }) {
  const [station, setStation] = useState("kitchen");
  const [bookingId, setBookingId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loungeGuestName, setLoungeGuestName] = useState("");
  const [cart, setCart] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const stationItems = fnbData.menuItems.filter((item) => item.station === station);
  const normalizedName = (name = "") => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const catalogCards = station === "kitchen"
    ? [
        ...featuredFoodMenu.map((dish) => ({
          id: dish.id,
          name: dish.name,
          category: dish.category,
          imageUrl: dish.imageUrl,
          imageCredit: dish.imageCredit,
          imageSource: dish.imageSource,
          item: stationItems.find((entry) => normalizedName(entry.name) === normalizedName(dish.name)) || null,
        })),
        ...stationItems
          .filter((item) => !featuredFoodMenu.some((dish) => normalizedName(dish.name) === normalizedName(item.name)))
          .map((item) => ({ id: item.id, name: item.name, category: item.category, item })),
      ]
    : stationItems.map((item) => ({ id: item.id, name: item.name, category: item.category, item }));
  const checkedInBookings = data.bookings.filter((booking) => booking.databaseBooking && booking.status === "checked_in");
  const subtotalKobo = cart.reduce((sum, line) => {
    const item = fnbData.menuItems.find((entry) => entry.id === line.menuItemId);
    return sum + (item?.priceKobo || 0) * line.quantity;
  }, 0);
  const serviceKobo = Math.round(subtotalKobo * Number(data.settings.servicePercent || 0) / 100);
  const vatKobo = Math.round(subtotalKobo * Number(data.settings.vatPercent || 0) / 100);
  const totalKobo = subtotalKobo + serviceKobo + vatKobo;

  function addItem(item) {
    setCart((current) => {
      const existing = current.find((line) => line.menuItemId === item.id);
      return existing
        ? current.map((line) => line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { menuItemId: item.id, quantity: 1, modifierIds: [] }];
    });
  }

  async function placeOrder() {
    if (!cart.length) return;
    setSaving(true);
    setError("");
    const booking = checkedInBookings.find((item) => item.id === bookingId);
    const result = await onSave({
      items: cart,
      source: booking ? "room_service" : "lounge",
      paymentMethod: booking ? "room_charge" : paymentMethod,
      bookingId: booking?.id || "",
      unitId: booking?.unitId || "",
      guestName: booking ? guestFor(data, booking.guestId)?.name || "" : loungeGuestName.trim(),
    });
    setSaving(false);
    if (result?.error) setError(result.error);
    else setCart([]);
  }

  return (
    <Panel className="mt-4 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[#25332b]">Order food & drinks</h2>
          <p className="mt-1 text-xs text-[#7a8880]">Choose menu items and send them to the kitchen or bar.</p>
        </div>
        <div className="inline-flex rounded-lg bg-[#edf2ee] p-1" role="group" aria-label="Menu section">
          {[ ["kitchen", "Food"], ["bar", "Drinks"] ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStation(key)} aria-pressed={station === key}
              className={`min-h-9 rounded-md px-4 text-sm font-medium ${station === key ? "bg-white text-[#25332b] shadow-sm" : "text-[#718078]"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="max-h-[30rem] overflow-y-auto rounded-lg border border-[#e3eae5] p-2" aria-label={`${station === "bar" ? "Drinks" : "Food"} menu`}>
          {loading ? <p className="p-4 text-sm text-[#718078]">Loading menu availability…</p> : catalogCards.length ? (
            <div className="divide-y divide-[#e8eeea]">
              {catalogCards.map((dish) => {
                const configuredItem = dish.item;
                const isConfigured = Boolean(configuredItem);
                const isAvailable = Boolean(configuredItem?.available);
                const canAdd = isAvailable || (!isConfigured && canAddMenu);
                return <div key={dish.id} className="flex min-h-[4.5rem] items-center gap-3 py-2.5 first:pt-1 last:pb-1">
                  {dish.imageUrl ? <img src={dish.imageUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-full object-cover ring-1 ring-[#dfe7e1]" /> : <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#edf3ee] text-[#688273]"><Utensils size={17} /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#2c3b34]">{dish.name}</p>
                    <p className="truncate text-xs text-[#77857d]">{isConfigured ? formatMoney(configuredItem.priceKobo) : "Price & recipe needed"}{dish.imageSource && <> · <a href={dish.imageSource} target="_blank" rel="noreferrer" className="underline decoration-[#c4cec7] underline-offset-2">Photo: {dish.imageCredit}</a></>}</p>
                  </div>
                  <button type="button" disabled={loading || !canAdd || !isAvailable && !canAddMenu} title={isAvailable ? `Add ${dish.name}` : canAddMenu && !isConfigured ? `Set up ${dish.name}` : isConfigured ? `${dish.name} is unavailable` : "Ask a manager to set up this dish"} aria-label={isAvailable ? `Add ${dish.name}` : canAddMenu && !isConfigured ? `Set up ${dish.name}` : `Unavailable: ${dish.name}`} onClick={() => isAvailable ? addItem(configuredItem) : onAddMenu({ name: dish.name, category: dish.category, station })} className="grid size-9 shrink-0 place-items-center rounded-full border border-[#dce6dd] text-[#176b54] hover:bg-[#edf6f0] disabled:cursor-not-allowed disabled:text-[#a4afa7]">
                    <Plus size={17} />
                  </button>
                </div>;
              })}
            </div>
          ) : <div className="flex min-h-40 flex-col items-start justify-center gap-2 p-4">
            <p className="text-sm font-semibold text-[#34443a]">No {station === "bar" ? "drinks" : "food"} in the saved menu</p>
            <p className="text-xs text-[#718078]">{canAddMenu ? "Add menu items with recipes to make them available for orders." : "Ask a manager to add menu items before taking an order."}</p>
            {canAddMenu && <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => onAddMenu()}><Plus size={15} />Add menu item</Button>}
          </div>}
        </div>
        <div className="flex min-h-48 flex-col rounded-lg border border-[#e3eae5] p-3">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Current order</h3><span className="text-xs text-[#718078]">{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
          <label className="mb-3 block text-xs font-medium text-[#58685e]">Order for
            <select value={bookingId} onChange={(event) => setBookingId(event.target.value)} className="mt-1 block min-h-10 w-full rounded-md border border-[#dfe7e1] bg-white px-2.5 text-sm">
              <option value="">Lounge · personal order</option>
              {checkedInBookings.map((booking) => <option key={booking.id} value={booking.id}>{unitFor(data, booking.unitId)?.number || "Room"} · {guestFor(data, booking.guestId)?.name || booking.id}</option>)}
            </select>
          </label>
          {!bookingId && <label className="mb-3 block text-xs font-medium text-[#58685e]">Guest name (optional)
            <input value={loungeGuestName} onChange={(event) => setLoungeGuestName(event.target.value)} placeholder="Name for this order" className="mt-1 block min-h-10 w-full rounded-md border border-[#dfe7e1] px-2.5 text-sm" />
          </label>}
          {!bookingId && <label className="mb-3 block text-xs font-medium text-[#58685e]">Payment
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 block min-h-10 w-full rounded-md border border-[#dfe7e1] bg-white px-2.5 text-sm">
              {["cash", "card", "transfer"].map((method) => <option key={method} value={method}>{method[0].toUpperCase() + method.slice(1)}</option>)}
            </select>
          </label>}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {cart.map((line) => {
              const item = fnbData.menuItems.find((entry) => entry.id === line.menuItemId);
              return <div key={line.menuItemId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{item?.name}</span>
                <button type="button" aria-label={`Remove one ${item?.name}`} onClick={() => setCart((current) => current.flatMap((row) => row.menuItemId !== line.menuItemId ? [row] : row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []))} className="grid size-7 place-items-center rounded text-[#718078] hover:bg-[#edf2ee]">−</button>
                <span className="w-5 text-center tabular-nums">{line.quantity}</span>
                <button type="button" aria-label={`Add one ${item?.name}`} onClick={() => addItem(item)} className="grid size-7 place-items-center rounded text-[#176b54] hover:bg-[#edf2ee]">+</button>
              </div>;
            })}
            {!cart.length && <p className="py-2 text-xs text-[#88958d]">Select food or drinks to add them here.</p>}
          </div>
          <div className="mt-3 border-t border-[#e8eeea] pt-3">
            <div className="mb-2 flex justify-between text-sm font-semibold"><span>Total</span><span>{formatMoney(totalKobo)}</span></div>
            {error && <p role="alert" className="mb-2 text-xs text-rose-700">{error}</p>}
            <Button className="w-full" disabled={!cart.length || saving} onClick={placeOrder}>{saving ? "Sending…" : "Send order"}<ArrowRight size={15} /></Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Dashboard({
  data,
  databaseRooms,
  fnbData,
  fnbLoading,
  userName,
  onNavigate,
  onCreate,
  onBookingAction,
  onExtendBooking,
  onSaveFnbOrder,
  canAddMenu,
  onAddMenu,
  checkoutCalls,
  housekeepingPrepAlerts,
  checkoutFollowUps,
}) {
  const inventoryUnits = data.units.some((unit) => unit.databaseRoom)
    ? data.units.filter((unit) => unit.databaseRoom)
    : data.units;
  const arrivals = data.bookings.filter(
    (booking) => booking.checkIn === TODAY && booking.status === "confirmed",
  ).length;
  const departures = data.bookings.filter(
    (booking) => booking.checkOut === TODAY && booking.status === "checked_in",
  ).length;
  const occupied = inventoryUnits.filter(
    (unit) => unit.status === "occupied",
  ).length;
  const availableForOccupancy = inventoryUnits.filter(
    (unit) => unit.status !== "out_of_order",
  ).length;
  const occupancy = availableForOccupancy
    ? Math.round((occupied / availableForOccupancy) * 100)
    : 0;
  const revenue = data.payments
    .filter(
      (payment) =>
        ["paid", "refunded"].includes(payment.status) && payment.paidAt?.startsWith("2026-10"),
    )
    .reduce((sum, payment) => sum + payment.amountKobo, 0);
  const recent = [...data.bookings]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 6);
  const lowStockItems = data.inventory.filter((item) => item.databaseItem && item.quantity <= item.minimum);
  const deskSummary = buildDeskWorkerDashboardSummary({
    bookings: data.bookings,
    guests: data.guests,
    units: inventoryUnits,
    inventory: data.inventory,
    settings: data.settings,
  }, TODAY, (typeof lagosClock !== "undefined" ? lagosClock.time : "12:00"));
  const roomInventory = databaseRooms?.length ? databaseRooms : data.units.map((unit) => {
    const roomType = roomTypeFor(data, unit.roomTypeId);
    return { ...unit, roomTypeName: roomType?.name || "Room", images: roomType?.images || [] };
  });
  const defaultRoomCheckout = defaultCheckoutDate(TODAY);
  const bookableRooms = roomInventory.filter((room) => {
    const unit = data.units.find((item) => item.id === room.id);
    return ["available", "inspected"].includes(room.status) && room.rateKobo > 0 && unit &&
      isUnitAvailable(unit, TODAY, defaultRoomCheckout, data.bookings, data.blocks || []);
  });
  const barValues = [42, 67, 52, 84, 58, 91, 73];
  return (
    <div className="flex flex-col">
      <div className="order-first">
      <PageHeader
        eyebrow="Monday, 5 October 2026 · Lagos"
        title={`Good morning, ${userName.split(" ")[0]}`}
        description="Here’s the property at a glance."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onNavigate("calendar")}>
              <CalendarDays size={16} />
              Calendar
            </Button>
            <Button onClick={() => onCreate("booking")}>
              <Plus size={16} />
              New booking
            </Button>
          </div>
        }
      />
      </div>
      <Panel className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eeea] px-4 py-4 sm:px-5">
          <div><h2 className="font-semibold text-[#25332b]">Book a room</h2><p className="mt-1 text-xs text-[#7a8880]">Rooms ready for a new reservation</p></div>
          <Button onClick={() => onCreate("booking")}><Plus size={16} />New booking</Button>
        </div>
        {bookableRooms.length ? <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {bookableRooms.slice(0, 4).map((room) => (
            <article key={room.id} className="overflow-hidden rounded-lg border border-[#e3eae5] bg-white">
              {room.images?.[0] ? <img src={room.images[0]} alt={`${room.roomTypeName} room ${room.number}`} className="aspect-[16/9] w-full object-cover" /> : <div className="grid aspect-[16/9] place-items-center bg-[#edf3ee] text-[#789082]"><BedDouble size={34} strokeWidth={1.4} /></div>}
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">Room {room.number}</p><p className="truncate text-xs text-[#718078]">{room.roomTypeName} · {room.rateKobo > 0 ? `${formatMoney(room.rateKobo)}/night` : "Rate not set"}</p></div>
                <Button variant="secondary" className="min-h-9 shrink-0 px-2.5 text-xs" disabled={!(room.rateKobo > 0)} onClick={() => onCreate("booking", { unitId: room.id, roomTypeId: room.roomTypeId, checkIn: TODAY })}>{room.rateKobo > 0 ? "Book" : "Rate needed"}</Button>
              </div>
            </article>
          ))}
        </div> : <div className="px-5 py-4 text-sm text-[#718078]">No rooms are ready to reserve right now. Check room status or create a booking to see the full availability calendar.</div>}
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Rooms booked today"
          value={deskSummary.roomsBookedToday}
          note="Rooms occupied or arriving today"
          icon={BedDouble}
        />
        <StatCard
          label="Occupancy"
          value={`${occupancy}%`}
          note={`${occupied} occupied · ${availableForOccupancy - occupied} available`}
          icon={BedDouble}
        />
        <StatCard
          label="Arrivals today"
          value={arrivals}
          note="Confirmed guests checking in"
          icon={ArrowRight}
        />
        <StatCard
          label="Departures today"
          value={departures}
          note="Guests due to check out"
          icon={CalendarDays}
        />
      </div>
      <DashboardOrderComposer data={data} fnbData={fnbData} loading={fnbLoading} canAddMenu={canAddMenu} onAddMenu={onAddMenu} onSave={onSaveFnbOrder} />
      {checkoutCalls.length > 0 && <Panel className="mt-4 border-amber-300 bg-amber-50/70 p-4 sm:p-5">
        <div className="mb-3"><h2 className="font-semibold text-[#503915]">Call today’s checkouts</h2><p className="mt-1 text-xs text-[#795e2b]">Call guests by 11:00 a.m. and extend one night if they confirm.</p></div>
        <div className="divide-y divide-amber-200">{checkoutCalls.map((booking) => {
          const guest = guestFor(data, booking.guestId);
          const unit = unitFor(data, booking.unitId);
          return <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
            <div><p className="text-sm font-medium text-[#3c3322]">{guest?.name || "Guest"} · Room {unit?.number || "—"}</p><p className="mt-0.5 text-xs text-[#795e2b]">Checkout by {data.settings.checkOutTime}</p></div>
            <div className="flex items-center gap-2">{guest?.phone && <a href={`tel:${guest.phone.replace(/[^+\d]/g, "")}`} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-500 px-3 text-sm font-medium text-[#795e2b]"><PhoneCall size={15} />Call</a>}<Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => onExtendBooking(booking)}>Extend 1 night</Button></div>
          </div>;
        })}</div>
      </Panel>}
      {checkoutFollowUps.length > 0 && <Panel className="mt-4 border-amber-300 bg-amber-50/70 p-4 sm:p-5">
        <div className="mb-3"><h2 className="font-semibold text-[#503915]">Checkout due now</h2><p className="mt-1 text-xs text-[#795e2b]">If the guest is not extending, complete checkout so housekeeping can prepare the room.</p></div>
        <div className="divide-y divide-amber-200">{checkoutFollowUps.map((booking) => {
          const guest = guestFor(data, booking.guestId);
          const unit = unitFor(data, booking.unitId);
          return <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0"><div><p className="text-sm font-medium text-[#3c3322]">{guest?.name || "Guest"} · Room {unit?.number || "—"}</p><p className="mt-0.5 text-xs text-[#795e2b]">Due out by {data.settings.checkOutTime}</p></div><Button className="min-h-9 px-3 text-sm" onClick={() => onBookingAction(booking, "checkout")}>Check out</Button></div>;
        })}</div>
      </Panel>}
      {housekeepingPrepAlerts.length > 0 && (
        <Panel className="mt-4 border-[#d7e3d9] bg-[#f5f8f4] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[#283b30]">Prepare housekeeping for check-outs</h2>
              <p className="mt-1 text-xs text-[#66776c]">Call housekeeping before noon so rooms can be cleaned after guests leave.</p>
            </div>
            <Button variant="secondary" onClick={() => onNavigate("housekeeping")}>
              <ClipboardList size={16} />Housekeeping board
            </Button>
          </div>
          <div className="divide-y divide-[#dce6dd]">
            {housekeepingPrepAlerts.map((booking) => {
              const guest = guestFor(data, booking.guestId);
              const unit = unitFor(data, booking.unitId);
              return (
                <div key={booking.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-[#2e3e34]">Room {unit?.number || "—"} · {guest?.name || "Guest"}</p>
                  <p className="mt-0.5 text-xs text-[#66776c]">Due out by {data.settings.checkOutTime}. Call housekeeping to tidy the room after checkout.</p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
      {lowStockItems.length > 0 && (
        <Panel className="order-first mt-4 border-rose-300 bg-rose-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <CircleAlert className="mt-0.5 shrink-0 text-rose-700" size={19} />
              <div>
                <h2 className="font-semibold text-rose-900">Low stock · restock needed</h2>
                <p className="mt-1 text-xs text-rose-800">{lowStockItems.length} item{lowStockItems.length === 1 ? "" : "s"} at or below minimum. Contact the supplier or request a purchase.</p>
              </div>
            </div>
            <Button variant="danger" className="min-h-9" onClick={() => onNavigate("purchasing")}><ShoppingCart size={15} />Request restock</Button>
          </div>
          <div className="mt-3 divide-y divide-rose-200">
            {lowStockItems.slice(0, 5).map((item) => {
              const supplier = data.suppliers.find((entry) => entry.id === item.supplierId);
              return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-rose-950">{item.name} · {item.quantity} {item.unit} left <span className="font-normal text-rose-800">(minimum {item.minimum})</span></p>
                {supplier?.phone ? <a href={`tel:${supplier.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-900 underline"><PhoneCall size={13} />Call {supplier.name}</a> : <span className="text-xs text-rose-800">Supplier contact not recorded</span>}
              </div>;
            })}
          </div>
        </Panel>
      )}
      {
        <div className="order-first mt-4 grid gap-4 xl:grid-cols-[1.7fr_0.9fr]">
          <Panel className="p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-[#25332b]">Front desk</h2>
                <p className="mt-1 text-xs text-[#7a8880]">
                  Today’s front desk queue and room readiness
                </p>
              </div>
              <Button variant="secondary" onClick={() => onNavigate("bookings")}>
                <CalendarDays size={16} />
                Open bookings
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Arrivals"
                value={deskSummary.arrivalsToday}
                note="Confirmed check-ins"
                icon={ArrowRight}
              />
              <StatCard
                label="Departures"
                value={deskSummary.departuresToday}
                note="Guests checking out"
                icon={CalendarDays}
              />
              <StatCard
                label="Ready rooms"
                value={deskSummary.readyRooms}
                note="Available or inspected"
                icon={BedDouble}
              />
              <StatCard
                label="Priority actions"
                value={deskSummary.priorityActions}
                note="Follow-ups today"
                icon={Bell}
              />
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-[#e7eee8] bg-[#f9fbf9] p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-[#294038]">Arrivals due</h3>
                  <span className="text-xs text-[#718078]">{deskSummary.arrivalsToday} guests</span>
                </div>
                {deskSummary.arrivalQueue.length ? (
                  <div className="space-y-2.5">
                    {deskSummary.arrivalQueue.slice(0, 4).map((guest) => (
                      <div key={guest.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-2">
                        <div>
                          <p className="text-sm font-medium text-[#2c3b34]">{guest.guestName}</p>
                          <p className="text-xs text-[#718078]">Room {guest.roomNumber}</p>
                        </div>
                        <Button
                          variant="secondary"
                          className="min-h-8 px-2.5 text-xs"
                          onClick={() => {
                            const booking = data.bookings.find((item) => item.id === guest.id);
                            if (booking) onBookingAction(booking, "checkin");
                          }}
                        >
                          Check in
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyPanel
                    icon={CalendarDays}
                    title="No arrivals"
                    detail="Confirmed arrivals will appear here."
                  />
                )}
              </div>
              <div className="rounded-xl border border-[#e7eee8] bg-[#f9fbf9] p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-[#294038]">Check-outs due</h3>
                  <span className="text-xs text-[#718078]">{deskSummary.departuresToday} rooms</span>
                </div>
                {deskSummary.departureQueue.length ? (
                  <div className="space-y-2.5">
                    {deskSummary.departureQueue.slice(0, 4).map((guest) => (
                      <div key={guest.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-2">
                        <div>
                          <p className="text-sm font-medium text-[#2c3b34]">{guest.guestName}</p>
                          <p className="text-xs text-[#718078]">Room {guest.roomNumber}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${guest.isLate ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                          {guest.isLate ? "Follow up" : "On track"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyPanel
                    icon={Bell}
                    title="No departures"
                    detail="Checkout follow-ups will appear here."
                  />
                )}
              </div>
            </div>
          </Panel>
          <Panel className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[#25332b]">Quick actions</h2>
                <p className="mt-1 text-xs text-[#7a8880]">Keep the desk moving</p>
              </div>
              <span className="grid size-8 place-items-center rounded-full bg-[#edf6f0] text-[#176b54]">
                <Check size={16} />
              </span>
            </div>
            <div className="space-y-2.5">
              <Button variant="secondary" className="w-full justify-between" onClick={() => onNavigate("bookings")}>
                <span>Reservations</span>
                <ArrowRight size={15} />
              </Button>
              <Button variant="secondary" className="w-full justify-between" onClick={() => onNavigate("housekeeping")}>
                <span>Housekeeping board</span>
                <ClipboardList size={15} />
              </Button>
              <Button variant="secondary" className="w-full justify-between" onClick={() => onNavigate("rooms")}>
                <span>Room status</span>
                <BedDouble size={15} />
              </Button>
              <Button variant="secondary" className="w-full justify-between" onClick={() => onNavigate("inventory")}>
                <span>Restock checks</span>
                <Package size={15} />
              </Button>
            </div>
            {deskSummary.lowStockItems > 0 && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Low stock alert</p>
                <p className="mt-2 text-sm font-medium text-rose-900">{deskSummary.lowStockItems} item{deskSummary.lowStockItems === 1 ? "" : "s"} need restocking.</p>
              </div>
            )}
          </Panel>
        </div>
      }
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Panel className="p-4 sm:p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[#25332b]">Revenue overview</h2>
              <p className="mt-1 text-xs text-[#7a8880]">
                Payments received · last 7 days
              </p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-[#e4eae6] px-3 py-2 text-xs text-[#647269]">
              This week <ChevronDown size={14} />
            </button>
          </div>
          <div className="flex h-48 items-end gap-3 border-b border-[#e5ebe7] px-1 sm:gap-5">
            {barValues.map((height, index) => (
              <div
                key={index}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <div
                  className="w-full max-w-10 rounded-t-md bg-[#d8eee2] transition hover:bg-[#82bda2]"
                  style={{ height: `${height}%` }}
                  title={`Day ${index + 1}`}
                />
                <span className="pb-2 text-[11px] text-[#7c8981]">
                  {["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"][index]}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#718078]">
            <span className="size-2 rounded-full bg-[#72ae91]" />
            Revenue{" "}
            <span className="ml-auto font-medium text-[#35443b]">
              {formatMoney(revenue)}
            </span>
          </div>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#25332b]">Room status</h2>
              <p className="mt-1 text-xs text-[#7a8880]">
                Current availability
              </p>
            </div>
            <button
              onClick={() => onNavigate("rooms")}
              className="text-sm font-medium text-[#176b54] hover:underline"
            >
              View rooms
            </button>
          </div>
          <div className="my-4 flex items-center justify-center">
            <div
              className="grid size-36 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#d8ee82 ${occupancy}%, #dff2e7 ${occupancy}% 100%)`,
              }}
            >
              <div className="grid size-24 place-items-center rounded-full bg-white text-center">
                <span className="text-3xl font-semibold text-[#26342d]">
                  {occupancy}%
                </span>
                <span className="text-[10px] text-[#7b8981]">occupied</span>
              </div>
            </div>
          </div>
          <div className="space-y-2.5 border-t border-[#edf1ee] pt-3 text-sm">
            <div className="flex justify-between text-[#718078]">
              <span>Occupied</span>
              <b className="font-medium text-[#26342d]">{occupied} units</b>
            </div>
            <div className="flex justify-between text-[#718078]">
              <span>Available / inspected</span>
              <b className="font-medium text-[#26342d]">
                {
                  inventoryUnits.filter((unit) =>
                    ["available", "inspected"].includes(unit.status),
                  ).length
                }{" "}
                units
              </b>
            </div>
            <div className="flex justify-between text-[#718078]">
              <span>Out of order</span>
              <b className="font-medium text-[#26342d]">
                {
                  inventoryUnits.filter((unit) => unit.status === "out_of_order")
                    .length
                }{" "}
                unit
              </b>
            </div>
          </div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-semibold text-[#25332b]">
                Recent reservations
              </h2>
              <p className="mt-1 text-xs text-[#7a8880]">
                Latest booking activity
              </p>
            </div>
            <button
              onClick={() => onNavigate("bookings")}
              className="text-sm font-medium text-[#176b54] hover:underline"
            >
              All bookings
            </button>
          </div>
          <DataTable
            columns={[
              { key: "id", label: "Booking ID" },
              {
                key: "guest",
                label: "Guest",
                render: (row) => guestFor(data, row.guestId)?.name,
              },
              {
                key: "unit",
                label: "Unit",
                render: (row) => unitFor(data, row.unitId)?.number,
              },
              {
                key: "dates",
                label: "Stay",
                render: (row) =>
                  `${formatDate(row.checkIn)} – ${formatDate(row.checkOut)}`,
              },
              {
                key: "status",
                label: "Status",
                render: (row) => <Status value={row.status} />,
              },
              {
                key: "total",
                label: "Total",
                render: (row) => formatMoney(row.totalKobo),
              },
            ]}
            rows={recent}
          />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#25332b]">Today’s arrivals</h2>
              <p className="mt-1 text-xs text-[#7a8880]">
                {arrivals} expected today
              </p>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-[#edf6f0] text-[#176b54]">
              <Users size={18} />
            </span>
          </div>
          {data.bookings.filter(
            (booking) =>
              booking.checkIn === TODAY && booking.status === "confirmed",
          ).length ? (
            data.bookings
              .filter(
                (booking) =>
                  booking.checkIn === TODAY && booking.status === "confirmed",
              )
              .map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-3 border-t border-[#edf1ee] py-3"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-[#e8f3ec] text-xs font-semibold text-[#23694f]">
                    {initials(guestFor(data, booking.guestId)?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#344239]">
                      {guestFor(data, booking.guestId)?.name}
                    </p>
                    <p className="text-xs text-[#7b8981]">
                      Unit {unitFor(data, booking.unitId)?.number} ·{" "}
                      {booking.adults} adults
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="min-h-8 px-2.5 text-xs"
                    onClick={() => onBookingAction(booking, "checkin")}
                  >
                    Check in
                  </Button>
                </div>
              ))
          ) : (
            <EmptyPanel
              icon={CalendarDays}
              title="No arrivals due"
              detail="New confirmed arrivals will appear here."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function BookingsPage({
  data,
  search,
  onSearch,
  role,
  onCreate,
  onAction,
  onNavigate,
}) {
  const [filter, setFilter] = useState("all");
  const options = [
    ["all", "All bookings"],
    ["arrivals", "Arrivals"],
    ["departures", "Departures"],
    ["in_house", "In house"],
    ["cancelled", "Cancelled"],
  ];
  const rows = data.bookings.filter((booking) => {
    const text =
      `${booking.id} ${guestFor(data, booking.guestId)?.name} ${unitFor(data, booking.unitId)?.number} ${booking.status}`.toLowerCase();
    const dateMatch =
      filter === "arrivals"
        ? booking.checkIn === TODAY
        : filter === "departures"
          ? booking.checkOut === TODAY
          : filter === "in_house"
            ? booking.status === "checked_in"
            : filter === "cancelled"
              ? booking.status === "cancelled"
              : true;
    return dateMatch && text.includes(search.toLowerCase());
  });
  const columns = [
    {
      key: "id",
      label: "Booking ID",
      render: (row) => (
        <span className="font-medium text-[#34443a]">{row.id}</span>
      ),
    },
    {
      key: "guest",
      label: "Guest",
      render: (row) => (
        <button
          onClick={() => onNavigate("guests")}
          className="text-left font-medium text-[#176b54] hover:underline"
        >
          {guestFor(data, row.guestId)?.name || "Guest"}
        </button>
      ),
    },
    {
      key: "room",
      label: "Room",
      render: (row) =>
        `${unitFor(data, row.unitId)?.number || "—"} · ${roomTypeFor(data, unitFor(data, row.unitId)?.roomTypeId)?.name || "—"}`,
    },
    {
      key: "stay",
      label: "Stay",
      render: (row) => (
        <span>
          {formatDate(row.checkIn)}
          <span className="mx-1 text-[#a4aea8]">→</span>
          {formatDate(row.checkOut)}
        </span>
      ),
    },
    {
      key: "guests",
      label: "Guests",
      render: (row) =>
        `${row.adults} adults${row.children ? ` · ${row.children} children` : ""}`,
    },
    {
      key: "total",
      label: "Total",
      render: (row) => formatMoney(row.totalKobo),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <Status value={row.status} />,
    },
    {
      key: "actions",
      label: "",
      render: (row) =>
        row.status === "confirmed" ? (
          <div className="flex gap-1">
            {allowed(role, "edit_booking") && <Button variant="quiet" className="min-h-8 px-2 text-xs" onClick={() => onAction(row, "edit")}>Edit</Button>}
            <Button
              variant="secondary"
              className="min-h-8 px-2 text-xs"
              onClick={() => onAction(row, "checkin")}
            >
              Check in
            </Button>
            {allowed(role, "cancel") && (
              <button
                title="Cancel booking"
                onClick={() => onAction(row, "cancel")}
                className="grid size-8 place-items-center rounded-lg text-[#78867e] hover:bg-rose-50 hover:text-rose-700"
              >
                <MoreHorizontal size={17} />
              </button>
            )}
          </div>
        ) : row.status === "checked_in" ? (
          <Button
            variant="secondary"
            className="min-h-8 px-2 text-xs"
            onClick={() => onAction(row, "checkout")}
          >
            Check out
          </Button>
        ) : row.status === "cancelled" && allowed(role, "cancel") ? (
          <Button variant="secondary" className="min-h-8 px-2 text-xs" onClick={() => onAction(row, "restore")}>Restore</Button>
        ) : row.status === "confirmed" && row.checkIn < TODAY && allowed(role, "cancel") ? (
          <Button variant="danger" className="min-h-8 px-2 text-xs" onClick={() => onAction(row, "no_show")}>No-show</Button>
        ) : (
          <span className="text-xs text-[#98a39c]">—</span>
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Reservations"
        description="Create bookings, manage arrivals, and keep guest stays in one place."
        action={
          <Button onClick={() => onCreate("booking")}>
            <Plus size={16} />
            New booking
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-[#edf2ee] p-1">
          {options.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium ${filter === value ? "bg-white text-[#26342d] shadow-sm" : "text-[#6e7c73] hover:text-[#28372e]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder="Search reservations"
        />
      </div>
      <Panel>
        <DataTable
          columns={columns}
          rows={rows}
          empty="No reservations match this view."
        />
      </Panel>
    </>
  );
}

function GuestsPage({ data, search, onSearch, onCreate }) {
  const rows = data.guests.filter((guest) =>
    `${guest.name} ${guest.phone} ${guest.email} ${guest.idNumber} ${guest.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Guests"
        description="Guest profiles, contact details, loyalty tiers, and stay history."
        action={
          <Button onClick={() => onCreate("guest")}>
            <Plus size={16} />
            Add guest
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <span className="rounded-lg bg-white px-3 py-2 text-sm text-[#65746a]">
            {data.guests.length} profiles
          </span>
          <span className="rounded-lg bg-white px-3 py-2 text-sm text-[#65746a]">
            {data.guests.filter((guest) => guest.tier === "Platinum").length}{" "}
            Platinum
          </span>
        </div>
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder="Name, phone, email, ID"
        />
      </div>
      <Panel>
        <DataTable
          columns={[
            {
              key: "name",
              label: "Guest",
              render: (guest) => (
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-[#e9f3ec] text-xs font-semibold text-[#24694e]">
                    {initials(guest.name)}
                  </span>
                  <div>
                    <p className="font-medium text-[#344239]">{guest.name}</p>
                    <p className="text-xs text-[#7c8981]">{guest.id}</p>
                  </div>
                </div>
              ),
            },
            {
              key: "phone",
              label: "Contact",
              render: (guest) => (
                <div>
                  {guest.phone}
                  <p className="text-xs text-[#7c8981]">{guest.email}</p>
                </div>
              ),
            },
            { key: "nationality", label: "Nationality" },
            {
              key: "tier",
              label: "Loyalty",
              render: (guest) => (
                <div>
                  <Status value={guest.tier.toLowerCase()} />
                  <p className="mt-1 text-xs text-[#7c8981]">
                    {guest.points.toLocaleString()} pts
                  </p>
                </div>
              ),
            },
            {
              key: "stays",
              label: "Stays",
              render: (guest) =>
                data.bookings.filter((booking) => booking.guestId === guest.id)
                  .length,
            },
            {
              key: "action",
              label: "",
              render: () => (
                <span className="text-xs text-[#859188]">Profile details</span>
              ),
            },
          ]}
          rows={rows}
          empty="No guest profiles found."
        />
      </Panel>
    </>
  );
}

function RoomsPage({
  rooms,
  search,
  onSearch,
  role,
  onCreate,
  onEditRoom,
  onBlock,
  onUnitStatus,
  loading,
  error,
}) {
  const rows = rooms.filter((room) =>
    `${room.name} ${room.number} ${room.roomTypeName} ${room.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const counts = ["available", "occupied", "dirty", "out_of_order"].map(
    (status) => [status, rooms.filter((room) => room.status === status).length],
  );
  return (
    <>
      <PageHeader
        title="Rooms & units"
        description="Thirteen named rooms, managed from the hotel database."
        action={
          <Button onClick={() => onCreate("booking")} disabled={!allowed(role, "booking")}>
            <Plus size={16} />New reservation
          </Button>
        }
      />
      {error && (
        <Panel className="mb-4 flex items-center gap-3 border-rose-200 p-4 text-sm text-rose-800">
          <CircleAlert size={18} className="shrink-0" />
          <span>{error}</span>
        </Panel>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map(([status, value]) => (
          <Panel key={status} className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs capitalize text-[#77857d]">
                {status.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#27362e]">
                {value}
              </p>
            </div>
            <Status value={status} />
          </Panel>
        ))}
      </div>
      <div className="mb-4 flex justify-end">
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder="Find a room"
        />
      </div>
      {loading ? (
        <p className="py-12 text-center text-sm text-[#718078]">Loading rooms…</p>
      ) : rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((room) => (
            <Panel key={room.id} className="overflow-hidden rounded-lg">
              <div className="relative aspect-[16/10] bg-[#e8eee9]">
                {room.images?.[0] && (
                  <img
                    src={room.images[0]}
                    alt={`${room.name} room`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="absolute left-3 top-3"><Status value={room.status} /></div>
                {role === "ceo" && (
                  <Button
                    variant="secondary"
                    className="absolute right-3 top-3 min-h-9 bg-white/95 px-3"
                    onClick={() => onEditRoom(room)}
                    title={`Edit ${room.name}`}
                  >
                    <ImagePlus size={16} />Edit room
                  </Button>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#27362e]">{room.name}</h2>
                    <p className="mt-0.5 text-xs text-[#77857d]">Room {room.number}</p>
                  </div>
                  <span className="text-right text-sm font-semibold text-[#27362e]">
                    {room.rateKobo ? formatMoney(room.rateKobo) : "Rate not set"}
                    {room.rateKobo && <span className="block text-xs font-normal text-[#77857d]">per night</span>}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-[#e8eeea] pt-3 text-sm">
                  <div>
                    <p className="text-xs text-[#77857d]">Bed size</p>
                    <p className="mt-1 font-medium text-[#34443a]">{room.bedType || "Same size, not specified"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#77857d]">Maximum guests</p>
                    <p className="mt-1 font-medium text-[#34443a]">{room.maxGuests}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[#e8eeea] pt-3 text-xs text-[#718078]">
                  <span>{room.activeReservations ? `${room.activeReservations} active reservation${room.activeReservations === 1 ? "" : "s"}` : "No current reservations"}</span>
                  {room.sizeM2 ? <span>{room.sizeM2} m²</span> : <span>Size not set</span>}
                </div>
                {allowed(role, "inspect") && (room.status === "out_of_order" ? (
                  <div className="flex justify-end border-t border-[#e8eeea] pt-3">
                    <Button variant="secondary" className="min-h-8 px-2.5 text-xs" onClick={() => onUnitStatus(room, "available")}>
                      Return to service
                    </Button>
                  </div>
                ) : ["available", "inspected"].includes(room.status) ? (
                  <div className="flex justify-end border-t border-[#e8eeea] pt-3">
                    <Button variant="secondary" className="min-h-8 px-2.5 text-xs" onClick={() => onBlock(room)}>
                      Block dates
                    </Button>
                  </div>
                ) : null)}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyPanel icon={BedDouble} title="No rooms found" detail="Adjust the search or check the database connection." />
      )}
    </>
  );
}

function CalendarPage({ data, onCreate }) {
  const [month, setMonth] = useState(new Date(Date.UTC(2026, 9, 1)));
  const [view, setView] = useState("month");
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const monthStart = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  );
  const offset = (monthStart.getUTCDay() + 6) % 7;
  const days = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const selected = new Date(`${selectedDate}T00:00:00Z`);
  const weekStart = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), selected.getUTCDate() - ((selected.getUTCDay() + 6) % 7)));
  const visibleDates = view === "month"
    ? cells.map((day) => day ? new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)) : null)
    : Array.from({ length: view === "day" ? 1 : 7 }, (_, index) => new Date(weekStart.getTime() + (view === "day" ? 0 : index) * 86400000));
  const label = view === "month" ? new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(month) : view === "day" ? formatDate(selectedDate) : `${formatDate(visibleDates[0].toISOString().slice(0, 10))} – ${formatDate(visibleDates.at(-1).toISOString().slice(0, 10))}`;
  function moveCalendar(direction) {
    if (view === "month") {
      setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + direction, 1)));
      return;
    }
    const nextDate = new Date(selected.getTime() + direction * (view === "week" ? 7 : 1) * 86400000);
    setSelectedDate(nextDate.toISOString().slice(0, 10));
  }
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Monthly, weekly, and daily arrivals and departures across every unit."
        action={
          <Button onClick={() => onCreate("booking")}>
            <Plus size={16} />
            New booking
          </Button>
        }
      />
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e8eeea] p-4 sm:px-5">
          <div>
            <h2 className="font-semibold capitalize text-[#28362e]">{label}</h2>
            <p className="mt-1 text-xs text-[#78867e]">
              Booking dates use check-in inclusive, check-out exclusive.
            </p>
          </div>
          <div className="flex items-center gap-2"><div className="flex rounded-lg bg-[#edf2ee] p-1">{["month", "week", "day"].map((option) => <button key={option} onClick={() => setView(option)} aria-pressed={view === option} className={`rounded-md px-2.5 py-1.5 text-xs capitalize ${view === option ? "bg-white font-medium text-[#26342d] shadow-sm" : "text-[#6e7c73]"}`}>{option}</button>)}</div><div className="flex gap-1">
            <button
              onClick={() => moveCalendar(-1)}
              className="grid size-9 place-items-center rounded-lg hover:bg-[#f1f5f2]"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => moveCalendar(1)}
              className="grid size-9 place-items-center rounded-lg hover:bg-[#f1f5f2]"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div></div>
        </div>
        {view !== "day" && <div className="grid grid-cols-7 border-b border-[#e8eeea] bg-[#f7f9f7] text-center text-xs font-medium text-[#738078]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="py-3">
              {day}
            </div>
          ))}
        </div>}
        <div className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-7"}`}>
          {visibleDates.map((date, index) => {
            const day = date?.getUTCDate();
            const iso = date?.toISOString().slice(0, 10) || "";
            const bookings = data.bookings.filter(
              (booking) =>
                booking.status !== "cancelled" &&
                (booking.checkIn === iso || booking.checkOut === iso),
            );
            return (
              <button
                key={`${day}-${index}`}
                onClick={() => { if (!day) return; setSelectedDate(iso); onCreate("booking", { checkIn: iso }); }}
                className="min-h-24 border-b border-r border-[#edf1ee] p-1.5 text-left align-top transition hover:bg-[#f8fbf8] sm:min-h-32 sm:p-2"
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs ${iso === TODAY ? "bg-[#176b54] font-semibold text-white" : "text-[#66746b]"}`}
                >
                  {day || ""}
                </span>
                <div className="mt-1 space-y-1">
                  {bookings.slice(0, 2).map((booking) => (
                    <span
                      key={booking.id}
                      className={`block truncate rounded px-1.5 py-1 text-[10px] ${booking.checkIn === iso ? "bg-[#e2f1e7] text-[#286a4f]" : "bg-[#edf2f7] text-[#4e6880]"}`}
                    >
                      {booking.checkIn === iso ? "In" : "Out"} ·{" "}
                      {guestFor(data, booking.guestId)?.name}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function HousekeepingPage({ data, role, currentUserName, onCreate, onTaskAction }) {
  const tasks = role === "worker" ? data.tasks.filter((task) => task.assignedTo === currentUserName) : data.tasks;
  const columns = [
    {
      key: "unit",
      label: "Unit",
      render: (task) => unitFor(data, task.unitId)?.number,
    },
    { key: "type", label: "Task" },
    {
      key: "status",
      label: "Status",
      render: (task) => <Status value={task.status} />,
    },
    { key: "priority", label: "Priority" },
    { key: "assignedTo", label: "Assigned to" },
    { key: "updatedAt", label: "Updated" },
    {
      key: "action",
      label: "",
      render: (task) => {
        const next =
          task.status === "open"
            ? "in_progress"
            : task.status === "in_progress"
              ? "done"
              : task.status === "done"
                ? "inspected"
                : null;
        return next && (next !== "inspected" || allowed(role, "inspect")) ? (
          <Button
            variant="secondary"
            className="min-h-8 px-2.5 text-xs"
            onClick={() => onTaskAction(task, next)}
          >
            {next === "inspected"
              ? "Inspect"
              : next === "done"
                ? "Finish"
                : "Start"}
          </Button>
        ) : (
          <span className="text-xs text-[#849188]">
            {task.status === "inspected" ? "Complete" : "Manager inspection"}
          </span>
        );
      },
    },
  ];
  return (
    <>
      <PageHeader
        title="Housekeeping"
        description="Track cleaning progress, staff assignments, and inspection readiness."
        action={
          <Button onClick={() => onCreate("task")}>
            <Plus size={16} />
            Assign task
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["open", "in_progress", "done", "inspected"].map((status) => (
          <StatCard
            key={status}
            label={status.replace("_", " ")}
            value={tasks.filter((task) => task.status === status).length}
            note={
              status === "open"
                ? "Awaiting staff"
                : status === "inspected"
                  ? "Ready for guests"
                  : "Tasks today"
            }
            icon={ClipboardList}
          />
        ))}
      </div>
      <Panel>
        <div className="px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-[#28362e]">Task board</h2>
          <p className="mt-1 text-xs text-[#78867e]">
            Checkout cleans are created automatically when a stay is completed.
          </p>
        </div>
        <DataTable columns={columns} rows={tasks} empty={role === "worker" ? "No housekeeping tasks are assigned to you." : undefined} />
      </Panel>
    </>
  );
}

function MenuItemDialog({ data, onClose, onSave, preset = null }) {
  const [name, setName] = useState(preset?.name || "");
  const [category, setCategory] = useState(preset?.category || "");
  const [description, setDescription] = useState("");
  const [station, setStation] = useState(preset?.station || "kitchen");
  const [priceNaira, setPriceNaira] = useState("");
  const [recipe, setRecipe] = useState(preset ? [] : [{ inventoryItemId: data.inventory[0]?.id || "", quantity: "1" }]);
  const [modifiers, setModifiers] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim() || !category.trim() || !priceNaira || !recipe.length || recipe.some((line) => !line.inventoryItemId || Number(line.quantity) <= 0)) {
      setError("Enter the menu details and at least one valid recipe ingredient.");
      return;
    }
    setSaving(true);
    const result = await onSave({
      name: name.trim(),
      category: category.trim(),
      description,
      station,
      priceKobo: Math.round(Number(priceNaira) * 100),
      recipe: recipe.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: Number(line.quantity) })),
      modifiers: modifiers.filter((modifier) => modifier.name.trim()).map((modifier) => ({
        name: modifier.name.trim(),
        priceDeltaKobo: Math.round(Number(modifier.priceNaira || 0) * 100),
        recipe: modifier.inventoryItemId && Number(modifier.quantity) > 0
          ? [{ inventoryItemId: modifier.inventoryItemId, quantity: Number(modifier.quantity) }]
          : [],
      })),
    });
    setSaving(false);
    if (result?.error) setError(result.error);
    else onClose();
  }

  return (
    <ModalFrame title="Add menu item" description="Choose ingredients so accepting an order deducts stock." onClose={onClose}>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField field={{ name: "name", label: "Menu item" }} value={name} onChange={(event) => setName(event.target.value)} />
          <InputField field={{ name: "category", label: "Category", placeholder: "Breakfast, drinks…" }} value={category} onChange={(event) => setCategory(event.target.value)} />
          <InputField field={{ name: "station", label: "Station", type: "select", options: ["kitchen", "bar"].map((value) => ({ value, label: value === "kitchen" ? "Kitchen" : "Bar" })) }} value={station} onChange={(event) => setStation(event.target.value)} />
          <InputField field={{ name: "price", label: "Price (₦)", type: "number", min: 0 }} value={priceNaira} onChange={(event) => setPriceNaira(event.target.value)} />
          <div className="sm:col-span-2"><InputField field={{ name: "description", label: "Description", type: "textarea", required: false }} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        </div>
        <div className="space-y-3 border-t border-[#e8eeea] pt-4">
          <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Recipe</h3>{preset && !data.inventory.length && <p className="mt-1 text-xs text-amber-800">Add the required ingredients to Inventory before setting up this dish.</p>}</div><Button type="button" variant="secondary" className="min-h-8 px-2.5 text-xs" onClick={() => setRecipe((lines) => [...lines, { inventoryItemId: preset ? "" : data.inventory[0]?.id || "", quantity: "1" }])}><Plus size={14} />Ingredient</Button></div>
          {recipe.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_100px_auto] items-end gap-2">
              <InputField field={{ name: `ingredient-${index}`, label: index === 0 ? "Inventory item" : `Ingredient ${index + 1}`, type: "select", options: data.inventory.map((item) => ({ value: item.id, label: `${item.name} · ${item.unit}` })) }} value={line.inventoryItemId} onChange={(event) => setRecipe((lines) => lines.map((item, row) => row === index ? { ...item, inventoryItemId: event.target.value } : item))} />
              <InputField field={{ name: `quantity-${index}`, label: "Qty", type: "number", min: 0.01, step: 0.01 }} value={line.quantity} onChange={(event) => setRecipe((lines) => lines.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} />
              {recipe.length > 1 && <Button type="button" variant="quiet" className="min-h-10 px-2" aria-label="Remove ingredient" onClick={() => setRecipe((lines) => lines.filter((_, row) => row !== index))}><X size={16} /></Button>}
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-[#e8eeea] pt-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Modifiers</h3><Button type="button" variant="secondary" className="min-h-8 px-2.5 text-xs" onClick={() => setModifiers((items) => [...items, { name: "", priceNaira: "0", inventoryItemId: "", quantity: "1" }])}><Plus size={14} />Modifier</Button></div>
          {modifiers.map((modifier, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-[#e8eeea] p-3 sm:grid-cols-2">
              <InputField field={{ name: `modifier-${index}`, label: "Name" }} value={modifier.name} onChange={(event) => setModifiers((items) => items.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} />
              <InputField field={{ name: `modifier-price-${index}`, label: "Extra price (₦)", type: "number", min: 0 }} value={modifier.priceNaira} onChange={(event) => setModifiers((items) => items.map((item, row) => row === index ? { ...item, priceNaira: event.target.value } : item))} />
              <InputField field={{ name: `modifier-stock-${index}`, label: "Extra ingredient (optional)", type: "select", required: false, options: [{ value: "", label: "No extra ingredient" }, ...data.inventory.map((item) => ({ value: item.id, label: `${item.name} · ${item.unit}` }))] }} value={modifier.inventoryItemId} onChange={(event) => setModifiers((items) => items.map((item, row) => row === index ? { ...item, inventoryItemId: event.target.value } : item))} />
              <div className="flex items-end gap-2"><InputField field={{ name: `modifier-qty-${index}`, label: "Extra qty", type: "number", min: 0.01, step: 0.01, required: false }} value={modifier.quantity} onChange={(event) => setModifiers((items) => items.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /><Button type="button" variant="quiet" className="min-h-10 px-2" aria-label="Remove modifier" onClick={() => setModifiers((items) => items.filter((_, row) => row !== index))}><X size={16} /></Button></div>
            </div>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !data.inventory.length}>{saving ? "Saving…" : "Save menu item"}</Button></div>
      </form>
    </ModalFrame>
  );
}

function FnbOrderDialog({ data, fnbData, onClose, onSave }) {
  const checkedInBookings = data.bookings.filter((booking) => booking.databaseBooking && booking.status === "checked_in");
  const [paymentMethod, setPaymentMethod] = useState(checkedInBookings.length ? "room_charge" : "cash");
  const [bookingId, setBookingId] = useState(checkedInBookings[0]?.id || "");
  const [source, setSource] = useState(checkedInBookings.length ? "room_service" : "lounge");
  const [guestName, setGuestName] = useState("");
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const menu = fnbData.menuItems.filter((item) => item.available);
  const subtotal = cart.reduce((sum, line) => {
    const menuItem = menu.find((item) => item.id === line.menuItemId);
    const modifierTotal = (line.modifierIds || []).reduce((total, id) => total + (menuItem?.modifiers.find((modifier) => modifier.id === id)?.priceDeltaKobo || 0), 0);
    return sum + ((menuItem?.priceKobo || 0) + modifierTotal) * line.quantity;
  }, 0);
  const service = Math.round(subtotal * Number(data.settings.servicePercent || 0) / 100);
  const vat = Math.round(subtotal * Number(data.settings.vatPercent || 0) / 100);
  function addItem(menuItem) {
    setCart((lines) => {
      const existing = lines.find((line) => line.menuItemId === menuItem.id && !line.modifierIds?.length);
      return existing
        ? lines.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line)
        : [...lines, { menuItemId: menuItem.id, quantity: 1, modifierIds: [] }];
    });
  }
  async function submit(event) {
    event.preventDefault();
    if (!cart.length || (paymentMethod === "room_charge" && !bookingId)) {
      setError("Add menu items and choose an active booking for room charges.");
      return;
    }
    setSaving(true);
    const booking = checkedInBookings.find((item) => item.id === bookingId);
    const result = await onSave({
      items: cart,
      source,
      paymentMethod,
      unitId: booking ? unitFor(data, booking.unitId)?.id : "",
      bookingId: paymentMethod === "room_charge" ? bookingId : "",
      guestName: booking ? guestFor(data, booking.guestId)?.name : guestName.trim(),
      notes,
    });
    setSaving(false);
    if (result?.error) setError(result.error);
    else onClose();
  }
  return (
    <ModalFrame title="New food & drink order" description="Stock is deducted when the kitchen/bar accepts the order." onClose={onClose}>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField field={{ name: "source", label: "Order source", type: "select", options: ["lounge", "room_service", "restaurant", "bar", "counter", "poolside"].map((value) => ({ value, label: value.replaceAll("_", " ") })) }} value={source} onChange={(event) => setSource(event.target.value)} />
          <InputField field={{ name: "paymentMethod", label: "Payment", type: "select", options: ["room_charge", "cash", "card", "transfer"].map((value) => ({ value, label: value.replaceAll("_", " ") })) }} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} />
          {paymentMethod === "room_charge" && <div className="sm:col-span-2"><InputField field={{ name: "bookingId", label: "Checked-in booking", type: "select", options: checkedInBookings.map((booking) => ({ value: booking.id, label: `${unitFor(data, booking.unitId)?.number} · ${guestFor(data, booking.guestId)?.name} · ${booking.id}` })) }} value={bookingId} onChange={(event) => setBookingId(event.target.value)} /></div>}
          {paymentMethod !== "room_charge" && <div className="sm:col-span-2"><InputField field={{ name: "guestName", label: "Guest name (optional)" }} value={guestName} onChange={(event) => setGuestName(event.target.value)} /></div>}
        </div>
        <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
          {menu.map((item) => <button key={item.id} type="button" onClick={() => addItem(item)} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-[#e1e9e3] px-3 py-2 text-left hover:bg-[#f4f7f4]"><span><span className="block text-sm font-medium">{item.name}</span><span className="text-xs text-[#77857d]">{item.category} · {item.station}</span></span><span className="text-sm font-semibold">{formatMoney(item.priceKobo)}</span></button>)}
          {!menu.length && <p className="text-sm text-[#718078]">No menu items are available yet.</p>}
        </div>
        <div className="space-y-2 border-t border-[#e8eeea] pt-3">
          <h3 className="text-sm font-semibold">Order</h3>
          {cart.map((line) => {
            const item = menu.find((entry) => entry.id === line.menuItemId);
            return <div key={line.menuItemId} className="space-y-2 rounded-lg bg-[#f7f9f7] p-3"><div className="flex items-center gap-3"><span className="min-w-0 flex-1 text-sm font-medium">{item?.name}</span><input aria-label={`${item?.name} quantity`} type="number" min="1" value={line.quantity} onChange={(event) => setCart((items) => items.map((row) => row.menuItemId === line.menuItemId ? { ...row, quantity: Math.max(1, Number(event.target.value)) } : row))} className="w-16 rounded-md border border-[#dfe7e1] px-2 py-1" /><button type="button" aria-label={`Remove ${item?.name}`} onClick={() => setCart((items) => items.filter((row) => row.menuItemId !== line.menuItemId))}><X size={16} /></button></div>{item?.modifiers.map((modifier) => <label key={modifier.id} className="flex items-center gap-2 text-xs text-[#58685e]"><input type="checkbox" checked={line.modifierIds.includes(modifier.id)} onChange={(event) => setCart((items) => items.map((row) => row.menuItemId === line.menuItemId ? { ...row, modifierIds: event.target.checked ? [...row.modifierIds, modifier.id] : row.modifierIds.filter((id) => id !== modifier.id) } : row))} />{modifier.name}{modifier.priceDeltaKobo ? ` (+${formatMoney(modifier.priceDeltaKobo)})` : ""}</label>)}</div>;
          })}
          <div className="flex justify-between text-sm font-semibold"><span>Subtotal + service + VAT</span><span>{formatMoney(subtotal + service + vat)}</span></div>
        </div>
        <InputField field={{ name: "notes", label: "Order notes / allergies", type: "textarea", required: false }} value={notes} onChange={(event) => setNotes(event.target.value)} />
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !menu.length}>{saving ? "Placing…" : "Place order"}</Button></div>
      </form>
    </ModalFrame>
  );
}

function FnbRefundDialog({ order, onClose, onSave }) {
  const [amountNaira, setAmountNaira] = useState((order.totalKobo / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const result = await onSave(order, { amountKobo: Math.round(Number(amountNaira) * 100), reason });
    if (result?.error) setError(result.error);
    else onClose();
  }
  return <ModalFrame title={`Refund ${order.orderNumber}`} description="Refunds are recorded against the original order." onClose={onClose}><form onSubmit={submit} className="space-y-4 p-5"><InputField field={{ name: "amount", label: "Refund amount (₦)", type: "number", min: 0.01 }} value={amountNaira} onChange={(event) => setAmountNaira(event.target.value)} /><InputField field={{ name: "reason", label: "Reason", type: "textarea" }} value={reason} onChange={(event) => setReason(event.target.value)} />{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Record refund</Button></div></form></ModalFrame>;
}

function RestaurantPage({ data, fnbData, role, loading, onAddMenu, onNewOrder, onStatus, onAvailability, onRefund }) {
  const [station, setStation] = useState("all");
  const queue = fnbData.orders.filter((order) => ["new", "accepted", "preparing", "ready", "served"].includes(order.status) && (station === "all" || order.items.some((item) => item.station === station)));
  const categories = [...new Set(fnbData.menuItems.map((item) => item.category))];
  return <>
    <PageHeader title="Food & drink" description="Menu, kitchen/bar queue, room charges, and counter orders." action={<div className="flex gap-2">{role !== "worker" && <Button variant="secondary" onClick={onAddMenu}><Plus size={16} />Menu item</Button>}<Button onClick={onNewOrder}><Plus size={16} />New order</Button></div>} />
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Panel><div className="border-b border-[#e8eeea] px-4 py-4"><h2 className="font-semibold">Menu</h2><p className="mt-1 text-xs text-[#77857d]">Recipes use tracked inventory; unavailable items cannot be ordered.</p></div>{loading ? <p className="p-5 text-sm">Loading menu…</p> : fnbData.menuItems.length ? <div className="divide-y divide-[#edf1ee]">{categories.map((category) => <div key={category}><h3 className="bg-[#f7f9f7] px-4 py-2 text-xs font-semibold uppercase text-[#718078]">{category}</h3>{fnbData.menuItems.filter((item) => item.category === category).map((item) => <div key={item.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-xs text-[#77857d]">{item.station} · {item.recipe.map((line) => `${line.name} ${line.quantity}${line.unit}`).join(", ")}</p></div><span className="text-sm font-semibold">{formatMoney(item.priceKobo)}</span>{role !== "worker" && <button onClick={() => onAvailability(item, !item.available)} className={`rounded-full px-2.5 py-1 text-xs ${item.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{item.available ? "Available" : "Unavailable"}</button>}</div>)}</div>)}</div> : <EmptyPanel icon={Utensils} title="Menu is empty" detail="Add menu items with recipe ingredients to start taking orders." />}</Panel>
      <Panel><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eeea] px-4 py-4"><div><h2 className="font-semibold">Kitchen & bar queue</h2><p className="mt-1 text-xs text-[#77857d]">Accepting an order deducts ingredients once.</p></div><div className="flex gap-1 rounded-lg bg-[#edf2ee] p-1">{["all", "kitchen", "bar"].map((value) => <button key={value} onClick={() => setStation(value)} className={`rounded-md px-3 py-1.5 text-xs capitalize ${station === value ? "bg-white font-semibold shadow-sm" : "text-[#718078]"}`}>{value}</button>)}</div></div>{queue.length ? <div className="divide-y divide-[#edf1ee]">{queue.map((order) => <div key={order.id} className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong className="text-sm">{order.orderNumber}</strong><Status value={order.status} /></div><p className="mt-1 text-xs text-[#718078]">{order.source.replaceAll("_", " ")} · {order.unitId ? `Room ${unitFor(data, order.unitId)?.number || "—"}` : "Counter"} · {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div><strong className="text-sm">{formatMoney(order.totalKobo)}</strong></div><div className="space-y-1">{order.items.filter((item) => station === "all" || item.station === station).map((item) => <p key={item.id} className="text-sm">{item.quantity} × {item.name}{item.modifiers.length ? <span className="text-xs text-[#718078]"> · {item.modifiers.map((modifier) => modifier.name).join(", ")}</span> : null}</p>)}</div><div className="flex flex-wrap gap-2">{({ new: ["accepted"], accepted: ["preparing"], preparing: ["ready"], ready: ["served"], served: ["billed"] })[order.status]?.map((next) => <Button key={next} className="min-h-8 px-2.5 text-xs capitalize" onClick={() => onStatus(order, next)}>{next === "accepted" ? "Accept & deduct stock" : next === "billed" ? "Bill / take payment" : next}</Button>)}{order.status === "billed" && role !== "worker" && <Button variant="danger" className="min-h-8 px-2.5 text-xs" onClick={() => onRefund(order)}>Refund</Button>}{order.status !== "billed" && order.status !== "cancelled" && (order.status === "new" || role !== "worker") && <Button variant="quiet" className="min-h-8 px-2.5 text-xs" onClick={() => onStatus(order, "cancelled")}>Cancel</Button>}</div></div>)}</div> : <EmptyPanel icon={ClipboardList} title="Queue is clear" detail="New orders will appear here for the kitchen and bar." />}</Panel>
    </div>
  </>;
}

function InventoryPage({ data, role, search, onSearch, onCreate, onStock, batches = [], minibarMovements = [] }) {
  const rows = data.inventory.filter((item) =>
    `${item.name} ${item.category} ${item.supplierId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const low = data.inventory.filter(
    (item) => item.quantity <= item.minimum,
  ).length;
  const value = data.inventory.reduce(
    (sum, item) => sum + item.quantity * item.costKobo,
    0,
  );
  const thirtyDays = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const expiredBatches = batches.filter((batch) => batch.expiryDate && batch.expiryDate < TODAY && batch.remainingQuantity > 0);
  const expiringBatches = batches.filter((batch) => batch.expiryDate && batch.expiryDate >= TODAY && batch.expiryDate <= thirtyDays && batch.remainingQuantity > 0);
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Track stock through recorded movements; on-hand quantities are never edited directly."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onCreate("item")}>
              <Plus size={16} />
              Add item
            </Button>
            <Button
              onClick={() => onStock("stock")}
              disabled={!allowed(role, "stock")}
            >
              <ArrowRight size={16} />
              Stock in
            </Button>
          </div>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Tracked items"
          value={data.inventory.length}
          note="Across food, linen, and supplies"
          icon={Package}
        />
        <StatCard
          label="Low stock"
          value={low}
          note="At or below minimum quantity"
          icon={CircleAlert}
        />
        <StatCard
          label="Stock value"
          value={formatMoney(value)}
          note="Quantity × unit cost"
          icon={Wallet}
        />
      </div>
      {(low > 0 || expiredBatches.length > 0 || expiringBatches.length > 0) && <Panel className="mb-4 border-amber-200 bg-amber-50/60 p-4"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 shrink-0 text-amber-700" size={18} /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-[#503915]">Inventory attention</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#795e2b]">{data.inventory.filter((item) => item.quantity <= item.minimum).map((item) => <span key={`low-${item.id}`}>Low: {item.name} ({item.quantity} {item.unit})</span>)}{expiredBatches.map((batch) => <span key={`expired-${batch.id}`}>Expired: {batch.itemName || data.inventory.find((item) => item.id === batch.itemId)?.name} · {formatDate(batch.expiryDate)}</span>)}{expiringBatches.map((batch) => <span key={`expiry-${batch.id}`}>Expiring: {batch.itemName || data.inventory.find((item) => item.id === batch.itemId)?.name} · {formatDate(batch.expiryDate)}</span>)}</div></div></div></Panel>}
      <div className="mb-4 flex justify-end">
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder="Search stock"
        />
      </div>
      <Panel>
        <DataTable
          columns={[
            {
              key: "name",
              label: "Item",
              render: (item) => (
                <span className="font-medium">{item.name}</span>
              ),
            },
            { key: "category", label: "Category" },
            {
              key: "quantity",
              label: "On hand",
              render: (item) => `${item.quantity} ${item.unit}`,
            },
            {
              key: "minimum",
              label: "Minimum",
              render: (item) => `${item.minimum} ${item.unit}`,
            },
            {
              key: "cost",
              label: "Unit cost",
              render: (item) => formatMoney(item.costKobo),
            },
            {
              key: "supplier",
              label: "Supplier",
              render: (item) =>
                data.suppliers.find(
                  (supplier) => supplier.id === item.supplierId,
                )?.name || "—",
            },
            {
              key: "status",
              label: "Status",
              render: (item) => (
                <Status
                  value={
                    item.quantity <= item.minimum ? "pending" : "available"
                  }
                />
              ),
            },
            {
              key: "action",
              label: "",
              render: (item) => (
                <div className="flex gap-1">
                  <Button variant="secondary" className="min-h-8 px-2 text-xs" onClick={() => onStock("stock", item)} disabled={!allowed(role, "stock")}>Restock</Button>
                  <Button variant="quiet" className="min-h-8 px-2 text-xs" onClick={() => onStock("stockOut", item)} disabled={!allowed(role, "stock_use")}>Use</Button>
                  {allowed(role, "stock") && <Button variant="quiet" className="min-h-8 px-2 text-xs" onClick={() => onStock("stockAdjust", item)}>Count</Button>}
                  {item.category.toLowerCase().includes("minibar") && allowed(role, "stock_use") && <Button variant="quiet" className="min-h-8 px-2 text-xs" onClick={() => onStock("minibar", item)}>Minibar</Button>}
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Panel>
      <Panel className="mt-4"><div className="px-4 py-4 sm:px-5"><h2 className="font-semibold text-[#28362e]">Expiry batches</h2><p className="mt-1 text-xs text-[#78867e]">Received food and drink lots are deducted by earliest expiry first.</p></div>{batches.length ? <DataTable columns={[{ key: "item", label: "Item", render: (batch) => batch.itemName || data.inventory.find((item) => item.id === batch.itemId)?.name }, { key: "batch", label: "Batch" }, { key: "remaining", label: "Remaining", render: (batch) => `${batch.remainingQuantity} ${batch.unit || ""}` }, { key: "expiry", label: "Expiry", render: (batch) => batch.expiryDate ? formatDate(batch.expiryDate) : "Not set" }, { key: "status", label: "Status", render: (batch) => <Status value={batch.expiryDate && batch.expiryDate < TODAY ? "expired" : batch.expiryDate && batch.expiryDate <= thirtyDays ? "pending" : "available"} /> }]} rows={batches.filter((batch) => batch.remainingQuantity > 0)} empty="No dated batches yet." /> : <EmptyPanel icon={Package} title="No dated batches" detail="Enter an expiry date when receiving perishable stock." />}</Panel>
      <Panel className="mt-4"><div className="px-4 py-4 sm:px-5"><h2 className="font-semibold text-[#28362e]">Minibar movements</h2></div>{minibarMovements.length ? <DataTable columns={[{ key: "room", label: "Room", render: (movement) => movement.roomNumber || unitFor(data, movement.unitId)?.number }, { key: "item", label: "Item", render: (movement) => movement.itemName || data.inventory.find((item) => item.id === movement.itemId)?.name }, { key: "quantity", label: "Quantity" }, { key: "type", label: "Movement", render: (movement) => movement.movementType }, { key: "reason", label: "Note" }, { key: "date", label: "Time", render: (movement) => new Date(movement.createdAt).toLocaleString() }]} rows={minibarMovements.slice(0, 10)} /> : <EmptyPanel icon={Package} title="No minibar use recorded" detail="Record guest consumption from a room's minibar action." />}</Panel>
      <Panel className="mt-4">
        <div className="px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-[#28362e]">
            Recent stock movements
          </h2>
        </div>
        {data.stockMovements.length ? (
          <DataTable
            columns={[
              { key: "id", label: "Movement" },
              {
                key: "item",
                label: "Item",
                render: (movement) =>
                  data.inventory.find((item) => item.id === movement.itemId)
                    ?.name,
              },
              { key: "type", label: "Type" },
              { key: "quantity", label: "Quantity" },
              { key: "reason", label: "Note" },
              { key: "date", label: "Date" },
            ]}
            rows={data.stockMovements.slice(0, 8)}
          />
        ) : (
          <EmptyPanel
            icon={Package}
            title="No movements recorded yet"
            detail="Stock-in, stock-out, and adjustments will be listed here."
          />
        )}
      </Panel>
    </>
  );
}

function PurchasingPage({ data, role, onCreate, onPurchaseAction }) {
  return (
    <>
      <PageHeader
        title="Purchasing"
        description="Create, approve, and receive supplier orders."
        action={
          <Button onClick={() => onCreate("purchase")}>
            <Plus size={16} />
            New purchase order
          </Button>
        }
      />
      <div className="mb-4 flex gap-3">
        <Panel className="flex flex-1 items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-lg bg-[#edf6f0] text-[#176b54]">
            <Building2 size={18} />
          </span>
          <div>
            <p className="text-xs text-[#748178]">Suppliers</p>
            <p className="text-xl font-semibold text-[#26342d]">
              {data.suppliers.length}
            </p>
          </div>
        </Panel>
        <Panel className="flex flex-1 items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
            <ShoppingCart size={18} />
          </span>
          <div>
            <p className="text-xs text-[#748178]">Awaiting approval</p>
            <p className="text-xl font-semibold text-[#26342d]">
              {
                data.purchaseOrders.filter((order) => order.status === "draft")
                  .length
              }
            </p>
          </div>
        </Panel>
      </div>
      <Panel>
        <div className="px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-[#28362e]">Purchase orders</h2>
        </div>
        <DataTable
          columns={[
            { key: "id", label: "Order" },
            {
              key: "supplier",
              label: "Supplier",
              render: (order) =>
                data.suppliers.find(
                  (supplier) => supplier.id === order.supplierId,
                )?.name,
            },
            {
              key: "item",
              label: "Item",
              render: (order) =>
                data.inventory.find((item) => item.id === order.itemId)?.name,
            },
            { key: "quantity", label: "Quantity" },
            {
              key: "total",
              label: "Total",
              render: (order) => formatMoney(order.quantity * order.costKobo),
            },
            { key: "date", label: "Created" },
            {
              key: "status",
              label: "Status",
              render: (order) => <Status value={order.status} />,
            },
            {
              key: "action",
              label: "",
              render: (order) =>
                order.status === "draft" && allowed(role, "purchase") ? (
                  <Button
                    variant="secondary"
                    className="min-h-8 px-2.5 text-xs"
                    onClick={() => onPurchaseAction(order, "approved")}
                  >
                    Approve
                  </Button>
                ) : order.status === "approved" ? (
                  <Button
                    variant="secondary"
                    className="min-h-8 px-2.5 text-xs"
                    onClick={() => onPurchaseAction(order, "received")}
                  >
                    Receive
                  </Button>
                ) : (
                  <span className="text-xs text-[#87938b]">—</span>
                ),
            },
          ]}
          rows={data.purchaseOrders}
        />
      </Panel>
      <Panel className="mt-4 p-4 text-sm text-[#68766e]">
        <p>
          Receiving an order creates stock movements and updates inventory
          quantities. Orders above ₦100,000 require CEO approval in production.
        </p>
      </Panel>
    </>
  );
}

function PaymentsPage({ data, role, search, onSearch, onCreate, onIssue, onPrint, onRefund, onVoid }) {
  const invoices = data.invoices.filter((invoice) =>
    `${invoice.id} ${invoice.bookingId} ${guestFor(data, invoice.guestId)?.name} ${invoice.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const payments = data.payments.filter((payment) =>
    `${payment.id} ${payment.bookingId} ${payment.method} ${payment.reference}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Payments & invoices"
        description="Record payments, follow balances, and issue guest invoices."
        action={
          <div className="flex gap-2">{role !== "worker" && <Button variant="secondary" onClick={onRefund}><ArrowRight size={16} />Refund</Button>}<Button onClick={() => onCreate("payment")}><Plus size={16} />Record payment</Button></div>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Paid this month"
          value={formatMoney(
            data.payments
              .filter((payment) => payment.status === "paid")
              .reduce((sum, payment) => sum + payment.amountKobo, 0),
          )}
          note="Cash, transfer, card, and online"
          icon={CreditCard}
        />
        <StatCard
          label="Outstanding balance"
          value={formatMoney(
            data.invoices.reduce(
              (sum, invoice) =>
                sum + Math.max(0, invoice.totalKobo - invoice.paidKobo),
              0,
            ),
          )}
          note="Across issued invoices"
          icon={FileText}
        />
        <StatCard
          label="Overdue invoices"
          value={
            data.invoices.filter((invoice) => invoice.status === "overdue" || (invoice.status === "issued" && invoice.dueDate < TODAY))
              .length
          }
          note="Needs follow-up"
          icon={CircleAlert}
        />
      </div>
      <div className="mb-4 flex justify-end">
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder="Search invoice or booking"
        />
      </div>
      <Panel>
        <div className="flex items-center justify-between px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-semibold text-[#28362e]">Invoices</h2>
            <p className="mt-1 text-xs text-[#78867e]">
              Issued invoices can be printed or settled with a payment.
            </p>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "id", label: "Invoice" },
            { key: "bookingId", label: "Booking" },
            {
              key: "guest",
              label: "Bill to",
              render: (invoice) => guestFor(data, invoice.guestId)?.name,
            },
            {
              key: "total",
              label: "Total",
              render: (invoice) => formatMoney(invoice.totalKobo),
            },
            {
              key: "paid",
              label: "Paid",
              render: (invoice) => formatMoney(invoice.paidKobo),
            },
            {
              key: "balance",
              label: "Balance",
              render: (invoice) =>
                formatMoney(Math.max(0, invoice.totalKobo - invoice.paidKobo)),
            },
            {
              key: "status",
              label: "Status",
              render: (invoice) => <Status value={invoice.status === "issued" && invoice.dueDate < TODAY ? "overdue" : invoice.status} />,
            },
            {
              key: "action",
              label: "",
              render: (invoice) => (
                <div className="flex gap-1">
                  <button
                    aria-label="Print invoice"
                    title="Print invoice"
                    onClick={() => onPrint(invoice)}
                    className="grid size-8 place-items-center rounded-lg hover:bg-[#f0f5f1]"
                  >
                    <Printer size={16} />
                  </button>
                  {invoice.status === "draft" && (
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2 text-xs"
                      onClick={() => onIssue(invoice)}
                    >
                      Issue
                    </Button>
                  )}
                  {role !== "worker" && !["paid", "void"].includes(invoice.status) && <Button variant="danger" className="min-h-8 px-2 text-xs" onClick={() => onVoid(invoice)}>Void</Button>}
                </div>
              ),
            },
          ]}
          rows={invoices}
        />
      </Panel>
      <Panel className="mt-4">
        <div className="px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-[#28362e]">Recent payments</h2>
        </div>
        <DataTable
          columns={[
            { key: "id", label: "Payment" },
            { key: "bookingId", label: "Booking" },
            { key: "method", label: "Method" },
            { key: "reference", label: "Reference" },
            {
              key: "date",
              label: "Received",
              render: (payment) => formatDate(payment.paidAt),
            },
            {
              key: "amount",
              label: "Amount",
              render: (payment) => formatMoney(payment.amountKobo),
            },
            {
              key: "status",
              label: "Status",
              render: (payment) => <Status value={payment.status} />,
            },
          ]}
          rows={payments}
        />
      </Panel>
      <p className="mt-3 text-xs text-[#7b8981]">
        Online payments are not marked paid until a verified, idempotent gateway
        webhook is received by the backend.
      </p>
    </>
  );
}

function FinancialsPage({ data, fnbData, role, onCreate, onExpenseAction }) {
  const transactions = [
    ...data.payments.filter((payment) => payment.databasePayment).map((payment) => ({
      amountKobo: payment.amountKobo,
      method: payment.method.toLowerCase(),
      status: payment.status,
      date: payment.paidAt,
    })),
    ...(fnbData.payments || []).map((payment) => ({
      amountKobo: payment.amountKobo,
      method: payment.method,
      status: payment.status,
      date: payment.createdAt?.slice(0, 10),
    })),
  ].filter((payment) => payment.method !== "room_charge" && ["paid", "part_refunded", "refunded"].includes(payment.status));
  const reportExpenses = data.expenses.filter((expense) => expense.databaseExpense);
  const revenue = transactions.reduce((sum, payment) => sum + payment.amountKobo, 0);
  const expenses = reportExpenses.filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + expense.amountKobo, 0);
  const net = revenue - expenses;
  const rows = reportExpenses;
  const chartDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${TODAY}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const cashFlow = chartDates.map((date) => ({
    date,
    label: new Intl.DateTimeFormat("en-NG", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)),
    revenue: transactions.filter((payment) => payment.date === date).reduce((sum, payment) => sum + payment.amountKobo, 0),
    expenses: reportExpenses.filter((expense) => expense.status === "approved" && expense.date === date)
      .reduce((sum, expense) => sum + expense.amountKobo, 0),
  }));
  const maxDailyAmount = Math.max(1, ...cashFlow.flatMap((day) => [day.revenue, day.expenses]));
  const pendingExpenses = reportExpenses.filter((expense) => expense.status === "pending");
  const todayClose = data.dailyClosings?.find((closing) => closing.date === TODAY);
  return (
    <>
      <PageHeader
        title="Financials"
        description="Revenue is shown on a cash basis using recorded payments. Expenses require approval where applicable."
        action={<div className="flex gap-2"><Button variant="secondary" onClick={() => onCreate("dayClose")} disabled={role === "worker" || Boolean(todayClose)}><ShieldCheck size={16} />{todayClose ? "Day closed" : "Close day"}</Button><Button onClick={() => onCreate("expense")} disabled={!allowed(role, "expense")}><Plus size={16} />Record expense</Button></div>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Payments received"
          value={formatMoney(revenue)}
          note="Persisted receipts and refunds; room charges excluded"
          icon={Wallet}
        />
        <StatCard
          label="Approved expenses"
          value={formatMoney(expenses)}
          note="Persisted approved expenses"
          icon={TrendingUp}
        />
        <StatCard
          label="Net cash position"
          value={formatMoney(net)}
          note="Cash basis · before reconciliation"
          icon={Activity}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#28362e]">Cash flow</h2>
              <p className="mt-1 text-xs text-[#78867e]">
                Received payments and approved expenses
              </p>
            </div>
            <Status value="paid" />
          </div>
          <div className="mt-6 flex h-44 items-end gap-3 border-b border-[#e5ebe7]">
              {cashFlow.map((day) => (
              <div
                key={day.date}
                className="flex h-full flex-1 items-end justify-center gap-1"
              >
                <span
                  className="w-3 rounded-t bg-[#acd2b8]"
                  style={{ height: `${Math.max(3, day.revenue / maxDailyAmount * 100)}%` }}
                />
                <span
                  className="w-3 rounded-t bg-[#eaf58a]"
                  style={{ height: `${Math.max(3, day.expenses / maxDailyAmount * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[11px] text-[#7b8981]">
            {cashFlow.map((day) => <span key={day.date}>{day.label}</span>)}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-[#66746b]">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[#acd2b8]" />
              Revenue
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[#eaf58a]" />
              Expenses
            </span>
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#28362e]">Approvals</h2>
              <p className="mt-1 text-xs text-[#78867e]">
                Manager review required
              </p>
            </div>
            <ShieldCheck className="text-[#176b54]" />
          </div>
          {pendingExpenses.length ? (
            pendingExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="mt-4 rounded-lg border border-[#e8eeea] p-3"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-medium text-[#35443a]">
                      {expense.note}
                    </span>
                    <strong className="text-sm">
                      {formatMoney(expense.amountKobo)}
                    </strong>
                  </div>
                  <p className="mt-1 text-xs text-[#7b8981]">
                    {expense.category} · {formatDate(expense.date)}
                  </p>
                  {role === "ceo" && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-8 px-2.5 text-xs"
                        onClick={() => onExpenseAction(expense, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        className="min-h-8 px-2.5 text-xs"
                        onClick={() => onExpenseAction(expense, "rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))
          ) : (
            <EmptyPanel
              icon={Check}
              title="All caught up"
              detail="There are no expenses awaiting approval."
            />
          )}
        </Panel>
      </div>
      <Panel className="mt-4">
        <div className="px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-[#28362e]">Expense ledger</h2>
        </div>
        <DataTable
          columns={[
            { key: "id", label: "Expense" },
            {
              key: "date",
              label: "Date",
              render: (expense) => formatDate(expense.date),
            },
            { key: "category", label: "Category" },
            { key: "note", label: "Description" },
            {
              key: "amount",
              label: "Amount",
              render: (expense) => formatMoney(expense.amountKobo),
            },
            {
              key: "status",
              label: "Status",
              render: (expense) => <Status value={expense.status} />,
            },
          ]}
          rows={rows}
        />
      </Panel>
      <Panel className="mt-4">
        <div className="px-4 py-4 sm:px-5"><h2 className="font-semibold text-[#28362e]">Daily close history</h2><p className="mt-1 text-xs text-[#78867e]">A closed day cannot be reopened from this screen.</p></div>
        {data.dailyClosings?.length ? <DataTable columns={[{ key: "date", label: "Date", render: (closing) => formatDate(closing.date) }, { key: "cash", label: "Cash counted", render: (closing) => formatMoney(closing.counted.cash) }, { key: "transfer", label: "Transfer", render: (closing) => formatMoney(closing.counted.transfer) }, { key: "card", label: "Card", render: (closing) => formatMoney(closing.counted.card) }, { key: "difference", label: "Difference", render: (closing) => <span className={closing.differenceKobo ? "text-amber-700" : "text-emerald-700"}>{formatMoney(closing.differenceKobo)}</span> }, { key: "closedBy", label: "Closed by" }, { key: "note", label: "Note" }]} rows={data.dailyClosings} /> : <EmptyPanel icon={ShieldCheck} title="No daily closes yet" detail="Reconcile cash, transfer, and card receipts at the end of the day." />}
      </Panel>
    </>
  );
}

function MessagesPage({ data, onSend, onRead }) {
  const [activeId, setActiveId] = useState(data.conversations[0]?.id);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const active = data.conversations.find(
    (conversation) => conversation.id === activeId,
  );
  const activeGuest = active && guestFor(data, active.guestId);
  const conversations = data.conversations.filter((conversation) => {
    const guest = guestFor(data, conversation.guestId);
    return `${guest?.name} ${conversation.bookingId} ${conversation.messages.at(-1)?.text}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  useEffect(() => {
    if (active?.unread) onRead(active.id);
  }, [active?.id, active?.unread, onRead]);
  function send(event) {
    event.preventDefault();
    if (draft.trim() && active) {
      onSend(active.id, draft.trim());
      setDraft("");
    }
  }
  return (
    <>
      <PageHeader
        title="Messages"
        description="Guest conversations linked to their current booking."
      />
      <Panel className="grid min-h-[620px] overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-b border-[#e7ede9] p-3 lg:border-b-0 lg:border-r">
          <SearchBox
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
          />
          {conversations.map((conversation) => {
            const guest = guestFor(data, conversation.guestId);
            const last = conversation.messages.at(-1);
            return (
              <button
                key={conversation.id}
                onClick={() => { setActiveId(conversation.id); onRead(conversation.id); }}
                className={`mt-2 flex w-full items-start gap-3 rounded-lg p-3 text-left ${activeId === conversation.id ? "bg-[#edf5ef]" : "hover:bg-[#f7f9f7]"}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e4f0e7] text-xs font-semibold text-[#27694f]">
                  {initials(guest?.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2 text-sm font-medium text-[#35443b]">
                    <span className="truncate">{guest?.name}</span>
                    <span className="text-[10px] text-[#88958d]">10:42</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-[#7c8981]">
                    {last?.text}
                  </span>
                </span>
                {conversation.unread > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-[#176b54] text-[10px] text-white">
                    {conversation.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {active ? (
          <div className="flex min-h-[520px] flex-col">
            <div className="flex items-center gap-3 border-b border-[#e7ede9] px-4 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-[#e4f0e7] text-xs font-semibold text-[#27694f]">
                {initials(activeGuest?.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#35443b]">
                  {activeGuest?.name}
                </p>
                <p className="text-xs text-[#7c8981]">
                  Booking {active.bookingId}
                </p>
              </div>
              <Status value="confirmed" />
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfcfb] p-4">
              {active.messages.map((message, index) => (
                <div
                  key={`${active.id}-${index}`}
                  className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm ${message.from === "staff" ? "ml-auto bg-[#eaf58a] text-[#303b11]" : "bg-white text-[#425148] shadow-sm ring-1 ring-[#e8eeea]"}`}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <form
              onSubmit={send}
              className="flex gap-2 border-t border-[#e7ede9] p-3"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message…"
                className="min-w-0 flex-1 rounded-lg border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#70a38d]"
              />
              <Button type="submit" disabled={!draft.trim()}>
                <Send size={16} />
                Send
              </Button>
            </form>
            <p className="px-4 pb-3 text-[11px] text-[#839087]">
              Messages are saved to the property database. Guest delivery and email/SMS are not connected.
            </p>
          </div>
        ) : (
          <EmptyPanel
            icon={Mail}
            title="No conversations"
            detail="Guest messages will appear here."
          />
        )}
      </Panel>
    </>
  );
}

function ReviewsPage({ data, onReply }) {
  const average = data.reviews.length
    ? (
        data.reviews.reduce((sum, review) => sum + review.rating, 0) /
        data.reviews.length
      ).toFixed(1)
    : "—";
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Guest feedback, response tracking, and service quality."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Average rating"
          value={`${average} / 5`}
          note={`${data.reviews.length} reviews in this demo`}
          icon={Star}
        />
        <StatCard
          label="Positive reviews"
          value={data.reviews.filter((review) => review.rating >= 4).length}
          note="Ratings of 4 or 5"
          icon={CircleCheck}
        />
        <StatCard
          label="Need a reply"
          value={data.reviews.filter((review) => !review.reply).length}
          note="Guest response outstanding"
          icon={MessageSquare}
        />
      </div>
      <Panel className="mt-4">
        <div className="px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-[#28362e]">Recent guest reviews</h2>
        </div>
        <div className="divide-y divide-[#edf1ee]">
          {data.reviews.map((review) => {
            const guest = guestFor(data, review.guestId);
            return (
              <article key={review.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-[#e4f0e7] text-xs font-semibold text-[#27694f]">
                    {initials(guest?.name)}
                  </span>
                  <span className="font-medium text-[#344239]">
                    {guest?.name || "Guest"}
                  </span>
                  <span className="text-amber-500">
                    {"★".repeat(review.rating)}
                    <span className="text-[#d7ddd9]">
                      {"★".repeat(5 - review.rating)}
                    </span>
                  </span>
                  <span className="ml-auto text-xs text-[#86928b]">
                    {review.id}
                  </span>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#56645b]">
                  {review.comment}
                </p>
                {review.reply ? (
                  <div className="mt-3 rounded-lg bg-[#f4f7f4] p-3 text-sm text-[#607067]">
                    <span className="font-medium text-[#344239]">
                      Your reply:{" "}
                    </span>
                    {review.reply}
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="mt-3 min-h-8 px-2.5 text-xs"
                    onClick={() => onReply(review)}
                  >
                    Reply to review
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function ConciergePage({ data, onCreate, onRequestAction }) {
  return (
    <>
      <PageHeader
        title="Concierge"
        description="Coordinate guest requests and charge billable extras to the room folio."
        action={
          <Button onClick={() => onCreate("request")}>
            <Plus size={16} />
            New request
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Open requests"
          value={
            data.requests.filter((request) => request.status === "open").length
          }
          note="Awaiting assignment"
          icon={Sparkles}
        />
        <StatCard
          label="In progress"
          value={
            data.requests.filter((request) => request.status === "pending")
              .length
          }
          note="Assigned to staff"
          icon={Activity}
        />
        <StatCard
          label="Completed"
          value={
            data.requests.filter((request) => request.status === "done").length
          }
          note="Guest requests fulfilled"
          icon={CircleCheck}
        />
      </div>
      <Panel>
        <DataTable
          columns={[
            { key: "id", label: "Request" },
            {
              key: "type",
              label: "Request type",
              render: (request) => (
                <span className="font-medium">{request.type}</span>
              ),
            },
            {
              key: "guest",
              label: "Guest",
              render: (request) => guestFor(data, request.guestId)?.name,
            },
            {
              key: "unit",
              label: "Unit",
              render: (request) => unitFor(data, request.unitId)?.number,
            },
            { key: "assignedTo", label: "Assigned to" },
            {
              key: "cost",
              label: "Charge",
              render: (request) =>
                request.costKobo ? formatMoney(request.costKobo) : "—",
            },
            {
              key: "status",
              label: "Status",
              render: (request) => <Status value={request.status} />,
            },
            {
              key: "action",
              label: "",
              render: (request) =>
                request.status !== "done" && request.status !== "cancelled" ? (
                  <Button
                    variant="secondary"
                    className="min-h-8 px-2.5 text-xs"
                    onClick={() =>
                      onRequestAction(
                        request,
                        request.status === "open" ? "pending" : "done",
                      )
                    }
                  >
                    {request.status === "open" ? "Assign" : "Complete"}
                  </Button>
                ) : (
                  <span className="text-xs text-[#87938b]">Complete</span>
                ),
            },
          ]}
          rows={data.requests}
        />
      </Panel>
    </>
  );
}

function TeamPage({ data, role, onCreate, onSettings, onUserToggle, onSetPassword }) {
  return (
    <>
      <PageHeader
        title="Team & settings"
        description="Manage the staff directory and property-wide operating rules."
        action={
          role === "ceo" ? (
            <Button onClick={() => onCreate("user")}>
              <Plus size={16} />
              Add team member
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <div className="px-4 py-4 sm:px-5">
            <h2 className="font-semibold text-[#28362e]">Team members</h2>
            <p className="mt-1 text-xs text-[#78867e]">
              Staff records and account status are saved in the property database.
            </p>
          </div>
          <DataTable
            columns={[
              {
                key: "name",
                label: "Name",
                render: (user) => (
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-full bg-[#e8f3ec] text-[10px] font-semibold text-[#24694e]">
                      {initials(user.name)}
                    </span>
                    <span className="font-medium">{user.name}</span>
                  </div>
                ),
              },
              {
                key: "role",
                label: "Role",
                render: (user) => <Status value={user.role} />,
              },
              {
                key: "active",
                label: "Account",
                render: (user) => <div className="flex items-center gap-2"><Status value={user.active ? "available" : "cancelled"} />{["ceo", "manager"].includes(role) && <button onClick={() => onSetPassword(user)} className="text-xs font-medium text-[#176b54] hover:underline">Set password</button>}{role === "ceo" && <button onClick={() => onUserToggle(user)} className="text-xs font-medium text-[#176b54] hover:underline">{user.active ? "Deactivate" : "Activate"}</button>}</div>,
              },
            ]}
            rows={data.users}
          />
        </Panel>
        <Panel className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-[#edf6f0] text-[#176b54]">
              <SlidersHorizontal size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-[#28362e]">Property rules</h2>
              <p className="text-xs text-[#78867e]">
                Rates and local operating defaults
              </p>
            </div>
          </div>
          {role === "ceo" ? <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget).entries(),
              );
              onSettings(values);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <InputField
                field={{
                  name: "checkInTime",
                  label: "Check-in time",
                  type: "time",
                }}
                value={data.settings.checkInTime}
              />
              <InputField
                field={{
                  name: "checkOutTime",
                  label: "Check-out time",
                  type: "time",
                }}
                value={data.settings.checkOutTime}
              />
              <InputField
                field={{
                  name: "servicePercent",
                  label: "Service charge (%)",
                  type: "number",
                  min: 0,
                }}
                value={data.settings.servicePercent}
              />
              <InputField
                field={{
                  name: "vatPercent",
                  label: "VAT (%)",
                  type: "number",
                  min: 0,
                }}
                value={data.settings.vatPercent}
              />
            </div>
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              The VAT treatment and cancellation policy need hotel/accountant
              confirmation. Changes apply to future reservations and charges.
            </p>
            <Button type="submit">
              <Check size={16} />
              Save rules
            </Button>
          </form> : <p className="mt-5 rounded-lg bg-[#f4f7f4] p-3 text-sm text-[#718078]">Only the CEO can update property-wide settings.</p>}
        </Panel>
      </div>
      <Panel className="mt-4 p-4 text-sm text-[#68766e]">
        <div className="flex gap-3">
          <ShieldCheck size={18} className="shrink-0 text-[#176b54]" />
          <p>
            The role selector is still a preview control, not a secure sign-in.
            Production authentication and server-enforced identity are still required.
          </p>
        </div>
      </Panel>
    </>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    const result = await onLogin(email, password);
    setError(result?.error || "");
    setSubmitting(false);
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#f1f5f1] px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid size-10 grid-cols-2 gap-1 rounded-lg bg-white p-2 shadow-sm">
            <i className="rounded-sm bg-[#dff47d]" />
            <i className="rounded-sm bg-[#cfeee0]" />
            <i className="rounded-sm bg-[#cfeee0]" />
            <i className="rounded-sm bg-[#dff47d]" />
          </span>
          <div>
            <strong className="block text-base text-[#1d2b24]">
              Boms Apartment
            </strong>
            <small className="text-xs text-[#839087]">
              Property operations
            </small>
          </div>
        </div>
        <Panel className="p-6 sm:p-8">
          <span className="mb-4 grid size-10 place-items-center rounded-lg bg-[#edf6f0] text-[#176b54]">
            <UserRound size={20} />
          </span>
          <h1 className="text-xl font-semibold text-[#1c2922]">Sign in</h1>
          <p className="mt-1 text-sm text-[#718078]">
            Continue to the operations dashboard.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <InputField field={{ name: "email", label: "Email", type: "email" }} value={email} onChange={(event) => setEmail(event.target.value)} />
            <label className="block">
              <span className="text-sm font-medium text-[#46544c]">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-[#dfe7e1] px-3 py-2.5 text-sm outline-none focus:border-[#5c9d85] focus:ring-2 focus:ring-[#176b54]/10"
                placeholder="Your password"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
            </Button>
          </form>
          <p className="mt-5 rounded-lg bg-[#f4f7f4] p-3 text-xs leading-5 text-[#718078]">
            Sign in with your individual staff account. Contact the CEO/Admin if you need an account or password reset.
          </p>
        </Panel>
        <p className="mt-4 text-center text-xs text-[#839087]">
          Africa/Lagos · NGN
        </p>
      </div>
    </main>
  );
}

function AuditPage({ data }) {
  const rows = data.auditLogs || [];
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Local demo history of key record changes. Production logs must be append-only and written by the server."
      />
      <Panel>
        <DataTable
          columns={[
            {
              key: "at",
              label: "When",
              render: (entry) =>
                new Intl.DateTimeFormat("en-NG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Lagos",
                }).format(new Date(entry.at)),
            },
            { key: "user", label: "Role" },
            { key: "entity", label: "Record type" },
            { key: "entityId", label: "Record ID" },
            { key: "action", label: "Action" },
            {
              key: "newValue",
              label: "Change",
              render: (entry) => (
                <span className="max-w-64 truncate text-xs text-[#718078]">
                  {JSON.stringify(entry.newValue)}
                </span>
              ),
            },
          ]}
          rows={rows}
          empty="Actions that write an audit record will appear here."
        />
      </Panel>
    </>
  );
}

function App() {
  const [data, setData] = useState(readDemoData);
  const initialData = useRef(data);
  const [page, setPage] = useState("dashboard");
  const [role, setRole] = useState("worker");
  const [currentUserId, setCurrentUserId] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [databaseRooms, setDatabaseRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [lagosClock, setLagosClock] = useState(getLagosDateTime);
  const [fnbData, setFnbData] = useState({ categories: [], menuItems: [], orders: [], batches: [], minibarMovements: [] });
  const [fnbLoading, setFnbLoading] = useState(true);
  const [systemNotifications, setSystemNotifications] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (!cancelled && result?.user) {
          setCurrentUserId(result.user.id);
          setRole(result.user.role);
          setSignedIn(true);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setLagosClock(getLagosDateTime()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;
    const refreshStockAlerts = async () => {
      const operationsResponse = await fetch("/api/operations");
      if (!operationsResponse.ok) return;
      const notificationsResponse = await fetch("/api/notifications");
      if (notificationsResponse.ok) setSystemNotifications(await notificationsResponse.json());
    };
    const timer = window.setInterval(() => { void refreshStockAlerts(); }, 30000);
    return () => window.clearInterval(timer);
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const routePage = resolvePageFromRoute(`${window.location.pathname}${window.location.hash}`);
    if (routePage && pageNames[routePage] && routePage !== page) {
      setPage(routePage);
    }
    const currentRoute = buildRouteForPage(page);
    if (window.location.pathname !== currentRoute) {
      window.history.replaceState({}, "", currentRoute);
    }
  }, [signedIn, page]);

  useEffect(() => {
    if (!signedIn) return;
    const handlePopState = () => {
      const routePage = resolvePageFromRoute(`${window.location.pathname}${window.location.hash}`);
      if (routePage && pageNames[routePage]) {
        setPage(routePage);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [signedIn]);

  useEffect(() => {
    let cancelled = false;
    if (!signedIn) return () => { cancelled = true; };
    async function loadDatabaseData() {
      try {
        const bootstrapResponse = await fetch("/api/operations/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guests: initialData.current.guests,
            inventory: initialData.current.inventory,
            expenses: initialData.current.expenses,
            suppliers: initialData.current.suppliers,
            purchaseOrders: initialData.current.purchaseOrders,
            conversations: initialData.current.conversations,
            reviews: initialData.current.reviews,
            requests: initialData.current.requests.map((request) => ({
              ...request,
              unitNumber: initialData.current.units.find((unit) => unit.id === request.unitId)?.number || "",
            })),
            users: initialData.current.users,
            settings: { ...initialData.current.settings, servicePercent: 0, vatPercent: 0 },
            dailyClosings: initialData.current.dailyClosings,
          }),
        });
        if (!bootstrapResponse.ok) throw new Error("Demo operations data could not be moved into the database.");
        const [roomsResponse, reservationsResponse, blocksResponse, operationsResponse, guestsResponse, fnbResponse, workspaceResponse, notificationsResponse] = await Promise.all([
          fetch("/api/rooms"),
          fetch("/api/reservations"),
          fetch("/api/blocks"),
          fetch("/api/operations"),
          fetch("/api/guests"),
          fetch("/api/fnb"),
          fetch("/api/workspace"),
          fetch("/api/notifications"),
        ]);
        if (!roomsResponse.ok || !reservationsResponse.ok || !blocksResponse.ok || !operationsResponse.ok || !guestsResponse.ok || !fnbResponse.ok || !workspaceResponse.ok || !notificationsResponse.ok) {
          throw new Error("The room database could not be loaded.");
        }
        const rooms = await roomsResponse.json();
        const reservations = await reservationsResponse.json();
        const blocks = await blocksResponse.json();
        const operations = await operationsResponse.json();
        const databaseGuests = (await guestsResponse.json()).map((guest) => ({ ...guest, databaseGuest: true }));
        const fnb = await fnbResponse.json();
        const workspace = await workspaceResponse.json();
        const notifications = await notificationsResponse.json();
        const allDatabaseGuests = [
          ...databaseGuests,
          ...reservations.filter((booking) => booking.guest).map((booking) => ({ ...booking.guest, databaseGuest: true })),
        ];
        if (cancelled) return;
        const units = rooms.map((room) => ({
          id: room.id,
          number: room.number,
          roomTypeId: room.roomTypeId,
          floor: room.floor || "—",
          status: room.status,
          rateKobo: room.rateKobo || 0,
          maxGuests: room.maxGuests,
          databaseRoom: true,
        }));
        const roomTypes = rooms.map((room) => ({
          id: room.roomTypeId,
          name: room.roomTypeName,
          size: room.sizeM2 || 0,
          bed: room.bedType || "Same size, not specified",
          guests: room.maxGuests,
          rateKobo: room.rateKobo || 0,
          description: room.description || "",
          databaseRoomType: true,
        }));
        setDatabaseRooms(rooms.map((room) => ({ ...room, databaseRoom: true })));
        setFnbData(fnb);
        setSystemNotifications(notifications);
        setRoomsError("");
        setData((current) => {
          const bookingsById = new Map(current.bookings.map((booking) => [booking.id, booking]));
          for (const booking of reservations) {
            bookingsById.set(booking.id, { ...booking, databaseBooking: true });
          }
          const databaseBookingIds = new Set(reservations.map((booking) => booking.id));
          return {
            ...current,
            guests: mergeById(current.guests, allDatabaseGuests),
            bookings: [...bookingsById.values()],
            blocks: [...current.blocks.filter((block) => !block.databaseBlock), ...blocks],
            payments: mergeById(current.payments, operations.payments),
            invoices: mergeById(current.invoices.filter((invoice) => !databaseBookingIds.has(invoice.bookingId)), operations.invoices),
            inventory: mergeById(current.inventory, operations.inventory),
            stockMovements: mergeById(current.stockMovements, operations.stockMovements),
            expenses: mergeById(current.expenses, operations.expenses),
            tasks: mergeById(current.tasks, operations.tasks),
            suppliers: mergeById(current.suppliers, operations.suppliers),
            purchaseOrders: mergeById(current.purchaseOrders, operations.purchaseOrders),
            conversations: workspace.conversations,
            reviews: workspace.reviews,
            requests: workspace.requests,
            users: workspace.users,
            settings: { ...current.settings, ...workspace.settings },
            dailyClosings: workspace.dailyClosings,
            auditLogs: mergeById(current.auditLogs, workspace.auditLogs),
            units: [...current.units.filter((unit) => !unit.databaseRoom), ...units],
            roomTypes: [
              ...current.roomTypes.filter((type) => !type.databaseRoomType),
              ...roomTypes,
            ],
          };
        });
      } catch (error) {
        if (!cancelled) setRoomsError(error.message || "The room database is unavailable.");
      } finally {
        if (!cancelled) setFnbLoading(false);
        if (!cancelled) setRoomsLoading(false);
      }
    }
    void loadDatabaseData();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);
  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function notify(message) {
    setToast(message);
  }
  async function writeApi(path, method, body) {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The database request failed.");
    return result;
  }
  async function persistInventoryMovement(item, type, quantity, reason, note = "", costKobo = 0, expiryDate = "", batchCode = "") {
    const result = await writeApi(`/api/inventory/${encodeURIComponent(item.id)}/movements`, "POST", {
      type,
      quantity,
      reason,
      note,
      costKobo,
      expiryDate,
      batchCode,
    });
    updateList("inventory", (items) => items.map((entry) => entry.id === item.id ? result.item : entry));
    updateList("stockMovements", (items) => [result.movement, ...items.filter((movement) => movement.id !== result.movement.id)]);
    if (result.batch) setFnbData((current) => ({ ...current, batches: [result.batch, ...current.batches] }));
    return result;
  }
  async function refreshPersistentOperations() {
    const [response, fnbResponse, reservationsResponse, workspaceResponse] = await Promise.all([
      fetch("/api/operations"),
      fetch("/api/fnb"),
      fetch("/api/reservations"),
      fetch("/api/workspace"),
    ]);
    if (!response.ok || !fnbResponse.ok || !reservationsResponse.ok || !workspaceResponse.ok) throw new Error("Saved operations data could not be refreshed.");
    const operations = await response.json();
    const fnb = await fnbResponse.json();
    const reservations = await reservationsResponse.json();
    const workspace = await workspaceResponse.json();
    const notificationsResponse = await fetch("/api/notifications");
    if (notificationsResponse.ok) setSystemNotifications(await notificationsResponse.json());
    setFnbData(fnb);
    setData((current) => ({
      ...current,
      bookings: mergeById(current.bookings, reservations.map((booking) => ({ ...booking, databaseBooking: true }))),
      guests: mergeById(current.guests, reservations.filter((booking) => booking.guest).map((booking) => ({ ...booking.guest, databaseGuest: true }))),
      payments: mergeById(current.payments, operations.payments),
      invoices: mergeById(current.invoices.filter((invoice) => !current.bookings.some((booking) => booking.databaseBooking && booking.id === invoice.bookingId)), operations.invoices),
      inventory: mergeById(current.inventory, operations.inventory),
      stockMovements: mergeById(current.stockMovements, operations.stockMovements),
      expenses: mergeById(current.expenses, operations.expenses),
      tasks: mergeById(current.tasks, operations.tasks),
      suppliers: mergeById(current.suppliers, operations.suppliers),
      purchaseOrders: mergeById(current.purchaseOrders, operations.purchaseOrders),
      conversations: workspace.conversations,
      reviews: workspace.reviews,
      requests: workspace.requests,
      users: workspace.users,
      settings: { ...current.settings, ...workspace.settings },
      dailyClosings: workspace.dailyClosings,
      auditLogs: mergeById(current.auditLogs, workspace.auditLogs),
    }));
  }
  async function saveMenuItem(payload) {
    if (!allowed(role, "stock")) return { error: "Only managers and admins can create menu items." };
    try {
      const item = await writeApi("/api/fnb/menu-items", "POST", payload);
      setFnbData((current) => ({
        ...current,
        menuItems: [...current.menuItems, item],
        categories: current.categories.some((category) => category.name.toLowerCase() === item.category.toLowerCase())
          ? current.categories
          : [...current.categories, { id: item.categoryId, name: item.category, station: item.station }],
      }));
      return {};
    } catch (error) {
      return { error: error.message };
    }
  }
  async function createFnbOrder(payload) {
    try {
      const order = await writeApi("/api/fnb/orders", "POST", payload);
      setFnbData((current) => ({ ...current, orders: [order, ...current.orders] }));
      notify(`${order.orderNumber} sent to the ${order.items.map((item) => item.station).filter((value, index, values) => values.indexOf(value) === index).join(" and ")}.`);
      return {};
    } catch (error) {
      return { error: error.message };
    }
  }
  async function updateFnbOrder(order, status) {
    try {
      await writeApi(`/api/fnb/orders/${encodeURIComponent(order.id)}/status`, "PATCH", {
        status,
        reason: status === "cancelled" ? `Cancelled by ${data.users.find((user) => user.id === currentUserId)?.name || "manager"}` : "",
      });
      await refreshPersistentOperations();
      notify(`${order.orderNumber} ${status === "billed" ? "billed" : `moved to ${status}`}.`);
    } catch (error) {
      notify(error.message);
    }
  }
  async function updateMenuAvailability(item, available) {
    try {
      await writeApi(`/api/fnb/menu-items/${encodeURIComponent(item.id)}/availability`, "PATCH", { available });
      setFnbData((current) => ({ ...current, menuItems: current.menuItems.map((menuItem) => menuItem.id === item.id ? { ...menuItem, available } : menuItem) }));
    } catch (error) {
      notify(error.message);
    }
  }
  async function refundFnbOrder(order, values) {
    try {
      await writeApi(`/api/fnb/orders/${encodeURIComponent(order.id)}/refunds`, "POST", values);
      await refreshPersistentOperations();
      notify(`${order.orderNumber} refund recorded.`);
      return {};
    } catch (error) {
      return { error: error.message };
    }
  }
  async function saveRoom(room, values) {
    if (role !== "ceo") return { error: "Only an admin can edit room details." };
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(room.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) return { error: result.error || "Room details could not be saved." };
      setDatabaseRooms((current) => current.map((item) => item.id === result.id ? { ...result, databaseRoom: true } : item));
      setData((current) => ({
        ...current,
        units: current.units.map((unit) => unit.roomTypeId === result.roomTypeId
          ? { ...unit, rateKobo: result.rateKobo || 0 }
          : unit),
        roomTypes: current.roomTypes.map((type) => type.databaseRoomType
          ? {
              ...type,
              bed: result.bedType || type.bed,
              rateKobo: type.id === result.roomTypeId ? result.rateKobo || 0 : type.rateKobo,
            }
          : type),
      }));
      writeAudit("room", room.id, "room details updated", room, result);
      notify(`${room.name} saved to the room database.`);
      return {};
    } catch {
      return { error: "The room database is unavailable." };
    }
  }
  async function updateDatabaseRoomStatus(room, status) {
    if (!allowed(role, "inspect")) {
      notify("Only a manager or admin can change room status.");
      return;
    }
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(room.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify(result.error || "Room status could not be changed.");
        return;
      }
      setDatabaseRooms((current) => current.map((item) => item.id === room.id ? { ...item, ...result, databaseRoom: true } : item));
      updateList("units", (items) => items.map((unit) => unit.id === room.id ? { ...unit, status } : unit));
      writeAudit("unit", room.id, "status changed", room, result);
      notify(`${room.name} status updated.`);
    } catch {
      notify("The room database is unavailable.");
    }
  }
  async function persistDatabaseBookingStatus(booking, status, reason = "", refundKobo = 0) {
    if (!booking.databaseBooking) return true;
    try {
      const response = await fetch(`/api/reservations/${encodeURIComponent(booking.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason, refundKobo }),
      });
      const result = await response.json();
      if (!response.ok) {
        notify(result.error || "Reservation status could not be saved.");
        return false;
      }
      const roomStatus = status === "checked_in" ? "occupied" : status === "checked_out" ? "dirty" : null;
      if (roomStatus) {
        setDatabaseRooms((current) => current.map((room) => room.id === booking.unitId ? { ...room, status: roomStatus } : room));
      }
      if (result.housekeepingTask) {
        const savedTask = result.housekeepingTask;
        updateList("tasks", (items) => [{
          id: savedTask.id,
          unitId: savedTask.unit_id,
          bookingId: savedTask.booking_id,
          type: savedTask.type,
          status: savedTask.status,
          priority: savedTask.priority[0].toUpperCase() + savedTask.priority.slice(1),
          assignedTo: savedTask.assigned_to_label || "Unassigned",
          updatedAt: savedTask.updated_at,
          databaseTask: true,
        }, ...items.filter((item) => item.id !== savedTask.id)]);
      }
      if (result.refunds?.length) {
        updateList("payments", (items) => mergeById(items, result.refunds));
      }
      return true;
    } catch {
      notify("The reservation database is unavailable.");
      return false;
    }
  }
  function updateList(key, updater) {
    setData((current) => ({ ...current, [key]: updater(current[key] || []) }));
  }
  function writeAudit(entity, entityId, action, oldValue, newValue) {
    updateList("auditLogs", (items) => [
      {
        id: makeCode("AUD-", items),
        entity,
        entityId,
        action,
        oldValue,
        newValue,
        user: role,
        at: new Date().toISOString(),
      },
      ...items,
    ]);
  }
  function navigate(nextPage) {
    setPage(nextPage);
    setSearch("");
    setMobileNavOpen(false);
    if (signedIn) {
      const url = buildRouteForPage(nextPage);
      const current = `${window.location.pathname}${window.location.hash}`;
      if (current !== url) {
        window.history.pushState({}, "", url);
      }
    }
  }
  async function extendBookingStay(booking) {
    try {
      const result = await writeApi(`/api/reservations/${encodeURIComponent(booking.id)}/extend`, "PATCH", {});
      setData((current) => ({
        ...current,
        bookings: current.bookings.map((item) => item.id === booking.id ? { ...item, ...result, databaseBooking: true } : item),
        invoices: current.invoices.map((invoice) => invoice.bookingId === booking.id
          ? { ...invoice, totalKobo: result.totalKobo, status: invoice.paidKobo >= result.totalKobo ? "paid" : "issued" }
          : invoice),
      }));
      writeAudit("booking", booking.id, "extended one night", booking, result);
      notify(`${booking.id} extended to ${formatDate(result.checkOut)}.`);
    } catch (error) {
      notify(error.message);
    }
  }
  async function markNotificationRead(notification) {
    try {
      await writeApi(`/api/notifications/${encodeURIComponent(notification.id)}/read`, "PATCH", {});
      setSystemNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    } catch (error) {
      notify(error.message);
    }
  }
  async function signIn(email, password) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { error: result.error || "Sign in failed." };
      setCurrentUserId(result.user.id);
      setRole(result.user.role);
      setSignedIn(true);
      setPage("dashboard");
      window.history.replaceState({}, "", appRoutes.dashboard);
      return {};
    } catch {
      return { error: "The sign-in service is unavailable." };
    }
  }
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSignedIn(false);
    setCurrentUserId("");
    setRole("worker");
    setPage("dashboard");
    window.history.replaceState({}, "", "/login");
  }
  function requestCreate(type, record = null) {
    const requiredPermission = {
      booking: "booking", guest: "booking", unit: "inspect", roomType: "inspect", rateRule: "inspect",
      task: "inspect", request: "concierge", item: "inspect", purchase: "purchase",
      stock: "stock", stockOut: "stock_use", stockAdjust: "stock", expense: "expense",
      user: "all", setPassword: "all", refund: "refund", voidInvoice: "cancel",
    }[type];
    if (requiredPermission && !allowed(role, requiredPermission)) {
      notify("Your current role cannot perform that action.");
      return;
    }
    setModal({ type, record });
  }

  async function saveBooking(payload) {
    const unit = data.units.find((item) => item.id === payload.unitId);
    if (
      !unit ||
      !isUnitAvailable(
        unit,
        payload.checkIn,
        payload.checkOut,
        data.bookings,
        data.blocks || [],
      )
    ) {
      notify("That unit was just reserved. Check availability again.");
      return;
    }
    const existing = data.bookings.find((item) => item.id === payload.recordId);
    if (existing && (!allowed(role, "edit_booking") || !["confirmed", "hold"].includes(existing.status))) {
      notify("Only managers can edit confirmed or held reservations.");
      return;
    }
    let bookingId = existing?.id || makeCode("BA-B", data.bookings);
    if (unit.databaseRoom) {
      try {
        const response = await fetch(
          existing?.databaseBooking
            ? `/api/reservations/${encodeURIComponent(existing.id)}`
            : "/api/reservations",
          {
            method: existing?.databaseBooking ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              guestId: payload.guestId,
              guest: guestFor(data, payload.guestId),
              unitId: payload.unitId,
              checkIn: payload.checkIn,
              checkOut: payload.checkOut,
              adults: payload.adults,
              children: payload.children,
              source: payload.source,
              requests: payload.requests,
              status: payload.status,
              discountKobo: payload.quote.discountKobo,
              servicePercent: data.settings.servicePercent,
              vatPercent: data.settings.vatPercent,
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          notify(result.error || "The reservation could not be saved.");
          return;
        }
        bookingId = result.id;
      } catch {
        notify("The reservation database is unavailable.");
        return;
      }
    }
    const booking = {
      ...existing,
      id: bookingId,
      databaseBooking: Boolean(unit.databaseRoom) || existing?.databaseBooking,
      guestId: payload.guestId,
      unitId: payload.unitId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      adults: payload.adults,
      children: payload.children,
      status: payload.status,
      source: payload.source,
      requests: payload.requests,
      totalKobo: payload.quote.totalKobo,
      paidKobo: 0,
      discountKobo: payload.quote.discountKobo,
      subtotalKobo: payload.quote.subtotalKobo,
      serviceKobo: payload.quote.serviceKobo,
      vatKobo: payload.quote.vatKobo,
    };
    if (existing) {
      const updatedBooking = { ...booking, paidKobo: existing.paidKobo };
      updateList("bookings", (items) => items.map((item) => item.id === bookingId ? updatedBooking : item));
      updateList("invoices", (items) => items.map((invoice) => invoice.bookingId === bookingId ? { ...invoice, totalKobo: updatedBooking.totalKobo } : invoice));
      writeAudit("booking", bookingId, "updated", existing, updatedBooking);
      setModal(null);
      notify(`${bookingId} updated and repriced.`);
      return;
    }
    const invoiceId = makeCode("BA-INV-", data.invoices);
    const invoice = {
      id: invoiceId,
      bookingId,
      guestId: payload.guestId,
      totalKobo: booking.totalKobo,
      paidKobo: 0,
      status: "draft",
      dueDate: payload.checkIn,
    };
    setData((current) => ({
      ...current,
      bookings: [booking, ...current.bookings],
      invoices: [invoice, ...current.invoices],
    }));
    writeAudit("booking", bookingId, "created", null, booking);
    setModal(null);
    notify(`${bookingId} created and availability checked.`);
  }

  async function saveRecord(type, values, record) {
    const amountKobo = Math.round(Number(values.amountNaira || 0) * 100);
    const costKobo = Math.round(Number(values.costNaira || 0) * 100);
    const today = TODAY;
    if (type === "guest") {
      if (
        data.guests.some(
          (guest) =>
            guest.phone === values.phone ||
            (values.idNumber && guest.idNumber === values.idNumber),
        )
      ) {
        notify(
          "A guest with this phone or ID already exists. Check the guest list.",
        );
        return;
      }
      const guestPayload = {
        id: makeCode("G-", data.guests),
        name: values.name,
        phone: values.phone,
        email: values.email,
        nationality: values.nationality || "—",
        idNumber: values.idNumber || "",
        tier: "Silver",
        points: 0,
      };
      let guest;
      try {
        guest = { ...(await writeApi("/api/guests", "POST", guestPayload)), databaseGuest: true };
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("guests", (items) => [guest, ...items]);
    } else if (type === "roomType") {
      if (
        data.roomTypes.some(
          (item) =>
            item.name.toLowerCase() === values.name.trim().toLowerCase(),
        )
      ) {
        notify("A room type with this name already exists.");
        return;
      }
      const roomType = {
        id: values.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-"),
        name: values.name.trim(),
        size: Number(values.size),
        bed: values.bed,
        guests: Number(values.guests),
        rateKobo: costKobo,
        description: values.description || "",
      };
      updateList("roomTypes", (items) => [...items, roomType]);
    } else if (type === "rateRule") {
      if (values.endDate <= values.startDate) {
        notify("The rate rule end date must be after its start date.");
        return;
      }
      const rule = {
        id: makeCode("RATE-", data.rateRules || []),
        roomTypeId: values.roomTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        rateKobo: costKobo,
        minNights: Number(values.minNights || 0) || null,
      };
      updateList("rateRules", (items) => [rule, ...items]);
      writeAudit("rate_rule", rule.id, "created", null, rule);
    } else if (type === "unit") {
      if (data.units.some((unit) => unit.number === values.number)) {
        notify("Unit numbers must be unique.");
        return;
      }
      const unit = {
        id: `u${values.number}`,
        number: values.number,
        roomTypeId: values.roomTypeId,
        floor: values.floor,
        status: "available",
        rateKobo: Math.round(Number(values.rateNaira) * 100),
        maxGuests: Number(values.maxGuests),
      };
      updateList("units", (items) => [unit, ...items]);
    } else if (type === "payment") {
      const booking = data.bookings.find(
        (item) => item.id === values.bookingId,
      );
      if (!booking || amountKobo <= 0 || amountKobo > balanceFor(booking)) {
        notify(
          "Enter an amount above zero and no greater than the outstanding balance.",
        );
        return;
      }
      if (values.method === "Bill to company") {
        notify(
          "Company balances are approved at check-out and are not recorded as cash payments.",
        );
        return;
      }
      let payment = {
        id: makeCode("PAY-", data.payments),
        bookingId: booking.id,
        method: values.method,
        amountKobo,
        status: values.method === "Online" ? "pending" : "paid",
        reference: values.reference || makeCode("REF-", data.payments),
        paidAt: today,
      };
      if (booking.databaseBooking) {
        try {
          payment = await writeApi("/api/payments", "POST", {
            bookingId: booking.id,
            amountKobo,
            method: values.method,
            reference: payment.reference,
          });
        } catch (error) {
          notify(error.message);
          return;
        }
      }
      updateList("payments", (items) => [payment, ...items]);
      if (payment.status === "paid") {
        updateList("bookings", (items) =>
          items.map((item) =>
            item.id === booking.id
              ? { ...item, paidKobo: item.paidKobo + amountKobo }
              : item,
          ),
        );
        updateList("invoices", (items) =>
          items.map((invoice) =>
            invoice.bookingId === booking.id
              ? {
                  ...invoice,
                  paidKobo: Math.min(
                    invoice.totalKobo,
                    invoice.paidKobo + amountKobo,
                  ),
                  status:
                    invoice.paidKobo + amountKobo >= invoice.totalKobo
                      ? "paid"
                      : "issued",
                }
              : invoice,
          ),
        );
      }
      writeAudit("payment", payment.id, "recorded", null, payment);
      if (payment.status === "pending") notify("Online payment is pending gateway confirmation.");
    } else if (type === "refund") {
      if (!allowed(role, "refund")) {
        notify("Refunds require manager or CEO approval.");
        return;
      }
      const payment = data.payments.find(
        (item) => item.id === values.paymentId,
      );
      const alreadyRefunded = data.payments
        .filter((item) => item.originalPaymentId === payment?.id)
        .reduce((sum, item) => sum + Math.abs(item.amountKobo), 0);
      const refundLimit =
        role === "manager" ? 5000000 : Number.MAX_SAFE_INTEGER;
      if (
        !payment ||
        amountKobo <= 0 ||
        amountKobo > payment.amountKobo - alreadyRefunded ||
        amountKobo > refundLimit ||
        !values.reason?.trim()
      ) {
        notify(
          role === "manager" && amountKobo > refundLimit
            ? "Manager refunds are limited to ₦50,000."
            : "Enter a valid amount within the refundable balance and provide a reason.",
        );
        return;
      }
      let refund = {
        id: makeCode("PAY-", data.payments),
        bookingId: payment.bookingId,
        originalPaymentId: payment.id,
        method: "Refund",
        amountKobo: -amountKobo,
        status: "refunded",
        reference: makeCode("REF-", data.payments),
        paidAt: today,
        reason: values.reason,
      };
      if (payment.databasePayment) {
        try {
          refund = await writeApi(`/api/payments/${encodeURIComponent(payment.id)}/refunds`, "POST", {
            amountKobo,
            reason: values.reason,
          });
        } catch (error) {
          notify(error.message);
          return;
        }
      }
      updateList("payments", (items) => [refund, ...items]);
      updateList("bookings", (items) =>
        items.map((item) =>
          item.id === payment.bookingId
            ? { ...item, paidKobo: Math.max(0, item.paidKobo - amountKobo) }
            : item,
        ),
      );
      updateList("invoices", (items) =>
        items.map((invoice) =>
          invoice.bookingId === payment.bookingId
            ? {
                ...invoice,
                paidKobo: Math.max(0, invoice.paidKobo - amountKobo),
                status: "issued",
              }
            : invoice,
        ),
      );
      writeAudit("payment", payment.id, "refunded", payment, refund);
    } else if (type === "item") {
      const itemPayload = {
        id: makeCode("IT-", data.inventory),
        name: values.name,
        category: values.category,
        unit: values.unit,
        quantity: Number(values.quantity),
        minimum: Number(values.minimum),
        costKobo,
        supplierId: "",
      };
      let item;
      try {
        item = await writeApi("/api/inventory/items", "POST", itemPayload);
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("inventory", (items) => [item, ...items]);
    } else if (type === "stock") {
      const item = data.inventory.find((entry) => entry.id === values.itemId);
      const quantity = Number(values.quantity);
      if (!item || quantity <= 0) {
        notify("Enter a valid quantity.");
        return;
      }
      if (item.databaseItem) {
        try {
          await persistInventoryMovement(item, "in", quantity, values.note || "Stock received", "", costKobo, values.expiryDate || "", values.batchCode || "");
        } catch (error) {
          notify(error.message);
          return;
        }
      } else {
      updateList("inventory", (items) =>
        items.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                quantity: entry.quantity + quantity,
                costKobo: costKobo || entry.costKobo,
              }
            : entry,
        ),
      );
      updateList("stockMovements", (items) => [
        {
          id: makeCode("MOV-", items),
          itemId: item.id,
          type: "in",
          quantity,
          reason: values.note || "Stock received",
          date: today,
        },
        ...items,
      ]);
      }
    } else if (type === "stockOut") {
      if (!allowed(role, "stock_use")) { notify("Your role cannot record stock use."); return; }
      const item = data.inventory.find((entry) => entry.id === values.itemId);
      const quantity = Number(values.quantity);
      if (!item || quantity <= 0 || quantity > item.quantity) {
        notify("Quantity must be above zero and cannot exceed current stock.");
        return;
      }
      if (item.databaseItem) {
        try {
          await persistInventoryMovement(item, "out", quantity, values.reason, values.note || "");
        } catch (error) {
          notify(error.message);
          return;
        }
      } else {
      updateList("inventory", (items) =>
        items.map((entry) =>
          entry.id === item.id
            ? { ...entry, quantity: entry.quantity - quantity }
            : entry,
        ),
      );
      updateList("stockMovements", (items) => [
        {
          id: makeCode("MOV-", items),
          itemId: item.id,
          type: "out",
          quantity,
          reason: `${values.reason}${values.note ? ` · ${values.note}` : ""}`,
          date: today,
        },
        ...items,
      ]);
      }
    } else if (type === "stockAdjust") {
      if (!allowed(role, "stock")) {
        notify("Stock adjustments require manager approval.");
        return;
      }
      const item = data.inventory.find((entry) => entry.id === values.itemId);
      const counted = Number(values.quantity);
      if (!item || counted < 0 || !values.note?.trim()) {
        notify("Enter a valid count and adjustment reason.");
        return;
      }
      const difference = counted - item.quantity;
      if (difference) {
        if (item.databaseItem) {
          try {
            const result = await writeApi(`/api/inventory/${encodeURIComponent(item.id)}/count`, "POST", { count: counted, reason: values.note });
            updateList("inventory", (items) => items.map((entry) => entry.id === item.id ? result.item : entry));
            if (result.movement) updateList("stockMovements", (items) => [result.movement, ...items]);
            await refreshPersistentOperations();
          } catch (error) {
            notify(error.message);
            return;
          }
        } else {
        updateList("inventory", (items) =>
          items.map((entry) =>
            entry.id === item.id ? { ...entry, quantity: counted } : entry,
          ),
        );
        updateList("stockMovements", (items) => [
          {
            id: makeCode("MOV-", items),
            itemId: item.id,
            type: "adjust",
            quantity: difference,
            reason: values.note,
            date: today,
          },
          ...items,
        ]);
        }
      }
    } else if (type === "minibar") {
      if (!record?.databaseItem || !values.unitId || Number(values.quantity) <= 0) {
        notify("Choose a room and a valid minibar quantity.");
        return;
      }
      try {
        await writeApi(`/api/inventory/${encodeURIComponent(record.id)}/minibar`, "POST", {
          unitId: values.unitId,
          bookingId: values.bookingId || "",
          quantity: Number(values.quantity),
          unitPriceKobo: Math.round(Number(values.unitPriceNaira || 0) * 100),
          reason: values.reason || "Minibar consumption",
        });
        await refreshPersistentOperations();
        setModal(null);
        notify(`${record.name} minibar use recorded.`);
        return;
      } catch (error) {
        notify(error.message);
        return;
      }
    } else if (type === "purchase") {
      const orderPayload = {
        id: makeCode("PO-", data.purchaseOrders),
        supplierId: values.supplierId,
        itemId: values.itemId,
        quantity: Number(values.quantity),
        costKobo,
        expiryDate: values.expiryDate || "",
        status: "draft",
        date: today,
      };
      let order;
      try {
        order = await writeApi("/api/purchase-orders", "POST", orderPayload);
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("purchaseOrders", (items) => [order, ...items]);
    } else if (type === "expense") {
      const expensePayload = {
        id: makeCode("EXP-", data.expenses),
        category: values.category,
        amountKobo,
        note: values.note,
        status: amountKobo > 10000000 ? "pending" : "approved",
        date: today,
      };
      let expense;
      try {
        expense = await writeApi("/api/expenses", "POST", expensePayload);
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("expenses", (items) => [expense, ...items]);
    } else if (type === "dayClose") {
      if (data.dailyClosings.some((closing) => closing.date === today)) {
        notify("This date has already been closed and cannot be edited.");
        return;
      }
      const counted = { cash: Math.round(Number(values.cashNaira || 0) * 100), transfer: Math.round(Number(values.transferNaira || 0) * 100), card: Math.round(Number(values.cardNaira || 0) * 100) };
      let closing;
      try {
        closing = await writeApi("/api/daily-closings", "POST", { date: today, counted, note: values.note || "" });
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("dailyClosings", (items) => [closing, ...items]);
    } else if (type === "task") {
      const taskPayload = {
        id: makeCode("HK-", data.tasks),
        unitId: values.unitId,
        type: values.type,
        status: "open",
        priority: values.priority,
        assignedTo: values.assignedTo,
        updatedAt: "Now",
      };
      const unit = data.units.find((item) => item.id === taskPayload.unitId);
      let task = taskPayload;
      if (unit?.databaseRoom) {
        try {
          task = await writeApi("/api/housekeeping/tasks", "POST", {
            ...taskPayload,
            bookingId: data.bookings.find((booking) => booking.id === values.bookingId)?.databaseBooking ? values.bookingId : "",
          });
        } catch (error) {
          notify(error.message);
          return;
        }
      }
      updateList("tasks", (items) => [task, ...items]);
      if (values.type === "Checkout clean")
        updateList("units", (items) =>
          items.map((unit) =>
            unit.id === task.unitId ? { ...unit, status: "dirty" } : unit,
          ),
        );
    } else if (type === "request") {
      const unit = unitFor(data, values.unitId);
      let request;
      try {
        request = await writeApi("/api/concierge", "POST", {
          guestId: values.guestId,
          unitId: unit?.databaseRoom ? unit.id : unit?.number,
          type: values.type,
          details: values.details,
          assignedTo: values.assignedTo,
          costKobo,
        });
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("requests", (items) => [request, ...items]);
    } else if (type === "user") {
      let user;
      try {
        user = await writeApi("/api/users", "POST", values);
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("users", (items) => [user, ...items]);
    } else if (type === "setPassword") {
      try {
        await writeApi(`/api/users/${encodeURIComponent(record.id)}/password`, "PUT", { password: values.password });
      } catch (error) {
        notify(error.message);
        return;
      }
      notify(`Password updated for ${record.name}.`);
    } else if (type === "checkout") {
      const booking = record;
      const amount = amountKobo;
      const balance = balanceFor(booking);
      if (amount < 0 || amount > balance) {
        notify("Payment collected must be between zero and the outstanding balance.");
        return;
      }
      if (
        values.method === "Bill to company" &&
        !allowed(role, "checkout_credit")
      ) {
        notify("Only a manager or CEO can approve a company balance.");
        return;
      }
      if (
        amount < balance &&
        (values.method !== "Bill to company" || !values.reason?.trim())
      ) {
        notify(
          "Collect the balance, or enter a reason for an approved company balance.",
        );
        return;
      }
      if (amount > 0) {
        let payment = {
          id: makeCode("PAY-", data.payments),
          bookingId: booking.id,
          method: values.method,
          amountKobo: amount,
          status: "paid",
          reference: makeCode("REF-", data.payments),
          paidAt: today,
        };
        if (booking.databaseBooking) {
          if (values.method === "Bill to company") {
            notify("Company balances are not cash payments. Do not enter them as collected funds.");
            return;
          }
          try {
            payment = await writeApi("/api/payments", "POST", {
              bookingId: booking.id,
              amountKobo: amount,
              method: values.method,
              reference: payment.reference,
            });
          } catch (error) {
            notify(error.message);
            return;
          }
        }
        updateList("payments", (items) => [payment, ...items]);
        updateList("bookings", (items) =>
          items.map((item) =>
            item.id === booking.id
              ? { ...item, paidKobo: item.paidKobo + amount }
              : item,
          ),
        );
      }
      if (!(await finishCheckout(booking, values.reason))) return;
    } else if (type === "cancel") {
      if (!allowed(role, "cancel")) {
        notify("Cancellation requires manager approval.");
        return;
      }
      const booking = record;
      if (!values.reason?.trim()) {
        notify("A cancellation reason is required.");
        return;
      }
      const fee = Math.min(
        booking.paidKobo,
        Math.round(Number(values.feeNaira || 0) * 100),
      );
      const refund = Math.max(0, booking.paidKobo - fee);
      if (role === "manager" && refund > 5000000) { notify("Refunds above ₦50,000 require CEO approval."); return; }
      if (!(await persistDatabaseBookingStatus(booking, "cancelled", values.reason, booking.databaseBooking ? refund : 0))) return;
      updateList("bookings", (items) =>
        items.map((item) =>
          item.id === booking.id
            ? { ...item, status: "cancelled", cancelReason: values.reason, paidKobo: Math.max(0, item.paidKobo - refund) }
            : item,
        ),
      );
      if (refund > 0 && !booking.databaseBooking)
        updateList("payments", (items) => [
          {
            id: makeCode("PAY-", items),
            bookingId: booking.id,
            method: "Refund",
            amountKobo: -refund,
            status: "refunded",
            reference: makeCode("REF-", data.payments),
            paidAt: today,
          },
          ...items,
        ]);
      writeAudit("booking", booking.id, "cancelled", booking, {
        ...booking,
        status: "cancelled",
        cancelReason: values.reason,
        refundKobo: refund,
      });
    } else if (type === "block") {
      if (values.end <= values.start) {
        notify("End date must be after the start date.");
        return;
      }
      const conflict = data.bookings.some((booking) => booking.unitId === record.id && ["hold", "confirmed", "checked_in"].includes(booking.status) && booking.checkIn < values.end && booking.checkOut > values.start);
      if (conflict) { notify("Move overlapping bookings before blocking this unit."); return; }
      let block;
      if (record.databaseRoom) {
        try {
          const response = await fetch(`/api/rooms/${encodeURIComponent(record.id)}/blocks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          const result = await response.json();
          if (!response.ok) {
            notify(result.error || "Room dates could not be blocked.");
            return;
          }
          block = { ...result, databaseBlock: true };
        } catch {
          notify("The room database is unavailable.");
          return;
        }
      } else {
        block = {
          id: makeCode("BLK-", data.blocks || []),
          unitId: record.id,
          start: values.start,
          end: values.end,
          reason: values.reason,
        };
      }
      updateList("blocks", (items) => [block, ...items]);
      writeAudit("unit", record.id, "blocked", record, block);
    } else if (type === "reply") {
      try {
        await writeApi(`/api/reviews/${encodeURIComponent(record.id)}/reply`, "PATCH", { reply: values.reply });
      } catch (error) {
        notify(error.message);
        return;
      }
      updateList("reviews", (items) => items.map((item) => item.id === record.id ? { ...item, reply: values.reply } : item));
    } else if (type === "voidInvoice") {
      if (!allowed(role, "cancel") || record.status === "paid" || !values.reason?.trim()) {
        notify("Only a manager or CEO can void an unpaid invoice with a reason.");
        return;
      }
      if (record.databaseInvoice) {
        try {
          await writeApi(`/api/invoices/${encodeURIComponent(record.id)}/status`, "PATCH", { status: "void", reason: values.reason });
        } catch (error) {
          notify(error.message);
          return;
        }
      }
      updateList("invoices", (items) => items.map((invoice) => invoice.id === record.id ? { ...invoice, status: "void", voidReason: values.reason } : invoice));
      writeAudit("invoice", record.id, "voided", record, { ...record, status: "void", voidReason: values.reason });
    }
    setModal(null);
    if (!["checkout", "cancel", "refund", "payment", "block", "voidInvoice"].includes(type))
      writeAudit(
        type,
        record?.id || values.name || values.itemId || "new",
        "created",
        null,
        values,
      );
    notify(
      type === "checkout"
        ? `${record.id} checked out; housekeeping task created.`
        : type === "cancel"
          ? `${record.id} cancelled; refund recorded where applicable.`
          : type === "refund"
            ? "Refund recorded in the local demo ledger."
            : "Changes saved in this browser demo.",
    );
  }

  async function finishCheckout(booking, reason = "") {
    if (!(await persistDatabaseBookingStatus(booking, "checked_out", reason))) return false;
    const unit = unitFor(data, booking.unitId);
    const task = {
      id: makeCode("HK-", data.tasks),
      unitId: booking.unitId,
      type: "Checkout clean",
      status: "open",
      priority: data.bookings.some(
        (item) => item.id !== booking.id && item.checkIn === booking.checkOut,
      )
        ? "High"
        : "Medium",
      assignedTo: "Unassigned",
      updatedAt: "Now",
    };
    updateList("bookings", (items) =>
      items.map((item) =>
        item.id === booking.id
          ? { ...item, status: "checked_out", checkoutReason: reason }
          : item,
      ),
    );
    updateList("units", (items) =>
      items.map((item) =>
        item.id === booking.unitId ? { ...item, status: "dirty" } : item,
      ),
    );
    if (!booking.databaseBooking) updateList("tasks", (items) => [task, ...items]);
    const earnedPoints = Math.floor(
      (booking.subtotalKobo || unit?.rateKobo * nightsBetween(booking.checkIn, booking.checkOut) || 0) / 10000,
    );
    updateList("guests", (items) =>
      items.map((guest) => {
        if (guest.id !== booking.guestId) return guest;
        const points = guest.points + earnedPoints;
        return { ...guest, points, tier: points >= 15000 ? "Platinum" : points >= 5000 ? "Gold" : "Silver" };
      }),
    );
    writeAudit("booking", booking.id, "checked out", booking, { ...booking, status: "checked_out", earnedPoints });
    if (unit)
      updateList("invoices", (items) =>
        items.map((invoice) =>
          invoice.bookingId === booking.id
            ? {
                ...invoice,
                status:
                  invoice.paidKobo >= invoice.totalKobo ? "paid" : "issued",
              }
            : invoice,
        ),
      );
    return true;
  }

  async function bookingAction(booking, action) {
    if (action === "edit") {
      if (!allowed(role, "edit_booking")) { notify("Only a manager or CEO can edit a reservation."); return; }
      setModal({ type: "booking", record: booking });
    } else if (action === "checkin") {
      const unit = unitFor(data, booking.unitId);
      const guest = guestFor(data, booking.guestId);
      if (booking.checkIn !== TODAY && role === "worker") {
        notify("Only a manager or CEO can override the scheduled check-in date.");
        return;
      }
      if (
        booking.status !== "confirmed" ||
        !unit ||
        !["available", "inspected"].includes(unit.status) ||
        !guest?.idNumber
      ) {
        notify(
          "Check-in requires a confirmed booking, a valid guest ID, and an available or inspected unit.",
        );
        return;
      }
      if (!(await persistDatabaseBookingStatus(booking, "checked_in"))) return;
      updateList("bookings", (items) =>
        items.map((item) =>
          item.id === booking.id
            ? {
                ...item,
                status: "checked_in",
                checkedInAt: getTimestamp(),
              }
            : item,
        ),
      );
      updateList("units", (items) =>
        items.map((item) =>
          item.id === unit.id ? { ...item, status: "occupied" } : item,
        ),
      );
      writeAudit("booking", booking.id, "checked in", booking, { ...booking, status: "checked_in" });
      notify(`${booking.id} checked in.`);
    } else if (action === "checkout") {
      if (balanceFor(booking) > 0) {
        if (!allowed(role, "checkout_credit")) {
          notify(
            "Collect the outstanding balance before check-out, or ask a manager to approve a company balance.",
          );
          return;
        }
        setModal({ type: "checkout", record: booking });
      } else {
        if (!(await finishCheckout(booking))) return;
        notify(`${booking.id} checked out. A housekeeping task was created.`);
      }
    } else if (action === "cancel") {
      if (!allowed(role, "cancel")) {
        notify("Cancellation requires manager approval.");
        return;
      }
      setModal({ type: "cancel", record: booking });
    } else if (action === "no_show") {
      if (!allowed(role, "cancel")) {
        notify("Only a manager or CEO can mark a no-show.");
        return;
      }
      if (!(await persistDatabaseBookingStatus(booking, "no_show"))) return;
      updateList("bookings", (items) =>
        items.map((item) =>
          item.id === booking.id ? { ...item, status: "no_show" } : item,
        ),
      );
      writeAudit("booking", booking.id, "no-show", booking, { ...booking, status: "no_show" });
      notify(`${booking.id} marked as no-show.`);
    } else if (action === "restore") {
      if (!allowed(role, "cancel")) { notify("Only a manager or CEO can restore a booking."); return; }
      const unit = unitFor(data, booking.unitId);
      if (!unit || !isUnitAvailable(unit, booking.checkIn, booking.checkOut, data.bookings.filter((item) => item.id !== booking.id), data.blocks || [])) { notify("That unit is no longer available for these dates."); return; }
      if (!(await persistDatabaseBookingStatus(booking, "confirmed"))) return;
      updateList("bookings", (items) => items.map((item) => item.id === booking.id ? { ...item, status: "confirmed" } : item));
      writeAudit("booking", booking.id, "restored", booking, { ...booking, status: "confirmed" });
      notify(`${booking.id} restored.`);
    }
  }

  async function taskAction(task, status) {
    if (status === "inspected" && !allowed(role, "inspect")) {
      notify("Only a manager or CEO can inspect a room.");
      return;
    }
    let updatedTask = {
      ...task,
      status,
      updatedAt: "Now",
      ...(status === "in_progress" ? { startedAt: getTimestamp() } : {}),
      ...(status === "done" ? { finishedAt: getTimestamp() } : {}),
    };
    if (task.databaseTask) {
      try {
        updatedTask = await writeApi(`/api/housekeeping/tasks/${encodeURIComponent(task.id)}/status`, "PATCH", { status });
      } catch (error) {
        notify(error.message);
        return;
      }
    }
    updateList("tasks", (items) =>
      items.map((item) =>
        item.id === task.id
          ? updatedTask
          : item,
      ),
    );
    if (status === "in_progress")
      updateList("units", (items) =>
        items.map((unit) =>
          unit.id === task.unitId ? { ...unit, status: "cleaning" } : unit,
        ),
      );
    if (status === "inspected")
      updateList("units", (items) =>
        items.map((unit) =>
          unit.id === task.unitId ? { ...unit, status: "available" } : unit,
        ),
      );
    writeAudit("housekeeping_task", task.id, status, task, { ...task, status });
    notify(
      status === "inspected"
        ? `Unit ${unitFor(data, task.unitId)?.number} inspected and released.`
        : `Task moved to ${status.replace("_", " ")}.`,
    );
  }

  async function purchaseAction(order, status) {
    if (status === "approved" && !allowed(role, "purchase")) {
      notify("Only a manager or CEO can approve purchase orders.");
      return;
    }
    const orderTotal = order.quantity * order.costKobo;
    if (status === "approved" && orderTotal > 10000000 && role !== "ceo") {
      notify("Purchase orders above ₦100,000 require CEO approval.");
      return;
    }
    if (status === "received" && order.status !== "approved") {
      notify("Approve this purchase order before receiving it.");
      return;
    }
    if (order.databasePurchaseOrder) {
      try {
        const savedOrder = await writeApi(`/api/purchase-orders/${encodeURIComponent(order.id)}/status`, "PATCH", { status });
        updateList("purchaseOrders", (items) => items.map((item) => item.id === order.id ? savedOrder : item));
        if (status === "received") await refreshPersistentOperations();
      } catch (error) {
        notify(error.message);
        return;
      }
      writeAudit("purchase_order", order.id, status, order, { ...order, status });
      notify(`Purchase order ${order.id} ${status}.`);
      return;
    }
    updateList("purchaseOrders", (items) =>
      items.map((item) => (item.id === order.id ? { ...item, status } : item)),
    );
    writeAudit("purchase_order", order.id, status, order, { ...order, status });
    if (status === "received") {
      updateList("inventory", (items) =>
        items.map((item) =>
          item.id === order.itemId
            ? {
                ...item,
                quantity: item.quantity + order.quantity,
                costKobo: order.costKobo,
              }
            : item,
        ),
      );
      updateList("stockMovements", (items) => [
        {
          id: makeCode("MOV-", items),
          itemId: order.itemId,
          type: "in",
          quantity: order.quantity,
          reason: `Received ${order.id}`,
          date: TODAY,
        },
        ...items,
      ]);
      updateList("expenses", (items) => [
        {
          id: makeCode("EXP-", items),
          category: "Supplies",
          amountKobo: order.quantity * order.costKobo,
          note: `Purchase order ${order.id}`,
          status: "approved",
          date: TODAY,
        },
        ...items,
      ]);
    }
    notify(`Purchase order ${order.id} ${status}.`);
  }

  function openBlock(unit) {
    setModal({ type: "block", record: unit });
  }
  async function sendMessage(conversationId, text) {
    const conversation = data.conversations.find((item) => item.id === conversationId);
    if (!conversation?.databaseConversation) {
      notify("This conversation is not connected to a saved guest record.");
      return;
    }
    let message;
    try {
      message = await writeApi(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, "POST", { body: text });
    } catch (error) {
      notify(error.message);
      return;
    }
    updateList("conversations", (items) =>
      items.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unread: 0,
              messages: [...conversation.messages, message],
            }
          : conversation,
      ),
    );
    notify("Message saved.");
  }
  async function markConversationRead(conversationId) {
    const conversation = data.conversations.find((item) => item.id === conversationId);
    if (conversation?.databaseConversation) {
      try {
        await writeApi(`/api/conversations/${encodeURIComponent(conversationId)}/read`, "PATCH", {});
      } catch (error) {
        notify(error.message);
        return;
      }
    }
    updateList("conversations", (items) => items.map((item) => item.id === conversationId ? { ...item, unread: 0 } : item));
  }
  async function settingsSave(values) {
    if (role !== "ceo") {
      notify("Only the CEO can change property settings.");
      return;
    }
    const settings = {
      checkInTime: values.checkInTime,
      checkOutTime: values.checkOutTime,
      servicePercent: Number(values.servicePercent),
      vatPercent: Number(values.vatPercent),
    };
    try {
      await writeApi("/api/settings", "PUT", settings);
    } catch (error) {
      notify(error.message);
      return;
    }
    setData((current) => ({
      ...current,
      settings: { ...current.settings, ...settings },
    }));
    notify("Property rules saved.");
  }
  async function toggleUser(user) {
    if (role !== "ceo" || user.id === currentUserId) {
      notify("A CEO cannot deactivate the active account from this screen.");
      return;
    }
    let saved;
    try {
      saved = await writeApi(`/api/users/${encodeURIComponent(user.id)}/active`, "PATCH", { active: !user.active });
    } catch (error) {
      notify(error.message);
      return;
    }
    updateList("users", (items) => items.map((item) => item.id === user.id ? saved : item));
    notify(`${user.name} ${saved.active ? "activated" : "deactivated"}.`);
  }
  async function issueInvoice(invoice) {
    if (invoice.databaseInvoice) {
      try {
        await writeApi(`/api/invoices/${encodeURIComponent(invoice.id)}/status`, "PATCH", { status: "issued" });
      } catch (error) {
        notify(error.message);
        return;
      }
    }
    updateList("invoices", (items) =>
      items.map((item) =>
        item.id === invoice.id
          ? {
              ...item,
              status: item.paidKobo >= item.totalKobo ? "paid" : "issued",
            }
          : item,
      ),
    );
    notify(`${invoice.id} issued.`);
  }
  function printInvoice(invoice) {
    const guest = guestFor(data, invoice.guestId);
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      notify("Allow pop-ups to print invoices.");
      return;
    }
    printWindow.document.write(
      `<title>${invoice.id}</title><style>body{font:14px Arial,sans-serif;margin:48px;color:#203028}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:28px}td{border-bottom:1px solid #ddd;padding:12px 0}.total{font-size:18px;font-weight:bold}</style><h1>Boms Apartment</h1><p>Guest invoice · ${invoice.id}</p><p>${guest?.name || "Guest"} · Booking ${invoice.bookingId}</p><table><tr><td>Invoice total</td><td>${formatMoney(invoice.totalKobo)}</td></tr><tr><td>Paid</td><td>${formatMoney(invoice.paidKobo)}</td></tr><tr class="total"><td>Balance</td><td>${formatMoney(Math.max(0, invoice.totalKobo - invoice.paidKobo))}</td></tr></table><p>Generated from the local UI demo.</p>`,
    );
    printWindow.document.close();
    printWindow.print();
  }

  const unread = data.conversations.reduce(
    (sum, conversation) => sum + conversation.unread,
    0,
  );
  const unreadSystemNotifications = systemNotifications.filter((notification) => !notification.read);
  const todayCheckouts = data.bookings.filter((booking) =>
    booking.databaseBooking && booking.status === "checked_in" && booking.checkOut === lagosClock.date,
  );
  const checkoutCalls = lagosClock.time >= "11:00" && lagosClock.time < "12:00" ? todayCheckouts : [];
  const checkoutFollowUps = lagosClock.time >= "12:00" ? todayCheckouts : [];
  const housekeepingPrepAlerts = lagosClock.time >= "11:30" && lagosClock.time < "13:00"
    ? todayCheckouts
    : [];
  const currentUser =
    data.users.find((user) => user.id === currentUserId) || data.users[0];
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter(([key]) => key !== "audit" || role === "ceo")
        .filter(([key]) => key !== "financials" || role !== "worker"),
    }))
    .filter((group) => group.items.length);
  const primaryNavKeys = new Set(["dashboard", "bookings", "rooms", "calendar", "housekeeping", "restaurant"]);
  const primaryNavGroups = visibleNavGroups
    .map((group) => ({ ...group, items: group.items.filter(([key]) => primaryNavKeys.has(key)) }))
    .filter((group) => group.items.length);
  const moreNavGroups = visibleNavGroups
    .map((group) => ({ ...group, items: group.items.filter(([key]) => !primaryNavKeys.has(key)) }))
    .filter((group) => group.items.length);
  const moreNavigationActive = moreNavGroups.some((group) => group.items.some(([key]) => key === page));
  const renderNavGroups = (groups) => groups.map((group) => (
    <div key={group.label}>
      <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa69f]">{group.label}</p>
      {group.items.map(([key, label, Icon]) => (
        <button key={key} onClick={() => navigate(key)} className={`mb-0.5 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition ${page === key ? "bg-[#eaf58a] text-[#29320b]" : "text-[#647269] hover:bg-[#f3f7f4] hover:text-[#26342d]"}`}>
          <Icon size={17} strokeWidth={1.8} /><span className="flex-1">{label}</span>
          {key === "messages" && unread > 0 && <span className="grid size-5 place-items-center rounded-full bg-[#d9484f] text-[10px] font-semibold text-white">{unread}</span>}
        </button>
      ))}
    </div>
  ));
  function exportCurrentView() {
    const exports = {
      bookings: [
        "booking_id,guest,unit,check_in,check_out,status,total_kobo",
        ...data.bookings.map((booking) =>
          [
            booking.id,
            guestFor(data, booking.guestId)?.name,
            unitFor(data, booking.unitId)?.number,
            booking.checkIn,
            booking.checkOut,
            booking.status,
            booking.totalKobo,
          ].join(","),
        ),
      ],
      guests: [
        "guest_id,name,phone,email,nationality,loyalty_tier,points",
        ...data.guests.map((guest) =>
          [
            guest.id,
            guest.name,
            guest.phone,
            guest.email,
            guest.nationality,
            guest.tier,
            guest.points,
          ].join(","),
        ),
      ],
      rooms: [
        "unit,room_type,status,rate_kobo",
        ...(databaseRooms.length ? databaseRooms : data.units).map((unit) =>
          [
            unit.number,
            unit.roomTypeName || roomTypeFor(data, unit.roomTypeId)?.name,
            unit.status,
            unit.rateKobo,
          ].join(","),
        ),
      ],
      payments: [
        "payment_id,booking_id,method,reference,status,amount_kobo",
        ...data.payments.map((payment) =>
          [
            payment.id,
            payment.bookingId,
            payment.method,
            payment.reference,
            payment.status,
            payment.amountKobo,
          ].join(","),
        ),
      ],
      inventory: [
        "item,category,quantity,unit,minimum,cost_kobo",
        ...data.inventory.map((item) =>
          [
            item.name,
            item.category,
            item.quantity,
            item.unit,
            item.minimum,
            item.costKobo,
          ].join(","),
        ),
      ],
    };
    const rows = exports[page];
    if (!rows) {
      notify(
        "CSV export is available for reservations, guests, rooms, payments, and inventory.",
      );
      return;
    }
    const csv = rows
      .map((row) =>
        row
          .split(",")
          .map((cell) => `"${cell.replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `boms-${page}-${TODAY}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify("CSV export downloaded.");
  }
  let content;
  switch (page) {
    case "dashboard":
      content = (
        <Dashboard
          data={data}
          databaseRooms={databaseRooms}
          fnbData={fnbData}
          fnbLoading={fnbLoading}
          userName={currentUser.name}
          onNavigate={navigate}
          onCreate={requestCreate}
          onBookingAction={bookingAction}
          onExtendBooking={extendBookingStay}
          onSaveFnbOrder={createFnbOrder}
          canAddMenu={allowed(role, "stock")}
          onAddMenu={(preset = null) => setModal({ type: "fnbMenu", record: preset })}
          checkoutCalls={checkoutCalls}
          housekeepingPrepAlerts={housekeepingPrepAlerts}
          checkoutFollowUps={checkoutFollowUps}
        />
      );
      break;
    case "bookings":
      content = (
        <BookingsPage
          data={data}
          search={search}
          onSearch={setSearch}
          role={role}
          onCreate={requestCreate}
          onAction={bookingAction}
          onNavigate={navigate}
        />
      );
      break;
    case "guests":
      content = (
        <GuestsPage
          data={data}
          search={search}
          onSearch={setSearch}
          onCreate={requestCreate}
        />
      );
      break;
    case "rooms":
      content = (
        <RoomsPage
          rooms={databaseRooms}
          search={search}
          onSearch={setSearch}
          role={role}
          onCreate={requestCreate}
          onEditRoom={(room) => setModal({ type: "roomEditor", record: room })}
          onBlock={openBlock}
          onUnitStatus={updateDatabaseRoomStatus}
          loading={roomsLoading}
          error={roomsError}
        />
      );
      break;
    case "calendar":
      content = <CalendarPage data={data} onCreate={requestCreate} />;
      break;
    case "housekeeping":
      content = (
        <HousekeepingPage
          data={data}
          role={role}
          currentUserName={currentUser.name}
          onCreate={requestCreate}
          onTaskAction={taskAction}
        />
      );
      break;
    case "restaurant":
      content = (
        <RestaurantPage
          data={data}
          fnbData={fnbData}
          role={role}
          loading={fnbLoading}
          onAddMenu={(preset = null) => setModal({ type: "fnbMenu", record: preset })}
          onNewOrder={() => setModal({ type: "fnbOrder" })}
          onStatus={updateFnbOrder}
          onAvailability={updateMenuAvailability}
          onRefund={(order) => setModal({ type: "fnbRefund", record: order })}
        />
      );
      break;
    case "inventory":
      content = (
        <InventoryPage
          data={data}
          role={role}
          search={search}
          onSearch={setSearch}
          onCreate={requestCreate}
          batches={fnbData.batches}
          minibarMovements={fnbData.minibarMovements}
          onStock={(type, item) => {
            const permission = ["stockOut", "minibar"].includes(type) ? "stock_use" : "stock";
            if (!allowed(role, permission)) {
              notify("Your current role cannot perform that stock action.");
              return;
            }
            setModal({ type, record: item });
          }}
        />
      );
      break;
    case "purchasing":
      content = (
        <PurchasingPage
          data={data}
          role={role}
          onCreate={requestCreate}
          onPurchaseAction={purchaseAction}
        />
      );
      break;
    case "payments":
      content = (
        <PaymentsPage
          data={data}
          role={role}
          search={search}
          onSearch={setSearch}
          onCreate={requestCreate}
          onIssue={issueInvoice}
          onPrint={printInvoice}
          onRefund={() => requestCreate("refund")}
          onVoid={(invoice) => requestCreate("voidInvoice", invoice)}
        />
      );
      break;
    case "financials":
      content =
        role === "worker" ? (
          <Panel>
            <EmptyPanel
              icon={ShieldCheck}
              title="Financial access restricted"
              detail="Only managers and CEOs can view financial information."
            />
          </Panel>
        ) : (
          <FinancialsPage
            data={data}
            fnbData={fnbData}
            role={role}
            onCreate={requestCreate}
            onExpenseAction={async (expense, status) => {
              let savedExpense = { ...expense, status };
              if (expense.databaseExpense) {
                try {
                  savedExpense = await writeApi(`/api/expenses/${encodeURIComponent(expense.id)}/status`, "PATCH", { status });
                } catch (error) {
                  notify(error.message);
                  return;
                }
              }
              updateList("expenses", (items) =>
                items.map((item) =>
                  item.id === expense.id ? savedExpense : item,
                ),
              );
              writeAudit("expense", expense.id, status, expense, {
                ...expense,
                status,
              });
              notify(`Expense ${status}.`);
            }}
          />
        );
      break;
    case "messages":
      content = <MessagesPage data={data} onSend={sendMessage} onRead={markConversationRead} />;
      break;
    case "reviews":
      content = (
        <ReviewsPage
          data={data}
          onReply={(review) => setModal({ type: "reply", record: review })}
        />
      );
      break;
    case "concierge":
      content = (
        <ConciergePage
          data={data}
          onCreate={requestCreate}
          onRequestAction={async (request, status) => {
            try {
              await writeApi(`/api/concierge/${encodeURIComponent(request.id)}/status`, "PATCH", { status });
              updateList("requests", (items) => items.map((item) => item.id === request.id ? { ...item, status } : item));
              if (status === "done" && request.costKobo) await refreshPersistentOperations();
              notify(status === "done" && request.costKobo ? `${formatMoney(request.costKobo)} added to the guest folio.` : `Request ${status}.`);
            } catch (error) {
              notify(error.message);
            }
          }}
        />
      );
      break;
    case "team":
      content = (
        <TeamPage
          data={data}
          role={role}
          onCreate={requestCreate}
          onSettings={settingsSave}
          onUserToggle={toggleUser}
          onSetPassword={(user) => setModal({ type: "setPassword", record: user })}
        />
      );
      break;
    case "audit":
      content =
        role === "ceo" ? (
          <AuditPage data={data} />
        ) : (
          <Panel>
            <EmptyPanel
              icon={ShieldCheck}
              title="CEO access required"
              detail="Audit history is restricted to the CEO role."
            />
          </Panel>
        );
      break;
    default:
      content = (
        <Dashboard
          data={data}
          databaseRooms={databaseRooms}
          fnbData={fnbData}
          fnbLoading={fnbLoading}
          userName={currentUser.name}
          onNavigate={navigate}
          onCreate={requestCreate}
          onBookingAction={bookingAction}
          onExtendBooking={extendBookingStay}
          onSaveFnbOrder={createFnbOrder}
          canAddMenu={allowed(role, "stock")}
          onAddMenu={(preset = null) => setModal({ type: "fnbMenu", record: preset })}
          checkoutCalls={checkoutCalls}
          housekeepingPrepAlerts={housekeepingPrepAlerts}
          checkoutFollowUps={checkoutFollowUps}
        />
      );
  }

  if (authLoading) return <main className="grid min-h-screen place-items-center bg-[#f1f5f1] text-sm text-[#718078]">Checking staff session…</main>;
  if (!signedIn) return <LoginScreen onLogin={signIn} />;

  return (
    <div className="min-h-screen w-full bg-[#f1f4f1] font-sans text-[#26342d] antialiased">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-[#e4ebe6] bg-white px-4 py-5 lg:flex">
          <a
            href="#dashboard"
            onClick={(event) => {
              event.preventDefault();
              navigate("dashboard");
            }}
            className="mb-7 flex items-center gap-3 px-2"
          >
            <span className="grid size-9 grid-cols-2 gap-1 rounded-lg bg-[#f0f6e6] p-1.5">
              <i className="rounded-sm bg-[#dff47d]" />
              <i className="rounded-sm bg-[#cfeee0]" />
              <i className="rounded-sm bg-[#cfeee0]" />
              <i className="rounded-sm bg-[#dff47d]" />
            </span>
            <span>
              <strong className="block text-sm font-semibold leading-tight text-[#1d2b24]">
                Boms Apartment
              </strong>
              <small className="text-[11px] text-[#839087]">
                Property operations
              </small>
            </span>
          </a>
          <nav
            className="min-h-0 flex-1 space-y-5 overflow-y-auto"
            aria-label="Main navigation"
          >
            {renderNavGroups(primaryNavGroups)}
            {moreNavGroups.length > 0 && <details open={moreNavigationActive || undefined} className="border-t border-[#e7eee8] pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-3 text-sm font-semibold text-[#526157] hover:bg-[#f3f7f4]">
                More tools <ChevronDown size={16} />
              </summary>
              <div className="mt-3 space-y-4">{renderNavGroups(moreNavGroups)}</div>
            </details>}
          </nav>
          <Button className="mt-4 w-full" onClick={() => requestCreate("booking")}><Plus size={16} />Book a room</Button>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-[#e4ebe6] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <button
              className="grid size-9 place-items-center rounded-lg text-[#607067] hover:bg-[#f1f5f2] lg:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              <Menu size={19} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#88958d] sm:flex">
              <Building2 size={15} />
              <span>Boms Apartment</span>
              <span>/</span>
              <span className="font-medium text-[#3b4a41]">
                {pageNames[page]}
              </span>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="hidden md:block">
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Search this view…"
                />
              </div>
              {['bookings', 'guests', 'rooms', 'payments', 'inventory'].includes(page) && <button onClick={exportCurrentView} className="grid size-10 place-items-center rounded-lg border border-[#e6ece8] text-[#647269] hover:bg-[#f7f9f7]" aria-label="Export current view" title="Export CSV"><Download size={17} /></button>}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen((open) => !open)}
                  className="relative grid size-10 place-items-center rounded-lg border border-[#e6ece8] text-[#647269] hover:bg-[#f7f9f7]"
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {unread + unreadSystemNotifications.length + checkoutFollowUps.length + housekeepingPrepAlerts.length > 0 && (
                    <i className="absolute right-2 top-2 size-2 rounded-full bg-[#d9484f] ring-2 ring-white" />
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-40 max-h-[min(80vh,34rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[#e2e9e4] bg-white p-3 shadow-xl">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <strong className="text-sm">Notifications</strong>
                      {unread > 0 && <button
                        className="text-xs text-[#176b54]"
                        onClick={() => {
                          updateList("conversations", (items) =>
                            items.map((item) => ({ ...item, unread: 0 })),
                          );
                          setNotificationsOpen(false);
                        }}
                      >
                        Mark messages read
                      </button>}
                    </div>
                    {housekeepingPrepAlerts.map((booking) => {
                      const guest = guestFor(data, booking.guestId);
                      const unit = unitFor(data, booking.unitId);
                      return (
                        <div key={`housekeeping-${booking.id}`} className="mb-2 rounded-lg border border-[#d7e3d9] bg-[#f5f8f4] p-3">
                          <p className="text-xs font-semibold uppercase text-[#526957]">Checkout today · Room {unit?.number || "—"}</p>
                          <p className="mt-1 text-sm font-medium text-[#2e3e34]">{guest?.name || "Guest"} is due out by {data.settings.checkOutTime}.</p>
                          <p className="mt-1 text-xs text-[#66776c]">Call housekeeping to tidy the room after checkout.</p>
                          <button onClick={() => { navigate("housekeeping"); setNotificationsOpen(false); }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176b54]">
                            <ClipboardList size={14} />Open housekeeping board
                          </button>
                        </div>
                      );
                    })}
                    {checkoutFollowUps.map((booking) => {
                      const guest = guestFor(data, booking.guestId);
                      const unit = unitFor(data, booking.unitId);
                      return (
                        <div key={booking.id} className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-semibold uppercase text-[#795e2b]">Checkout overdue · Room {unit?.number || "—"}</p>
                          <p className="mt-1 text-sm font-medium text-[#3c3322]">{guest?.name || "Guest"} was due out by {data.settings.checkOutTime}.</p>
                          <p className="mt-1 text-xs text-[#795e2b]">Ask whether they’re extending or checking out.</p>
                          {guest?.phone ? (
                            <a href={`tel:${guest.phone.replace(/[^+\d]/g, "")}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176b54]">
                              <PhoneCall size={14} />Call {guest.phone}
                            </a>
                          ) : <p className="mt-2 text-xs text-[#795e2b]">No phone number on file</p>}
                        </div>
                      );
                    })}
                    {unreadSystemNotifications.map((notification) => (
                      <div key={notification.id} className="mb-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
                        <p className="text-xs font-semibold uppercase text-rose-800">Stock alert</p>
                        <p className="mt-1 text-sm font-semibold text-rose-950">{notification.title}</p>
                        <p className="mt-1 text-xs text-rose-900">{notification.body}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button onClick={() => { navigate("inventory"); setNotificationsOpen(false); }} className="text-xs font-semibold text-rose-900 underline">Open inventory</button>
                          <button onClick={() => markNotificationRead(notification)} aria-label="Mark stock alert as read" className="text-xs font-medium text-rose-800">Mark read</button>
                        </div>
                      </div>
                    ))}
                    {unread > 0 && (
                      <button
                        onClick={() => {
                          navigate("messages");
                          setNotificationsOpen(false);
                        }}
                        className="flex w-full gap-2 rounded-lg p-2 text-left text-sm hover:bg-[#f4f7f4]"
                      >
                        <MessageSquare
                          size={16}
                          className="mt-0.5 text-[#176b54]"
                        />
                        <span>{unread} unread guest messages</span>
                      </button>
                    )}
                    {!unread && !unreadSystemNotifications.length && !housekeepingPrepAlerts.length && !checkoutFollowUps.length && (
                      <p className="p-2 text-sm text-[#829087]">
                        You’re all caught up.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden h-9 w-px bg-[#e7ece8] sm:block" />
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-[#eaf58a] text-xs font-semibold text-[#29320b]">
                  {initials(currentUser.name)}
                </span>
                <div className="hidden leading-tight md:block">
                  <p className="text-xs font-semibold text-[#35443b]">
                    {currentUser.name}
                  </p>
                  <p className="text-[10px] capitalize text-[#79867e]">{role === "ceo" ? "CEO / Admin" : role}</p>
                </div>
              </div>
              <button onClick={signOut} className="grid size-10 place-items-center rounded-lg border border-[#e6ece8] text-[#647269] hover:bg-[#f7f9f7]" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
            </div>
          </header>
          {!isOnline && <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 sm:px-6 lg:px-8"><CircleAlert size={15} />You’re offline. This demo keeps changes on this device; production sync is not connected.</div>}
          {mobileNavOpen && (
            <nav className="flex gap-1 overflow-x-auto border-b border-[#e4ebe6] bg-white px-3 py-2 lg:hidden">
              {primaryNavGroups
                .flatMap((group) => group.items)
                .map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => navigate(key)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs ${page === key ? "bg-[#eaf58a] text-[#29320b]" : "text-[#647269]"}`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              {moreNavGroups.length > 0 && <details className="relative shrink-0">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#647269] hover:bg-[#f3f7f4]">
                  More <ChevronDown size={14} />
                </summary>
                <div className="absolute right-0 top-full z-40 mt-1 max-h-[60vh] w-56 overflow-y-auto rounded-lg border border-[#e2e9e4] bg-white p-2 shadow-xl">
                  {renderNavGroups(moreNavGroups)}
                </div>
              </details>}
            </nav>
          )}
          <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {content}
          </main>
        </div>
      </div>
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg bg-[#21352a] px-4 py-3 text-sm text-white shadow-xl"
        >
          <CircleCheck size={17} className="shrink-0 text-[#dff47d]" />
          {toast}
        </div>
      )}
      {modal?.type === "fnbMenu" ? (
        <MenuItemDialog data={data} preset={modal.record} onClose={() => setModal(null)} onSave={saveMenuItem} />
      ) : modal?.type === "fnbOrder" ? (
        <FnbOrderDialog data={data} fnbData={fnbData} onClose={() => setModal(null)} onSave={createFnbOrder} />
      ) : modal?.type === "fnbRefund" ? (
        <FnbRefundDialog order={modal.record} onClose={() => setModal(null)} onSave={refundFnbOrder} />
      ) : modal?.type === "roomEditor" ? (
        <RoomEditorDialog
          key={modal.record.id}
          room={modal.record}
          onClose={() => setModal(null)}
          onSave={saveRoom}
        />
      ) : modal?.type === "booking" ? (
        <BookingDialog
          key={modal.record?.id || "new-booking"}
          data={data}
          role={role}
          record={modal.record}
          onClose={() => setModal(null)}
          onSave={saveBooking}
        />
      ) : (
        modal && (
          <RecordDialog
            type={modal.type}
            data={data}
            record={modal.record}
            onClose={() => setModal(null)}
            onSave={saveRecord}
          />
        )
      )}
    </div>
  );
}

export default App;
