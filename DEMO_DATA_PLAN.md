# Fresh Eggs Operations — Demo Data Plan

> Purpose: define a small, realistic, scenario-driven dataset for staging and demos. This dataset should help someone understand how the business works in the app within a few minutes.

---

## 1. Demo Data Principles

This demo data should:

- feel like a real week or two of business activity
- cover the most important workflows without clutter
- make reports worth opening
- show both stock flow and money flow clearly
- support both internal demos and customer-portal demos

This demo data should not:

- be huge
- contain random records with no story
- overwhelm tables
- hide the important workflows in noise

Target philosophy:

- fewer records
- richer stories
- enough history to show status changes

---

## 2. Demo Dataset Shape

Recommended size:

- users: 4 to 5
- customers: 10 to 12
- items: 4 to 6
- batches: 4
- bookings: 7 to 9
- buy-now requests: 3 to 4
- sales: 8 to 10
- bank transactions: 18 to 25
- bank statement imports: 1 import with mixed review states
- receipts: generated naturally from sales

This is enough to make:

- Dashboard meaningful
- Banking believable
- Batch screens useful
- Portal order history convincing
- Reports populated without looking fake

---

## 3. Core Business Stories

The demo data should revolve around named scenarios instead of anonymous rows.

### Story 1 — First-time booking at minimum payment

Customer:

- `Amina Stores`
- phone-first customer
- no prior booking history

Scenario:

- books `20` crates from an open batch
- pays exactly `80%`
- still has a remaining balance
- batch has not arrived yet

What this demonstrates:

- first-time rule
- phone-first customer identity
- booking order value
- payment remaining
- portal order-status visibility

### Story 2 — Repeat customer, fully paid, batch arrived

Customer:

- `Kola Provision Mart`

Scenario:

- has an upcoming booking that was fully paid
- booked on an open batch
- batch later moved to received
- booking still waiting to be picked up

What this demonstrates:

- batch arrival signal in portal
- fully paid booking
- operations team can see it is ready for fulfillment

### Story 3 — Booking converted to sale

Customer:

- `Ngozi Kitchen`

Scenario:

- booked in advance
- batch arrived
- order was picked up and recorded as a sale

What this demonstrates:

- booking lifecycle
- picked-up status
- sale linked to booking
- receipt and report visibility

### Story 4 — Same-day buy-now request

Customer:

- `Blessing Retail Hub`

Scenario:

- places a buy-now request on a received batch
- request is still open

What this demonstrates:

- customer portal buy-now flow
- request history
- staff-facing same-day demand

### Story 5 — Buy-now request fulfilled

Customer:

- `Mama Tunde Foods`

Scenario:

- had a buy-now request
- request is now fulfilled
- linked sale exists

What this demonstrates:

- request lifecycle
- visible order history
- completed same-day order path

### Story 6 — One banking deposit split across two batches

Customer:

- `Emeka Wholesales`

Scenario:

- pays one large transfer
- staff links it to the customer from Banking > Customer bookings
- amount is split across two open batches
- each row shows crates, payment value, and percentage funded

What this demonstrates:

- banking-first operations
- booking allocation flow
- one payment to many bookings

### Story 7 — Multi-batch direct sale

Customer:

- `City Fresh Traders`

Scenario:

- one direct sale pulls stock from two received batches

What this demonstrates:

- multi-batch fulfillment
- stock reduction by sale
- stronger batch and sales reporting

### Story 8 — Cash handling and transfer to deposit account

Scenario:

- direct cash sale lands in `Cash Account`
- later internal transfer moves that amount from `Cash Account` to `Customer Deposit Account`

What this demonstrates:

- cash workflow
- money trail
- internal transfer handling

### Story 9 — POS settlement and charges

Scenario:

- one POS/card sale exists
- one POS settlement line exists
- one bank charge exists

What this demonstrates:

- payment-type reporting
- expense tracking
- investor-style operational realism

### Story 10 — Crack loss affecting profitability

Scenario:

- one received batch has meaningful cracked write-off
- mildly cracked sales exist at discount
- one batch performs below policy target because of losses

What this demonstrates:

- inventory control
- crack allowance thinking
- policy target reporting

---

## 4. Items To Seed

Customer-facing egg types:

- `Regular Size Eggs` — active
- `Small Size Eggs` — active
- `Large Eggs` — inactive by default

Catalog items:

