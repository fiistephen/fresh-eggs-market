# Fresh Eggs Operations V2 Implementation Spec

## Purpose

This document defines Version 2 of the Fresh Eggs Operations app based on:

- the original build brief in `Fresh Eggs Operations App Meeting Transcript.md`
- the review and correction meeting in `Fresh Eggs Operations App Meeting  Transcript 2.md`
- the current V1 build decisions in `claude.md`
- the current shipped app and database structure
- the supporting operational artifacts added locally:
  - Providus bank statement sample
  - Medusa report sample
  - report screenshots
  - Sage bulk-entry screenshot
  - investor metrics screenshot

V2 is not a cosmetic refresh. It is a workflow correction and scale-up release.

## Guiding Product Decisions

1. This app fully replaces Loyverse.
2. UI does not need to copy Sage or Loyverse visually.
3. UX should improve on the reference tools while preserving the business meaning of their workflows and reports.
4. Banking is the source of truth for money.
5. A booking must be funded from recorded money, not typed freehand.
6. A sale is only valid when eggs are delivered and money is provably in the system.
7. Reporting is a first-class module, not a dashboard afterthought.
8. The app must support internal operations first, then customer portal expansion.

## V1 Review Summary

### What V1 got right

- Core modules exist: batches, bookings, sales, banking, inventory, customers, alerts, portal.
- Batch lifecycle exists and largely reflects meeting 1.
- Inventory already separates on-hand, booked, and available.
- Alerts and dashboard provide an operational overview.
- The project already follows the main business language of the company.

### Where V1 is now misaligned with the reviewed workflow

- Booking still allows typed `amountPaid` instead of allocation from banking records.
- Banking is single-entry oriented, not bulk-entry/import/review oriented.
- Sales still treat payment method as a label instead of a money trail.
- Sales are too tied to a single batch at the header level.
- There is no dedicated Reports section.
- POS reconciliation is not modeled deeply enough.
- Admin/configuration surfaces are still too thin for new items, categories, and bank structures.
- Portal is incomplete relative to the reviewed product direction.

## Product Goals For V2

1. Make banking the operational starting point for the day.
2. Prevent fraud-prone free typing of received money in downstream modules.
3. Support partial and split allocations between payments and bookings.
4. Track sales with proof of money for transfer, POS, and cash.
5. Support multi-batch fulfillment in a single sale.
6. Produce decision-grade reports for operations, reconciliation, staff commission, and investors.
7. Improve speed and clarity for staff data entry.
8. Preserve auditability for overrides and exceptional cases.

## UX Principles For V2

1. Prioritize clarity over imitation.
2. Optimize for frequent staff tasks, especially banking and sales entry.
3. Use strong defaults, auto-fill, and guided flows.
4. Prefer review queues and staged confirmation over long freeform forms.
5. Keep high-volume work in table/workspace layouts, not repeated modal loops.
6. Surface exceptions inline and early.
7. Make reports readable, exportable, filterable, and drillable.
8. Use a calmer, more modern visual language than the reference tools.

## Core Workflow Redesign

## 1. Banking First

The record keeper starts in Banking each day.

Primary daily flow:

1. Import or enter bank statement lines.
2. Review imported lines.
3. Categorize each line.
4. Move uncategorized items into unallocated income or unallocated expense.
5. Reconcile the account balance against the statement.
6. Make deposits available for booking allocation.
7. Review POS settlement and fees from Medusa.

### Required banking capabilities

- Bulk transaction entry screen with many editable rows on one page.
- Separate columns for money in and money out.
- Add-row and remove-row controls.
- CSV import for Providus statements.
- Imported lines must initially be reviewable before final posting.
- Imported inflows/outflows must support temporary unallocated states.
- Per-account reconciliation state:
  - statement closing balance
  - system balance
  - variance
  - reconciliation status
  - last reconciled at
  - last reconciled by
- Account-level warnings when reconciliation is stale or out of balance.

### Bank accounts in V2

Current model:

- Customer Deposit
- Sales
- Profit

V2 required addition:

- Cash

### Cash account purpose

Cash is not a real bank account, but it must behave like one operationally.

Use cases:

