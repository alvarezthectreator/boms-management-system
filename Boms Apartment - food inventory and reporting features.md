# Boms Apartment: Food, Beverage, and Weekly Reporting Requirements

## Purpose

Add a connected food and beverage workflow so staff can maintain a menu, record guest orders, track ingredient and drink stock, and review a complete weekly operating report. Managers and CEOs/Admins can view reports and export them. The report must distinguish sales, payments, costs, and stock value; these figures are related but are not interchangeable.

## 1. Roles and access

| Action | Worker | Manager | CEO/Admin |
| --- | --- | --- | --- |
| View available menu and enter an order | Yes | Yes | Yes |
| Update an order through kitchen status | Yes | Yes | Yes |
| Create or edit menu items and recipe ingredients | No | Yes | Yes |
| Receive stock, record usage, wastage, or adjustments | Limited to assigned usage | Yes | Yes |
| Approve purchases and inventory adjustments | No | Yes | Yes |
| View daily and weekly sales summaries | No | Yes | Yes |
| View full financial, stock-cost, and audit reports | No | Yes | Yes |
| Export full reports | No | Yes | Yes |

All manager and CEO changes to menu prices, recipes, purchase receipts, stock counts, wastage, discounts, refunds, and report exports must record the user, timestamp, action, reason where required, and before/after values in the audit log.

## 2. Food menu and recipes

Each menu item should store:

- Stable ID, item name, category, description, selling price, active/unavailable status, and optional photo.
- Preparation time and whether it can be ordered by itself or only as an option/add-on.
- Recipe ingredients, quantity per serving, measurement unit, and optional preparation loss allowance.
- Tax/service treatment and whether the listed price includes tax, using the property's configured financial rules.

Managers and CEOs/Admins can create, edit, activate, or temporarily mark an item unavailable. Price and recipe changes apply to new orders only. Existing orders retain a snapshot of item name, price, tax, and recipe quantities at order time so historical reports do not change when the menu is edited.

The menu must not offer an item when any required ingredient is unavailable or below the quantity needed for an order. If ingredients are not configured for a menu item, show a clear warning and require a manager to confirm that stock is not tracked for that item.

## 3. Food and drink orders

An order should include an order number, date/time, guest, room, source, line items, quantities, unit prices, discount/fees/tax, total, payment or room-charge method, current status, and the staff member who created it.

Order statuses:

1. `New`
2. `Accepted`
3. `Preparing`
4. `Ready`
5. `Served`
6. `Cancelled`

Staff can add menu items and drinks, change quantities, and add guest notes such as allergies. The system should validate available stock again when an order is accepted, since multiple staff may be ordering at once.

### Posting and stock rules

- Create a food/drink sales record when the order is accepted, with a snapshot of the ordered items and prices.
- Deduct recipe ingredients and packaged/bottled drinks atomically when the order is accepted. One accepted order must cause exactly one stock deduction, even if a request is retried.
- If an order is cancelled before preparation, reverse its sales posting and restore its reserved stock once, with an audit entry.
- If an order is cancelled after preparation starts, do not silently restore ingredients. Record consumed/wasted quantities and require a reason; a manager must approve the stock adjustment.
- If an order is changed after acceptance, record the change and apply only the difference in quantity and value.
- Record whether payment is collected directly or charged to the guest's room folio. Room charges must link to the active booking and appear on its bill; they must not be counted again as cash received until payment is collected.
- A refund is a separate financial transaction linked to the original order/payment. Do not erase the original sale.

## 4. Beverage inventory

Track bottled/canned products and bar supplies as inventory items. Each item stores its name, category, stock unit, quantity on hand, minimum quantity, unit cost, supplier, optional SKU/barcode, and active status.

Required movements:

- Receive stock against a purchase order or delivery.
- Deduct stock when a drink order is accepted.
- Record breakage, spoilage, complimentary service, staff use, and count corrections as separate, reasoned movements.
- Require manager approval for adjustments above a configurable quantity or value threshold.
- Show low-stock alerts at or below the item's minimum level.
- Calculate current stock value from quantity on hand multiplied by recorded unit cost; preserve historical movement costs.

Ingredients for prepared food use the same stock-movement ledger as drinks. A recipe can consume multiple ingredients in one atomic transaction.

## 5. Purchases and suppliers