- `FE4600`
- `FE4800`
- `FE5200`
- `FE4300`
- optional support items if needed later:
  - `Delivery Fee`
  - `Plastic Crates`

Important modeling rule:

- FE codes are source/cost items
- batches have one customer-facing egg type
- a batch can have multiple FE source rows with different costs
- selling price stays at the batch shell for that egg type

---

## 5. Batches To Seed

Recommended four batches:

### Batch A — Open regular batch

- name like `18APR2026`
- egg type: `Regular Size Eggs`
- open
- two FE source rows:
  - `FE4600`
  - `FE4800`
- has active bookings
- not yet received

### Batch B — Received regular batch

- name like `10APR2026`
- egg type: `Regular Size Eggs`
- received
- partly sold
- partly booked
- some same-day availability left

### Batch C — Received small batch with crack pressure

- name like `07APR2026`
- egg type: `Small Size Eggs`
- received
- cracked write-off exists
- some discounted cracked sales
- below target profitability

### Batch D — Closed historical batch

- name like `29MAR2026`
- egg type: `Regular Size Eggs`
- closed
- fully sold
- above target profitability

This mix supports:

- portal booking
- portal buy-now
- batch reporting
- inventory
- executive summary

---

## 6. Banking To Seed

Bank accounts already exist and should be reused:

- `Customer Deposit Account`
- `Sales Account`
- `Profit Account`
- `Cash Account`

Recommended banking records:

- 4 to 6 customer booking inflows
- 2 unallocated inflows
- 1 transfer from cash to deposit account
- 1 POS settlement
- 1 bank charge
- 1 owner transfer or admin expense if useful for realism

Statement import:

- use one demo statement import only
- it should contain:
  - pending lines
  - ready lines
  - duplicate lines
  - skipped lines
  - posted lines

Important rule:

- no transaction line should be deleted
- removed import queue behavior should be demonstrated at the import-file level only if needed

---

## 7. Customers To Seed

Recommended customer mix:

- `Amina Stores`
- `Kola Provision Mart`
- `Ngozi Kitchen`
- `Blessing Retail Hub`
- `Mama Tunde Foods`
- `Emeka Wholesales`
- `City Fresh Traders`
- `Grace Supermarket`
- `Chinedu Bakery`
- `Halima Catering`

Data rules:

- every customer must have a phone number
- only some customers need an email
- names should feel like real business customers
- not all customers need activity

Distribution:

- 3 portal-active customers
- 4 backend-only customers
- 2 customers with no current order but banking history
- 1 customer with old completed history only

---

## 8. Portal Visibility Goals

The portal demo should allow a reviewer to sign in as at least two believable customers:

### Portal Customer A

- has one upcoming booking
- not fully paid
- batch not yet arrived

### Portal Customer B

- has one fully paid booking
- batch has arrived
- has one past buy-now request

This will make the portal feel alive immediately.

---

## 9. Reporting Goals

The demo data should make these reports visually useful:

- Sales Summary
- Sales by Item
- Sales by Category
- Sales by Payment Type
- Sales by Employee
- Receipts
- Executive Summary
- Batch Summary
- Inventory Control

To achieve that, the dataset should include:

- multiple payment methods
- multiple customer-facing egg types
- at least one above-target batch
- at least one below-target batch
- both bookings and direct sales
- both cash and transfer stories

---

## 10. Demo Seed Strategy

Recommended implementation approach:

1. Keep `api/prisma/seed.js` minimal for core system setup.
2. Add a separate staging-only demo script, for example:
   - `api/prisma/seed.demo.js`
3. Make the demo script scenario-driven and mostly idempotent.
4. Gate it so it is never used on production accidentally.
5. Prefer reset-and-seed for staging demo refreshes instead of trying to perfectly merge old demo rows.

Recommended commands later:

```bash
node prisma/seed.js
node prisma/seed.demo.js
```

Or for staging reset flow:

```bash
npx prisma db push --force-reset
node prisma/seed.js
node prisma/seed.demo.js
```

Production must never run the demo script.

---

## 11. Recommended Next Step

Next, Codex should create:

- a concrete `DEMO_DATA_SPEC.md` or `seed.demo.js` plan input
- exact values for:
  - users
  - customers
  - batches
  - bookings
  - sales
  - bank transactions
  - portal requests

That second step should turn this strategy into a directly implementable dataset.