- walk-in cash sale recorded into Cash immediately
- cash on hand can be seen at any time
- later movement from Cash to Customer Deposit or another real bank account is recorded as a transfer
- end-of-day controls can verify whether cash sales were banked

Recommended account naming:

- `Customer Deposit`
- `Sales`
- `Profit`
- `Cash on Hand`

## 2. Deposits And Allocation

V2 needs a new allocation layer between money received and bookings.

### Business rules

- one payment can fund multiple bookings
- one booking can be funded by multiple payments
- payment can remain partially unallocated
- booking can remain partially funded until fully paid
- customer deposit can sit idle until customer specifies use

### Booking creation should work like this

1. Choose customer.
2. Choose batch.
3. Enter quantity.
4. System calculates expected order value using batch wholesale price.
5. Staff picks one or more available deposits for that customer.
6. Staff enters how much of each deposit is allocated.
7. System validates minimum funding requirement.
8. Booking is created with expected amount, funded amount, pending amount, and allocation references.

### Important controls

- no free typing of received payment as booking truth
- booking status derived from allocation state and fulfillment state
- visible unallocated balance per payment
- visible outstanding balance per booking

## 3. Sales And Fulfillment

V2 sales should follow the real operational question:

"Have we given out eggs, and can we prove the money is in the system?"

### Sales flow

1. Pick customer.
2. Show pending bookings first.
3. If a booking is selected, pre-fill fulfillment data.
4. If no booking is selected, allow direct sale.
5. Require payment evidence route:
   - pre-order allocation
   - transfer-backed payment
   - POS-backed payment
   - cash recorded to Cash account
6. Complete the sale and generate receipt.

### Required V2 behaviors

- transfer sale should link to a recorded bank transaction or approved allocation path
- POS sale should be reconcilable against Medusa and bank settlement
- cash sale should hit Cash on Hand first
- receipts should be searchable, filterable, and printable
- booking fulfillment should show funded amount, pending top-up if any, and pickup completion

## 4. Multi-Batch Sales

Meeting 2 clarified that one sale can draw from multiple batches.

### Impact

Current V1 sale header is too batch-centric.

V2 should:

- allow a single receipt to include line items sourced from different batches
- keep batch source at line or allocation level
- preserve batch profitability and inventory accuracy
- support FIFO-friendly allocation behavior where practical

## 5. Inventory And Cracks

Inventory should continue to move only when:

- a sale is recorded
- a write-off is recorded

Bookings should reserve availability, not reduce physical inventory.

### Crack handling requirements

- cracks tracked in crate terms
- distinguish mildly cracked sold items from totally damaged write-offs
- allow recording crack write-offs during counts/operations
- add configurable crack allowance threshold
- flag batches red when threshold is exceeded

## 6. Batch Analysis And Policy Performance

Batch analysis should become a management report, not just a closure summary.

### Company policy benchmark

- target profit: approximately NGN 500 per crate

Examples:

- 1,500 crates -> expected profit NGN 750,000
- 1,800 crates -> expected profit NGN 900,000

### Batch analysis must show

- cost breakdown by egg code / FE code
- received quantities including free/crack adjustment crates
- sales breakdown by sale type
- cracked sold quantities and values
- total damaged write-offs
- total revenue
- total cost
- actual gross profit
- expected policy profit
- variance to policy
- notes / reasons where relevant

### Monthly batch summary must show

- total batches in period
- above-target count
- below-target count
- per-batch profit
- total monthly profit
- monthly variance to policy target

## Reporting Module

V2 requires a dedicated Reports section in the application navigation.

Reports should be filterable by period and exportable.

## Required report set

### Sales reports

1. Sales summary
- gross sales
- refunds
- discounts if any
- net sales
- cost of goods
- gross profit
- daily breakdown table
- trend graph optional, not mandatory for first version

2. Sales by item
- item
- category
- quantity sold
- net sales
- cost of goods
- gross profit
- drilldown by retail / wholesale / cracked where relevant

3. Sales by category
- eggs
- crates
- delivery
- nylon legacy category if historical data exists

4. Sales by payment type
- cash
- pre-order transfer
- direct transfer
- Providus POS / card
- refunds
- net amount

