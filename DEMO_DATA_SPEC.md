# Fresh Eggs Operations — Demo Data Spec

> This is the exact scenario dataset to seed into staging. It is designed to make the system understandable during a product demo.

---

## 1. Demo Credentials

### Staff

- Admin
  - email: `chioma@fresheggs.com`
  - password: `admin12345`

- Manager
  - email: `manager@fresheggs.com`
  - password: `manager12345`

- Record keeper
  - email: `records@demo.fresheggs.local`
  - password: `staff12345`

- Shop floor
  - email: `shopfloor@demo.fresheggs.local`
  - password: `staff12345`

### Portal customers

All portal demo customers use:

- password: `demo12345`

Portal-ready customers:

- `Amina Stores` — `0809000001`
- `Kola Provision Mart` — `0809000002`
- `Blessing Retail Hub` — `0809000004`
- `Mama Tunde Foods` — `0809000005`

---

## 2. Customer List

1. `Amina Stores`
   - phone: `0809000001`
   - email: `amina@demo.fresheggs.local`
   - story: first-time style portal booking at 80%, waiting for batch arrival

2. `Kola Provision Mart`
   - phone: `0809000002`
   - email: `kola@demo.fresheggs.local`
   - story: fully paid booking, batch already arrived

3. `Ngozi Kitchen`
   - phone: `0809000003`
   - email: `ngozi@demo.fresheggs.local`
   - story: booking already picked up and converted to sale

4. `Blessing Retail Hub`
   - phone: `0809000004`
   - email: `blessing@demo.fresheggs.local`
   - story: open buy-now request and cracked cash sale history

5. `Mama Tunde Foods`
   - phone: `0809000005`
   - email: `mama.tunde@demo.fresheggs.local`
   - story: fulfilled buy-now request with POS sale

6. `Emeka Wholesales`
   - phone: `0809000006`
   - story: one bulk booking payment split across two open batches

7. `City Fresh Traders`
   - phone: `0809000007`
   - story: multi-batch direct sale and older cash history

8. `Grace Supermarket`
   - phone: `0809000008`
   - story: fully paid open-batch booking and older transfer sale

9. `Chinedu Bakery`
   - phone: `0809000009`
   - story: portal-style booking on a second open batch plus small cash sale history

10. `Halima Catering`
    - phone: `0809000010`
    - story: historical direct transfer sale only

---

## 3. Catalog Items

- `FE4300`
- `FE4500`
- `FE4600`
- `FE4800`
- `FE5200`

All should be active `FE_EGGS` items.

---

## 4. Batches

### Batch `18APR2026`

- status: `OPEN`
- egg type: `Regular Size Eggs`
- expected quantity: `150`
- available for booking: `120`
- wholesale: `5400`
- retail: `5500`
- FE rows:
  - `FE4600` → `90` crates
  - `FE4800` → `60` crates

### Batch `22APR2026`

- status: `OPEN`
- egg type: `Small Size Eggs`
- expected quantity: `80`
- available for booking: `65`
- wholesale: `4800`
- retail: `4900`
- FE rows:
  - `FE4300` → `50` crates
  - `FE4500` → `30` crates

### Batch `03APR2026`

- status: `RECEIVED`
- egg type: `Regular Size Eggs`
- expected quantity: `130`
- available for booking: `90`
- actual quantity: `133`
- free crates: `3`
- wholesale: `5400`
- retail: `5500`
- FE rows:
  - `FE4600` → `70` paid + `2` free
  - `FE4800` → `60` paid + `1` free

### Batch `01APR2026`

- status: `RECEIVED`
- egg type: `Small Size Eggs`
- expected quantity: `95`
- available for booking: `60`
- actual quantity: `98`
- free crates: `3`
- wholesale: `4800`
- retail: `4900`
- FE rows:
  - `FE4300` → `55` paid + `2` free
  - `FE4500` → `40` paid + `1` free

### Batch `20MAR2026`

- status: `CLOSED`
- egg type: `Regular Size Eggs`
- expected quantity: `110`
- available for booking: `90`
- actual quantity: `113`
- free crates: `3`
- wholesale: `5400`
- retail: `5500`
- FE rows:
  - `FE4600` → `70` paid + `1` free
  - `FE5200` → `40` paid + `2` free

---

## 5. Bookings

### Open-batch bookings

1. `Amina Stores`
   - batch: `18APR2026`
   - quantity: `20`
   - order value: `108000`
   - amount paid: `86400`
   - status: `CONFIRMED`
   - note: waiting for batch arrival

2. `Emeka Wholesales`
   - batch: `18APR2026`
   - quantity: `40`
   - order value: `216000`
   - amount paid: `180000`
   - status: `CONFIRMED`

3. `Grace Supermarket`
   - batch: `18APR2026`
   - quantity: `25`
   - order value: `135000`
   - amount paid: `135000`
   - status: `CONFIRMED`

4. `Emeka Wholesales`
   - batch: `22APR2026`
   - quantity: `30`
   - order value: `144000`
   - amount paid: `140000`
   - status: `CONFIRMED`

5. `Chinedu Bakery`
   - batch: `22APR2026`
   - quantity: `20`
   - order value: `96000`
   - amount paid: `76800`
   - status: `CONFIRMED`

### Arrived / historical bookings

