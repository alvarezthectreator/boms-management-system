import { useEffect, useState } from "react";
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
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Package,
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
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  calculateQuote,
  createInitialData,
  formatDate,
  formatMoney,
  getNightlyRates,
  isUnitAvailable,
  makeCode,
  nightsBetween,
} from "./data.js";

const STORAGE_KEY = "boms-hotel-demo-v1";
const TODAY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Lagos" }).format(new Date());
const getTimestamp = () => new Date().toISOString();
const roleActions = {
  worker: [
    "booking",
    "checkin",
    "checkout_paid",
    "housekeeping",
    "stock_use",
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
    return { ...defaults, ...stored, settings: { ...defaults.settings, ...stored.settings }, auditLogs: stored.auditLogs || [], blocks: stored.blocks || [] };
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
    label: `${type.name} · ${type.size} m²`,
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
  const initialCheckIn = record?.checkIn || TODAY;
  const initialCheckOut = new Date(Date.parse(`${initialCheckIn}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const initialUnit = record && unitFor(data, record.unitId);
  const [roomTypeId, setRoomTypeId] = useState(initialUnit?.roomTypeId || data.roomTypes[0]?.id || "");
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
      unit.roomTypeId === roomTypeId &&
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
      roomTypeId,
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
      title={record ? `Edit reservation · ${record.id}` : "Create reservation"}
      description={record ? "Update dates, room, guests, and the quoted total." : "Check availability and confirm the stay details."}
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
              options: roomOptionList(data),
            }}
            value={roomTypeId}
            onChange={(event) => {
              setRoomTypeId(event.target.value);
              setUnitId("");
            }}
          />
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
          options: ["Linen", "Food", "Supplies", "Maintenance"].map(
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
        { name: "note", label: "Note", type: "textarea", required: false },
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

function Dashboard({
  data,
  role,
  userName,
  onNavigate,
  onCreate,
  onBookingAction,
}) {
  const arrivals = data.bookings.filter(
    (booking) => booking.checkIn === TODAY && booking.status === "confirmed",
  ).length;
  const departures = data.bookings.filter(
    (booking) => booking.checkOut === TODAY && booking.status === "checked_in",
  ).length;
  const occupied = data.units.filter(
    (unit) => unit.status === "occupied",
  ).length;
  const availableForOccupancy = data.units.filter(
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
  const barValues = [42, 67, 52, 84, 58, 91, 73];
  return (
    <>
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {role !== "worker" && (
          <StatCard
            label="Revenue received"
            value={formatMoney(revenue)}
            note="Payments received this month"
            trend="12.4% vs last month"
            icon={Wallet}
          />
        )}
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
                  data.units.filter((unit) =>
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
                  data.units.filter((unit) => unit.status === "out_of_order")
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
    </>
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
  data,
  search,
  onSearch,
  role,
  onCreate,
  onBlock,
  onUnitStatus,
}) {
  const rows = data.units.filter((unit) =>
    `${unit.number} ${roomTypeFor(data, unit.roomTypeId)?.name} ${unit.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const counts = ["available", "occupied", "dirty", "out_of_order"].map(
    (status) => [
      status,
      data.units.filter((unit) => unit.status === status).length,
    ],
  );
  return (
    <>
      <PageHeader
        title="Rooms & units"
        description="Manage room inventory, occupancy, and maintenance blocks."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onCreate("rateRule")} disabled={!allowed(role, "inspect")}><SlidersHorizontal size={16} />Rates</Button>
            <Button variant="secondary" onClick={() => onCreate("roomType")} disabled={!allowed(role, "inspect")}><Plus size={16} />Room type</Button>
            <Button onClick={() => onCreate("unit")} disabled={!allowed(role, "inspect")}><Plus size={16} />Add unit</Button>
          </div>
        }
      />
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
          placeholder="Find unit or type"
        />
      </div>
      <Panel>
        <DataTable
          columns={[
            {
              key: "number",
              label: "Unit",
              render: (unit) => (
                <span className="font-semibold">{unit.number}</span>
              ),
            },
            {
              key: "type",
              label: "Room type",
              render: (unit) => roomTypeFor(data, unit.roomTypeId)?.name,
            },
            { key: "floor", label: "Floor" },
            {
              key: "rate",
              label: "Rate / night",
              render: (unit) => formatMoney(unit.rateKobo),
            },
            { key: "guests", label: "Max guests" },
            {
              key: "status",
              label: "Status",
              render: (unit) => <Status value={unit.status} />,
            },
            {
              key: "action",
              label: "Action",
              render: (unit) =>
                unit.status === "out_of_order" ? (
                  allowed(role, "inspect") ? (
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2.5 text-xs"
                      onClick={() => onUnitStatus(unit, "available")}
                    >
                      Return to service
                    </Button>
                  ) : (
                    <span className="text-xs text-[#87938b]">Manager only</span>
                  )
                ) : ["available", "inspected"].includes(unit.status) ? (
                  allowed(role, "inspect") ? (
                    <Button
                      variant="secondary"
                      className="min-h-8 px-2.5 text-xs"
                      onClick={() => onBlock(unit)}
                    >
                      Block dates
                    </Button>
                  ) : (
                    <span className="text-xs text-[#87938b]">—</span>
                  )
                ) : (
                  <span className="text-xs text-[#87938b]">—</span>
                ),
            },
          ]}
          rows={rows}
        />
      </Panel>
      <Panel className="mt-4 p-4 text-sm text-[#68766e]">
        <div className="flex gap-3">
          <CircleAlert size={18} className="shrink-0 text-amber-600" />
          <p>
            Availability is checked against active reservations and demo
            maintenance blocks. The production API must also enforce date
            overlap inside a database transaction.
          </p>
        </div>
      </Panel>
      <Panel className="mt-4">
        <div className="px-4 py-4 sm:px-5"><h2 className="font-semibold text-[#28362e]">Seasonal & long-stay rates</h2><p className="mt-1 text-xs text-[#78867e]">The most specific date rule applies; min-night rules support weekly and monthly stays.</p></div>
        {data.rateRules?.length ? <DataTable columns={[{ key: "room", label: "Room type", render: (rule) => roomTypeFor(data, rule.roomTypeId)?.name }, { key: "dates", label: "Dates", render: (rule) => `${formatDate(rule.startDate)} – ${formatDate(rule.endDate)}` }, { key: "minimum", label: "Minimum stay", render: (rule) => rule.minNights ? `${rule.minNights} nights` : "Any" }, { key: "rate", label: "Rate / night", render: (rule) => formatMoney(rule.rateKobo) }]} rows={data.rateRules} /> : <EmptyPanel icon={SlidersHorizontal} title="No rate rules yet" detail="Base room rates are used until a seasonal or long-stay rate is added." />}
      </Panel>
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

function InventoryPage({ data, role, search, onSearch, onCreate, onStock }) {
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
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Panel>
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

function FinancialsPage({ data, role, onCreate, onExpenseAction }) {
  const revenue = data.payments
    .filter((payment) => ["paid", "refunded"].includes(payment.status))
    .reduce((sum, payment) => sum + payment.amountKobo, 0);
  const expenses = data.expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + expense.amountKobo, 0);
  const approvedOrders = data.purchaseOrders
    .filter((order) => order.status === "received")
    .reduce((sum, order) => sum + order.quantity * order.costKobo, 0);
  const net = revenue - expenses - approvedOrders;
  const rows = data.expenses.map((expense) => ({ ...expense, id: expense.id }));
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
          note="Recorded payments"
          icon={Wallet}
        />
        <StatCard
          label="Approved expenses"
          value={formatMoney(expenses + approvedOrders)}
          note="Expenses and received orders"
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
            {[48, 74, 59, 88, 62, 78, 54].map((height, index) => (
              <div
                key={index}
                className="flex h-full flex-1 items-end justify-center gap-1"
              >
                <span
                  className="w-3 rounded-t bg-[#acd2b8]"
                  style={{ height: `${height}%` }}
                />
                <span
                  className="w-3 rounded-t bg-[#eaf58a]"
                  style={{ height: `${Math.max(14, height - 24)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[11px] text-[#7b8981]">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
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
          {data.expenses.filter((expense) => expense.status === "pending")
            .length ? (
            data.expenses
              .filter((expense) => expense.status === "pending")
              .map((expense) => (
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
        <div className="px-4 py-4 sm:px-5"><h2 className="font-semibold text-[#28362e]">Daily close history</h2><p className="mt-1 text-xs text-[#78867e]">Closed days are immutable in the production system.</p></div>
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
              Demo messages are stored locally. Real-time delivery and email/SMS
              fallback need backend integration.
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

function TeamPage({ data, role, onCreate, onSettings, onUserToggle }) {
  return (
    <>
      <PageHeader
        title="Team & settings"
        description="Manage demo roles and property-wide operating rules."
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
              Role options mirror the specification. The backend must enforce
              every permission.
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
                render: (user) => <div className="flex items-center gap-2"><Status value={user.active ? "available" : "cancelled"} />{role === "ceo" && <button onClick={() => onUserToggle(user)} className="text-xs font-medium text-[#176b54] hover:underline">{user.active ? "Deactivate" : "Activate"}</button>}</div>,
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
              confirmation. Changes here affect future demo quotes only.
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
            Changing the role selector in the top bar previews UI permissions
            only. It does not provide authentication or secure any data;
            production authorization belongs on the API and database.
          </p>
        </div>
      </Panel>
    </>
  );
}

function LoginScreen({ data, onLogin }) {
  const [email, setEmail] = useState(
    data.users.find((user) => user.active)?.email || "",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    const user = data.users.find(
      (item) => item.active && item.email.toLowerCase() === email.toLowerCase(),
    );
    if (!user || !password) {
      setError(
        "Choose an active demo account and enter a password to continue.",
      );
      return;
    }
    onLogin(user);
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
            <InputField
              field={{
                name: "email",
                label: "Team account",
                type: "select",
                options: data.users
                  .filter((user) => user.active)
                  .map((user) => ({
                    value: user.email,
                    label: `${user.name} · ${user.role}`,
                  })),
              }}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
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
                placeholder="Enter any password for the UI demo"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in <ArrowRight size={16} />
            </Button>
          </form>
          <p className="mt-5 rounded-lg bg-[#f4f7f4] p-3 text-xs leading-5 text-[#718078]">
            Front-end preview only. This sign-in does not authenticate
            credentials or create a secure session; connect the production
            authentication API before deployment.
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
  const [page, setPage] = useState("dashboard");
  const [role, setRole] = useState(
    () => localStorage.getItem("boms-demo-role") || "manager",
  );
  const [currentUserId, setCurrentUserId] = useState(
    () => localStorage.getItem("boms-demo-user") || "USR-002",
  );
  const [signedIn, setSignedIn] = useState(
    () => localStorage.getItem("boms-demo-session") !== "signed-out",
  );
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);
  useEffect(() => {
    localStorage.setItem("boms-demo-role", role);
  }, [role]);
  useEffect(() => {
    localStorage.setItem("boms-demo-user", currentUserId);
  }, [currentUserId]);
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
  }
  function signIn(user) {
    setCurrentUserId(user.id);
    setRole(user.role);
    setSignedIn(true);
    localStorage.removeItem("boms-demo-session");
    navigate("dashboard");
  }
  function signOut() {
    setSignedIn(false);
    localStorage.setItem("boms-demo-session", "signed-out");
  }
  function requestCreate(type, record = null) {
    const requiredPermission = {
      booking: "booking", guest: "booking", unit: "inspect", roomType: "inspect", rateRule: "inspect",
      task: "inspect", request: "concierge", item: "inspect", purchase: "purchase",
      stock: "stock", stockOut: "stock_use", stockAdjust: "stock", expense: "expense",
      user: "all", refund: "refund", voidInvoice: "cancel",
    }[type];
    if (requiredPermission && !allowed(role, requiredPermission)) {
      notify("Your current role cannot perform that action.");
      return;
    }
    setModal({ type, record });
  }

  function saveBooking(payload) {
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
    const bookingId = existing?.id || makeCode("BA-B", data.bookings);
    const booking = {
      ...existing,
      id: bookingId,
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

  function saveRecord(type, values, record) {
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
      const guest = {
        id: makeCode("G-", data.guests),
        name: values.name,
        phone: values.phone,
        email: values.email,
        nationality: values.nationality || "—",
        idNumber: values.idNumber || "",
        tier: "Silver",
        points: 0,
      };
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
      const payment = {
        id: makeCode("PAY-", data.payments),
        bookingId: booking.id,
        method: values.method,
        amountKobo,
        status: values.method === "Online" ? "pending" : "paid",
        reference: values.reference || makeCode("REF-", data.payments),
        paidAt: today,
      };
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
      const refund = {
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
      const item = {
        id: makeCode("IT-", data.inventory),
        name: values.name,
        category: values.category,
        unit: values.unit,
        quantity: Number(values.quantity),
        minimum: Number(values.minimum),
        costKobo,
        supplierId: "",
      };
      updateList("inventory", (items) => [item, ...items]);
    } else if (type === "stock") {
      const item = data.inventory.find((entry) => entry.id === values.itemId);
      const quantity = Number(values.quantity);
      if (!item || quantity <= 0) {
        notify("Enter a valid quantity.");
        return;
      }
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
    } else if (type === "stockOut") {
      if (!allowed(role, "stock_use")) { notify("Your role cannot record stock use."); return; }
      const item = data.inventory.find((entry) => entry.id === values.itemId);
      const quantity = Number(values.quantity);
      if (!item || quantity <= 0 || quantity > item.quantity) {
        notify("Quantity must be above zero and cannot exceed current stock.");
        return;
      }
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
    } else if (type === "purchase") {
      const order = {
        id: makeCode("PO-", data.purchaseOrders),
        supplierId: values.supplierId,
        itemId: values.itemId,
        quantity: Number(values.quantity),
        costKobo,
        status: "draft",
        date: today,
      };
      updateList("purchaseOrders", (items) => [order, ...items]);
    } else if (type === "expense") {
      const expense = {
        id: makeCode("EXP-", data.expenses),
        category: values.category,
        amountKobo,
        note: values.note,
        status: amountKobo > 10000000 ? "pending" : "approved",
        date: today,
      };
      updateList("expenses", (items) => [expense, ...items]);
    } else if (type === "dayClose") {
      if (data.dailyClosings.some((closing) => closing.date === today)) {
        notify("This date has already been closed and cannot be edited.");
        return;
      }
      const methods = ["Cash", "Transfer", "Card"];
      const expected = Object.fromEntries(methods.map((method) => [method.toLowerCase(), data.payments.filter((payment) => payment.status === "paid" && payment.paidAt === today && payment.method === method).reduce((sum, payment) => sum + payment.amountKobo, 0)]));
      const counted = { cash: Math.round(Number(values.cashNaira || 0) * 100), transfer: Math.round(Number(values.transferNaira || 0) * 100), card: Math.round(Number(values.cardNaira || 0) * 100) };
      const differenceKobo = Object.keys(counted).reduce((sum, method) => sum + counted[method] - expected[method], 0);
      if (differenceKobo !== 0 && !values.note?.trim()) { notify("Add a note explaining the reconciliation difference."); return; }
      const closing = { id: makeCode("CLOSE-", data.dailyClosings), date: today, expected, counted, differenceKobo, note: values.note || "Balanced", closedBy: currentUser.name, closedAt: getTimestamp() };
      updateList("dailyClosings", (items) => [closing, ...items]);
      writeAudit("daily_close", closing.id, "closed", null, closing);
    } else if (type === "task") {
      const task = {
        id: makeCode("HK-", data.tasks),
        unitId: values.unitId,
        type: values.type,
        status: "open",
        priority: values.priority,
        assignedTo: values.assignedTo,
        updatedAt: "Now",
      };
      updateList("tasks", (items) => [task, ...items]);
      if (values.type === "Checkout clean")
        updateList("units", (items) =>
          items.map((unit) =>
            unit.id === task.unitId ? { ...unit, status: "dirty" } : unit,
          ),
        );
    } else if (type === "request") {
      const request = {
        id: makeCode("CON-", data.requests),
        guestId: values.guestId,
        unitId: values.unitId,
        type: values.type,
        details: values.details,
        status: "open",
        assignedTo: values.assignedTo,
        costKobo: costKobo,
      };
      updateList("requests", (items) => [request, ...items]);
    } else if (type === "user") {
      updateList("users", (items) => [
        {
          id: makeCode("USR-", items),
          name: values.name,
          email: values.email,
          role: values.role,
          active: true,
        },
        ...items,
      ]);
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
        const payment = {
          id: makeCode("PAY-", data.payments),
          bookingId: booking.id,
          method: values.method,
          amountKobo: amount,
          status: "paid",
          reference: makeCode("REF-", data.payments),
          paidAt: today,
        };
        updateList("payments", (items) => [payment, ...items]);
        updateList("bookings", (items) =>
          items.map((item) =>
            item.id === booking.id
              ? { ...item, paidKobo: item.paidKobo + amount }
              : item,
          ),
        );
      }
      finishCheckout(booking, values.reason);
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
      updateList("bookings", (items) =>
        items.map((item) =>
          item.id === booking.id
            ? { ...item, status: "cancelled", cancelReason: values.reason }
            : item,
        ),
      );
      if (refund > 0)
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
      const block = {
        id: makeCode("BLK-", data.blocks || []),
        unitId: record.id,
        start: values.start,
        end: values.end,
        reason: values.reason,
      };
      updateList("blocks", (items) => [block, ...items]);
      writeAudit("unit", record.id, "blocked", record, block);
    } else if (type === "reply") {
      updateList("reviews", (items) =>
        items.map((item) =>
          item.id === record.id ? { ...item, reply: values.reply } : item,
        ),
      );
    } else if (type === "voidInvoice") {
      if (!allowed(role, "cancel") || record.status === "paid" || !values.reason?.trim()) {
        notify("Only a manager or CEO can void an unpaid invoice with a reason.");
        return;
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

  function finishCheckout(booking, reason = "") {
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
    updateList("tasks", (items) => [task, ...items]);
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
  }

  function bookingAction(booking, action) {
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
        finishCheckout(booking);
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
      updateList("bookings", (items) => items.map((item) => item.id === booking.id ? { ...item, status: "confirmed" } : item));
      writeAudit("booking", booking.id, "restored", booking, { ...booking, status: "confirmed" });
      notify(`${booking.id} restored.`);
    }
  }

  function taskAction(task, status) {
    if (status === "inspected" && !allowed(role, "inspect")) {
      notify("Only a manager or CEO can inspect a room.");
      return;
    }
    updateList("tasks", (items) =>
      items.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status,
              updatedAt: "Now",
              ...(status === "in_progress"
                ? { startedAt: getTimestamp() }
                : {}),
              ...(status === "done"
                ? { finishedAt: getTimestamp() }
                : {}),
            }
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

  function purchaseAction(order, status) {
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
  function sendMessage(conversationId, text) {
    updateList("conversations", (items) =>
      items.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unread: 0,
              messages: [...conversation.messages, { from: "staff", text }],
            }
          : conversation,
      ),
    );
    notify("Message added to the local demo conversation.");
  }
  function settingsSave(values) {
    if (role !== "ceo") {
      notify("Only the CEO can change property settings.");
      return;
    }
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        checkInTime: values.checkInTime,
        checkOutTime: values.checkOutTime,
        servicePercent: Number(values.servicePercent),
        vatPercent: Number(values.vatPercent),
      },
    }));
    writeAudit("settings", "property", "updated", data.settings, values);
    notify("Property rules updated for future demo quotes.");
  }
  function toggleUser(user) {
    if (role !== "ceo" || user.id === currentUserId) {
      notify("A CEO cannot deactivate the active account from this screen.");
      return;
    }
    updateList("users", (items) => items.map((item) => item.id === user.id ? { ...item, active: !item.active } : item));
    writeAudit("user", user.id, user.active ? "deactivated" : "activated", user, { ...user, active: !user.active });
    notify(`${user.name} ${user.active ? "deactivated" : "activated"}.`);
  }
  function issueInvoice(invoice) {
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
        ...data.units.map((unit) =>
          [
            unit.number,
            roomTypeFor(data, unit.roomTypeId)?.name,
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
          role={role}
          userName={currentUser.name}
          onNavigate={navigate}
          onCreate={requestCreate}
          onBookingAction={bookingAction}
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
          data={data}
          search={search}
          onSearch={setSearch}
          role={role}
          onCreate={requestCreate}
          onBlock={openBlock}
          onUnitStatus={(unit, status) => {
            updateList("units", (items) =>
              items.map((item) =>
                item.id === unit.id ? { ...item, status } : item,
              ),
            );
            writeAudit("unit", unit.id, "status changed", unit, {
              ...unit,
              status,
            });
            notify(`Unit ${unit.number} returned to service.`);
          }}
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
    case "inventory":
      content = (
        <InventoryPage
          data={data}
          role={role}
          search={search}
          onSearch={setSearch}
          onCreate={requestCreate}
          onStock={(type, item) => {
            const permission = type === "stockOut" ? "stock_use" : "stock";
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
            role={role}
            onCreate={requestCreate}
            onExpenseAction={(expense, status) => {
              updateList("expenses", (items) =>
                items.map((item) =>
                  item.id === expense.id ? { ...item, status } : item,
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
      content = <MessagesPage data={data} onSend={sendMessage} onRead={(id) => updateList("conversations", (items) => items.map((item) => item.id === id ? { ...item, unread: 0 } : item))} />;
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
          onRequestAction={(request, status) => {
            updateList("requests", (items) =>
              items.map((item) =>
                item.id === request.id ? { ...item, status } : item,
              ),
            );
            if (status === "done" && request.costKobo) {
              const booking = data.bookings.find((item) => item.guestId === request.guestId && item.unitId === request.unitId && item.status === "checked_in");
              if (booking) {
                const subtotalKobo = (booking.subtotalKobo || booking.totalKobo) + request.costKobo;
                const serviceKobo = Math.round(subtotalKobo * data.settings.servicePercent / 100);
                const vatKobo = Math.round(subtotalKobo * data.settings.vatPercent / 100);
                const totalKobo = subtotalKobo + serviceKobo + vatKobo;
                updateList("bookings", (items) => items.map((item) => item.id === booking.id ? { ...item, subtotalKobo, serviceKobo, vatKobo, totalKobo } : item));
                updateList("invoices", (items) => items.map((invoice) => invoice.bookingId === booking.id ? { ...invoice, totalKobo } : invoice));
                writeAudit("booking", booking.id, "concierge extra added", booking, { ...booking, subtotalKobo, totalKobo, extraKobo: request.costKobo });
                notify(`${formatMoney(request.costKobo)} added to ${booking.id}'s folio.`);
              } else notify("Request completed; no matching in-house booking was found for folio billing.");
            } else {
              writeAudit("concierge", request.id, status, request, { ...request, status });
              notify(`Request ${status}.`);
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
          role={role}
          userName={currentUser.name}
          onNavigate={navigate}
          onCreate={requestCreate}
          onBookingAction={bookingAction}
        />
      );
  }

  if (!signedIn) return <LoginScreen data={data} onLogin={signIn} />;

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
            {visibleNavGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa69f]">
                  {group.label}
                </p>
                {group.items.map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => navigate(key)}
                    className={`mb-0.5 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition ${page === key ? "bg-[#eaf58a] text-[#29320b]" : "text-[#647269] hover:bg-[#f3f7f4] hover:text-[#26342d]"}`}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span className="flex-1">{label}</span>
                    {key === "messages" && unread > 0 && (
                      <span className="grid size-5 place-items-center rounded-full bg-[#d9484f] text-[10px] font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-4 rounded-xl bg-[#e1f3e8] p-4">
            <div className="mb-3 grid size-8 place-items-center rounded-lg bg-white/70 text-[#176b54]">
              <Sparkles size={17} />
            </div>
            <p className="text-sm font-semibold text-[#214832]">
              Guest-ready, every day
            </p>
            <p className="mt-1 text-xs leading-5 text-[#4f7560]">
              Keep arrivals, rooms, and teams moving together.
            </p>
            <button
              onClick={() => navigate("team")}
              className="mt-3 text-xs font-semibold text-[#176b54] hover:underline"
            >
              Property settings <ArrowRight size={12} className="ml-1 inline" />
            </button>
          </div>
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
                  {unread > 0 && (
                    <i className="absolute right-2 top-2 size-2 rounded-full bg-[#d9484f] ring-2 ring-white" />
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-40 w-72 rounded-xl border border-[#e2e9e4] bg-white p-3 shadow-xl">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <strong className="text-sm">Notifications</strong>
                      <button
                        className="text-xs text-[#176b54]"
                        onClick={() => {
                          updateList("conversations", (items) =>
                            items.map((item) => ({ ...item, unread: 0 })),
                          );
                          setNotificationsOpen(false);
                        }}
                      >
                        Mark read
                      </button>
                    </div>
                    {unread ? (
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
                    ) : (
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
                  <label className="flex items-center gap-1 text-[10px] text-[#79867e]">
                    Preview role
                    <select
                      aria-label="Preview role"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      className="max-w-24 cursor-pointer bg-transparent font-medium text-[#176b54] outline-none"
                    >
                      <option value="worker">Worker</option>
                      <option value="manager">Manager</option>
                      <option value="ceo">CEO / Admin</option>
                    </select>
                  </label>
                </div>
              </div>
              <button onClick={signOut} className="grid size-10 place-items-center rounded-lg border border-[#e6ece8] text-[#647269] hover:bg-[#f7f9f7]" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
            </div>
          </header>
          {!isOnline && <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 sm:px-6 lg:px-8"><CircleAlert size={15} />You’re offline. This demo keeps changes on this device; production sync is not connected.</div>}
          {mobileNavOpen && (
            <nav className="flex gap-1 overflow-x-auto border-b border-[#e4ebe6] bg-white px-3 py-2 lg:hidden">
              {visibleNavGroups
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
      {modal?.type === "booking" ? (
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