5. Receipts log
- receipt number
- date/time
- employee
- customer
- receipt type
- total
- detail view

6. Sales by employee
- useful if the business wants it operationally, but lower priority than sales by item and payment type

### Banking reports

1. Reconciliation by account
2. Customer deposits not yet allocated
3. Customer liability / money held for undelivered eggs
4. Expenses by category
5. POS fee report
6. Transfers between accounts
7. Refunds report
8. Unallocated income / unallocated expense queues

### Batch and inventory reports

1. Batch analysis
2. Monthly batch summary vs policy target
3. Monthly crates sold
4. Crack/write-off summary
5. Inventory position by batch
6. Reserved vs free inventory

### Investor and strategic reports

1. Since-inception gross sales
2. Since-inception gross profit
3. Eggs sold and crates sold
4. Sales transaction count
5. Customer count
6. Repeat customer indicators
7. Monthly momentum metrics suitable for grants and pitch decks

## Item, Catalog, And Configuration Model

V2 should introduce a clearer admin-managed catalog.

### Rules

- FE codes behave like items/products
- if a new FE price appears, it becomes a new FE item when necessary
- old items should be retired or made unavailable, not deleted from history
- categories must be admin-managed

### Minimum categories

- Eggs
- Crates
- Delivery
- Nylon (legacy / historical only if needed)

### Admin configuration should support

- create / retire bank accounts
- create / retire items
- create / retire categories
- create inflow / outflow categories
- configure crack allowance threshold
- configure policy profit benchmark

## Customer Rules And Overrides

### Portal-facing rules

- first-time customer max 20 crates
- max 100 crates per booking
- minimum 80 percent funding for booking

### Backend override rules

- authorized staff may override first-time limit for legitimate large first-time buyers
- override requires note/reason
- override should be audit logged
- likely manager/admin only

## Portal V2 Direction

Portal should support two distinct paths:

1. Buy eggs now
- immediate smaller purchase
- likely direct sale style flow

2. Book upcoming batch
- reserve against open batch
- follow deposit and allocation rules

Internal operations still take priority. Portal should not force backend compromises.

## Data Model Changes Required

The current schema is a good V1 base but needs structural upgrades.

## High-priority schema changes

### Banking

1. Extend bank account model to support Cash on Hand.
2. Add bank statement import models, for example:
- `BankStatementImport`
- `BankStatementLine`
3. Add reconciliation model, for example:
- `BankReconciliation`
4. Add richer transaction status / source metadata:
- manual entry
- imported
- imported-reviewed
- reconciled
- unallocated

### Allocation

Add a many-to-many allocation model, for example:
- `PaymentAllocation`

Suggested responsibilities:
- links bank transaction to booking
- stores allocated amount
- stores allocation date
- stores allocated by
- supports partial allocation

### Booking

Booking should keep:
- customer
- batch
- quantity
- expected order value
- channel
- status
- override metadata if used

Booking paid amount should be derived from allocations, with optional cached totals for performance.

### Sales

Sales should no longer rely on a single sale-level batch source for all cases.

Recommended direction:
- keep receipt/sale header
- move batch source to sale lines or sale fulfillment allocations
- preserve link to booking when sale fulfills a booking
- preserve payment evidence link

### POS reconciliation

Add a model for Medusa import / settlement review, for example:
- `PosSettlementImport`
- `PosSettlementLine`

### Auditability

Add audit metadata for:
- overrides
- reallocations
- reconciliation actions
- imported line reviews

## Module-by-Module V2 Build Scope

## Banking Module

Build:
- bulk-entry workspace
- import queue
- unallocated queue
- reconciliation screen
- cash account handling
- transfer workflow between internal accounts
- POS settlement review screen
- POS charges expense handling

## Booking Module

Build:
- deposit-driven booking creation
- allocation drawer / selector
- booking funding summary
- pending balance visibility
- override path with note
- booking timeline or activity history

## Sales Module

Build:
- pending-booking-first customer flow
- direct sale fallback
- payment-proof-linked sale creation
- multi-batch line sourcing
- receipt generation and receipt log
- cash to bank follow-up flow

## Inventory Module

Build:
- crack threshold warnings
- improved write-off handling
- stronger per-batch reserve vs available views
- support for multi-batch fulfillment visibility