6. `Kola Provision Mart`
   - batch: `03APR2026`
   - quantity: `40`
   - order value: `216000`
   - amount paid: `216000`
   - status: `CONFIRMED`
   - batch has arrived but order not yet picked up

7. `Ngozi Kitchen`
   - batch: `03APR2026`
   - quantity: `30`
   - order value: `162000`
   - amount paid: `162000`
   - status: `PICKED_UP`
   - linked to receipt sale

---

## 6. Customer Booking Allocations

### Single-payment bookings

- Amina booking ← one booking transfer of `86400`
- Kola booking ← one booking transfer of `216000`
- Ngozi booking ← one booking transfer of `162000`
- Grace booking ← one booking transfer of `135000`
- Chinedu booking ← one booking transfer of `76800`

### Split bulk booking payment

`Emeka Wholesales` pays one transfer of `320000`

Split:

- `180000` to `18APR2026`
- `140000` to `22APR2026`

This is the main allocation demo story.

---

## 7. Buy-Now Requests

1. `Blessing Retail Hub`
   - batch: `03APR2026`
   - quantity: `15`
   - price type: `RETAIL`
   - status: `OPEN`

2. `Mama Tunde Foods`
   - batch: `01APR2026`
   - quantity: `18`
   - price type: `RETAIL`
   - status: `FULFILLED`

3. optional if needed:
   - one more open request can be added later, but the first two are enough for demo

---

## 8. Sales

### Historical closed-batch sales

1. `Grace Supermarket`
   - receipt: `FE-20260323-1001`
   - batch: `20MAR2026`
   - payment: `TRANSFER`
   - quantity: `35`
   - total: `189000`

2. `City Fresh Traders`
   - receipt: `FE-20260325-1002`
   - batch: `20MAR2026`
   - payment: `CASH`
   - quantity: `28`
   - total: `154000`

3. `Halima Catering`
   - receipt: `FE-20260327-1003`
   - batch: `20MAR2026`
   - payment: `TRANSFER`
   - quantity: `40`
   - total: `216000`

### Current-period sales

4. `Ngozi Kitchen`
   - receipt: `FE-20260405-1004`
   - source: booking pickup
   - batch: `03APR2026`
   - payment: `PRE_ORDER`
   - quantity: `30`
   - total: `162000`

5. `Mama Tunde Foods`
   - receipt: `FE-20260406-1005`
   - batch: `01APR2026`
   - payment: `POS_CARD`
   - quantity: `18`
   - total: `88200`

6. `Chinedu Bakery`
   - receipt: `FE-20260406-1006`
   - batch: `03APR2026`
   - payment: `CASH`
   - quantity: `8`
   - total: `44000`

7. `City Fresh Traders`
   - receipt: `FE-20260407-1007`
   - source: multi-batch direct sale
   - batches: `03APR2026` + `20MAR2026`
   - payment: `TRANSFER`
   - quantity: `30`
   - total: `162000`

8. `Blessing Retail Hub`
   - receipt: `FE-20260407-1008`
   - batch: `01APR2026`
   - payment: `CASH`
   - quantity: `12`
   - sale type: `CRACKED`
   - total: `50400`

---

## 9. Banking

### Customer-booking inflows

- Amina → `86400`
- Kola → `216000`
- Ngozi → `162000`
- Emeka → `320000`
- Grace → `135000`
- Chinedu → `76800`

### Unresolved booking queue example

- one `CUSTOMER_BOOKING` inflow of `96000`
- not linked yet
- should appear in Banking > Customer bookings as work to do

### Other income and expense examples

- unallocated inflow → `50000`
- unallocated inflow → `75000`
- bank charges → `1250`
- POS settlement → `88200`
- direct sale transfer totals linked to transfer sales
- cash sale transactions linked to cash sales

### Internal transfers

- cash to customer deposit → `200000`
- customer deposit to sales account → `250000`
- sales account to profit account → `150000`

---

## 10. Statement Import

One statement import:

- filename: `providus-demo-week1.csv`
- account: `Customer Deposit Account`
- status: `PARTIALLY_POSTED`

Lines:

1. pending inflow → `16200`
2. ready inflow → `30000`
3. duplicate inflow → `44000`
4. skipped outflow → `2500`
5. posted inflow → `216000` (`Kola`)
6. posted inflow → `320000` (`Emeka`)
7. ready outflow → `1000`
8. pending inflow → `5000`

This should make the import review screen useful immediately.

---

## 11. Inventory Counts

### Batch `03APR2026`

- count date: `2026-04-07`
- physical count: `70`
- system count: `71`
- discrepancy: `-1`
- cracked write-off: `4`

### Batch `01APR2026`

- count date: `2026-04-07`
- physical count: `30`
- system count: `40`
- discrepancy: `-10`
- cracked write-off: `28`

### Batch `20MAR2026`

- count date: `2026-03-29`
- physical count: `12`
- system count: `12`
- discrepancy: `0`
- cracked write-off: `2`

This makes the crack and policy reports visible without overloading the system.

---

## 12. What The Demo Should Show Instantly

When loaded into staging, a reviewer should quickly be able to see:

- one portal customer waiting for batch arrival
- one portal customer whose batch has arrived
- one open buy-now request
- one fulfilled buy-now request
- one payment split across two bookings
- one multi-batch direct sale
- one cash workflow
- one POS workflow
- one batch above target
- one batch below target because of crack pressure