Managers and CEOs/Admins can create purchase orders with supplier, item lines, ordered quantity, unit cost, expected delivery date, and approval status. Receiving stock records the actual accepted quantity and cost, updates inventory, and creates the corresponding expense/payable record. Partial deliveries must remain open for the unreceived quantity. A purchase order must never increase stock until it is received.

## 6. Weekly accounts and operational report

Managers and CEOs/Admins can select a start/end date or a calendar week. Default to the previous completed week, displayed in the property's `Africa/Lagos` timezone. The report must show the selected date range and generation time and allow filtering by room, order source, payment method, menu category, and order status.

### Room activity and revenue

- Rooms occupied/booked, room-nights sold, arrivals, departures, cancellations, no-shows, and occupancy.
- Room charges posted, room payments collected, outstanding folio balance, refunds, and discounts, shown separately.
- Average daily rate (ADR) and revenue per available room (RevPAR), with their calculation definitions.

### Food and beverage sales

- Number of food orders and drink orders, items/quantities sold, gross sales, discounts, taxes/service charges, refunds, and net sales.
- Sales by menu item, food/drink category, day, order source, payment method, and room-charge versus direct-payment method.
- Orders cancelled, complimentary items, voids, and refunds shown separately with reasons and authorizing manager.

### Inventory and purchasing

- Opening quantity/value, received purchases, sales-related consumption, staff use, wastage/breakage, adjustments, closing quantity/value, and low-stock items.
- Ingredient usage based on accepted orders and recipe snapshots.
- Purchases/expenses for the period, supplier totals, and received versus outstanding purchase orders.
- Expected food/beverage cost and gross margin by item/category where item cost is configured. Clearly flag missing cost or recipe data; do not treat sales revenue as profit.

### Reconciliation

- Separate sales earned, payments received, room-folio charges, receivables, refunds, expenses/purchases, and inventory value.
- Include a reconciliation summary by payment method and identify unmatched, pending, or unpaid transactions.
- Use one reporting timezone and consistent inclusive start/exclusive end boundaries to avoid transactions appearing in two weekly reports.

## 7. Export and print

Managers and CEOs/Admins can export the selected report as CSV and print a formatted report. If PDF/XLSX export is added, keep the same filters and totals. Exports must include the date range, timezone, generated-by user, generated time, currency, and the component tables behind the summary totals. Protect guest personal data according to the user's role and only include it where operationally necessary.

## 8. Data and reliability requirements

- Store orders, order lines, menu/recipe snapshots, payments, refunds, suppliers, purchase orders, and stock movements in SQLite with property ID, timestamps, and actor IDs.
- Use integer minor currency units for money and explicit measurement units for quantities.
- Use database transactions for accepting an order, deducting multiple ingredients, updating a room folio, and recording a refund or cancellation reversal.
- Add uniqueness/idempotency protection so repeated requests cannot post the same sale or stock movement twice.
- Never delete posted financial or stock history; use reversals/voids with a reason and audit trail.
- Preserve existing room, reservation, inventory, payment, and expense records when schema changes are applied.

## 9. Acceptance checks

1. A manager creates a menu item with recipe quantities and price; it appears in the order screen.
2. A guest order is accepted only when every tracked ingredient/drink has sufficient stock.
3. Accepting an order deducts each recipe ingredient and drink exactly once and records the sale once.
4. A direct payment and a room-folio charge produce different accounting entries and are not double-counted as cash received.
5. Cancelling before preparation reverses stock and sales once; cancelling after preparation records waste without restoring stock silently.
6. Receiving a partial purchase updates only the quantity actually received and leaves the remainder open.
7. The weekly report reconciles room revenue, food/drink sales, payments, folio balances, refunds, expenses, and stock movements for the same Lagos-time period.
8. Managers and CEOs/Admins can view and export the report; workers cannot access full financial or cost reports.
9. Every sensitive edit, adjustment, approval, cancellation, and refund has an attributable audit entry.

## 10. Suggested implementation order

1. Define database tables and migration tests for menu, recipes, orders, order lines, and stock movements.
2. Build menu and inventory management with role checks and audit logging.
3. Implement atomic order acceptance, ingredient/drink deductions, room charges, cancellations, and refunds.
4. Add purchase receiving and low-stock alerts.
5. Build the weekly report and validate each total against source transactions.
6. Add CSV/print export and complete role, audit, concurrency, and reconciliation tests.