## Batch Module

Build:
- policy variance panel
- richer batch analysis
- monthly batch summary
- crack performance flagging

## Reports Module

Build:
- dedicated report center
- report index page
- saved filter presets where useful
- export support

## Admin Module

Build:
- items and FE management
- bank account management
- category management
- policy settings
- availability toggles

## Suggested V2 Delivery Phases

## Phase 1: Financial Foundation

Goal: make money flow trustworthy.

Deliver:
- Cash on Hand account
- bank statement import
- bulk banking entry workspace
- unallocated income / expense review
- reconciliation model and UI

## Phase 2: Deposit Allocation Engine

Goal: connect real money to bookings.

Deliver:
- allocation data model
- deposit balance calculations
- customer deposit views
- booking funding summaries

## Phase 3: Booking Workflow Rewrite

Goal: replace amount typing with allocation-backed booking.

Deliver:
- new booking creation flow
- override notes
- pending balance visibility
- better booking list states

## Phase 4: Sales And Receipts Rewrite

Goal: make sale creation operationally correct and auditable.

Deliver:
- pending-bookings-first workflow
- direct sale flow
- cash-account-linked cash sales
- transfer-backed sale validation
- receipt log and printable detail

## Phase 5: Multi-Batch Fulfillment And Inventory Controls

Goal: handle real stock movement and scale.

Deliver:
- multi-batch sale sourcing
- crack threshold warnings
- improved write-offs
- FIFO-friendly stock selection support

## Phase 6: Reports Center

Goal: replace Loyverse reporting operationally and strategically.

Deliver:
- sales summary
- sales by item
- sales by category
- sales by payment type
- receipts log
- monthly crates sold
- batch summary vs policy
- investor metrics

## Phase 7: Admin And Configuration

Goal: make the system self-manageable.

Deliver:
- bank account admin
- category admin
- item / FE admin
- item availability toggles
- policy settings

## Phase 8: Portal V2

Goal: extend customer experience without compromising internal correctness.

Deliver:
- buy eggs now path
- upcoming batch booking path
- unified payment flow

## Recommended Priority Order

If build order must be tightened further, use this order:

1. Banking foundation
2. Allocation engine
3. Booking rewrite
4. Sales rewrite
5. Receipts and reporting center
6. Multi-batch inventory logic
7. Admin/configuration
8. Portal V2

## UX Notes By Screen

### Banking workspace

Should feel like:
- spreadsheet-like review workspace
- fast keyboard entry
- obvious row statuses
- sticky top summary showing statement balance vs system balance
- easy categorization and customer matching

Should not feel like:
- repeated modal form submission
- one transaction per screen

### Booking workflow

Should feel like:
- guided allocation flow
- transparent funding state
- clear expected amount vs paid amount vs pending amount

### Sales workflow

Should feel like:
- pick customer
- choose booking or direct sale
- confirm money evidence
- complete receipt

### Reports

Should feel like:
- filter once, read clearly, export easily
- mostly tables first, charts second

## Risks To Manage

1. Migrating from V1 booking paid amounts to allocation-based truth.
2. Refactoring sale-to-batch relationship for multi-batch support.
3. Preserving live operational continuity during the workflow rewrite.
4. Avoiding UI complexity while adding financial correctness.
5. Ensuring staging gets realistic sample data for banking and reporting tests.

## Remaining Inputs Helpful For Implementation

1. One real manual batch analysis sample or screenshot.
2. One receipt print example used by the business today.
3. Final crack allowance threshold once agreed.
4. Confirmation on whether refunds should appear in receipt log as a separate receipt type.

## Definition Of Done For V2

V2 should be considered complete only when:

1. Staff can start the day in Banking and process statement lines efficiently.
2. Bookings can only be created from recorded money.
3. Cash, transfer, pre-order, and POS flows all have money trails.
4. Sales by item, payment type, receipts, and summary reports can fully replace Loyverse operationally.
5. Batch analysis reflects company policy target and crack outcomes.
6. Investor-style since-inception metrics can be generated directly from the app.
7. The UX is clearer and easier than the reference tools, even though it is functionally richer.
