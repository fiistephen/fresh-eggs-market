# Banking Cash Deposit Reconciliation Spec

## Purpose

This document defines how cash sales should move from the in-store cash balance into the bank while preserving one core rule:

- every material cash movement must either already have a matching bank statement line
- or be clearly waiting for one

The goal is not to pretend that every cash event is immediately on the bank statement. The goal is to make every cash event traceable until the bank confirms it.

## Business Problem

Today, a cash sale is correctly recorded into `Cash Account`.

Example:

- customer buys 2 crates at `NGN 5,200` each
- total sale is `NGN 10,400`
- payment method is cash
- the app records that money in `Cash Account`

That part is good.

The missing control is what happens next.

If multiple cash sales happen in one day and the total cash on hand becomes `NGN 45,700`, the business expects that cash to be deposited into the bank. If it is still sitting in `Cash Account` the next day, the system should flag it. If staff say they have deposited it, that should remain pending until a bank statement inflow confirms it.

## Guiding Product Rule

Use this rule everywhere in the design:

- cash sale = money entered `Cash Account`
- cash deposit = money physically moved from `Cash Account` to the bank
- bank confirmation = bank statement inflow proves that deposit reached the bank

Do not collapse these three events into one event.

## Recommended Product Model

## 1. Cash Sales Stay As They Are

When a sale is paid in cash:

- create the sale record
- create the linked banking transaction in `Cash Account`
- mark the banking transaction as `CASH_SALE`

That transaction is the source ledger entry for the cash.

## 2. Cash-to-Bank Movement Becomes A Deposit Batch

When staff use `Move money` from `Cash Account` to `Customer Deposit Account`, the app should not treat it as a fully completed internal transfer.

Instead, if:

- `fromAccount = Cash Account`
- `toAccount = Customer Deposit Account`

then create a `CashDepositBatch` workflow.

This should represent one real-world bank lodgement made up of one or more cash sales.

Example:

- cash sales today total `NGN 45,700`
- staff deposit `NGN 45,700`
- app creates one cash deposit batch for `NGN 45,700`
- batch waits for statement confirmation

## 3. A Bank Statement Line Should Confirm The Deposit

When the bank statement later shows an inflow of `NGN 45,700`, that line should not be categorized as `Cash sale`.

Recommended category:

- `Cash deposit confirmation`

Reason:

- the bank line is not the sale
- the bank line is the confirmation that already-recorded cash has reached the bank

That makes the accounting story cleaner.

## Required States

A cash deposit batch should have explicit lifecycle states:

- `PENDING_CONFIRMATION`
- `CONFIRMED`
- `OVERDUE`
- `REJECTED`
- `CANCELLED`

Recommended meaning:

- `PENDING_CONFIRMATION`: staff recorded that cash was deposited, but the bank statement has not confirmed it yet
- `CONFIRMED`: a bank statement line has been matched and accepted as proof
- `OVERDUE`: still not confirmed after the allowed window
- `REJECTED`: a candidate bank line was reviewed and determined not to match
- `CANCELLED`: the deposit record was entered by mistake or reversed before confirmation

## Data Model Recommendation

Add a dedicated model such as `CashDepositBatch`.

Suggested fields:

- `id`
- `fromBankAccountId`
- `toBankAccountId`
- `amount`
- `depositDate`
- `status`
- `createdById`
- `confirmedById`
- `confirmedAt`
- `confirmationStatementLineId`
- `notes`
- `createdAt`
- `updatedAt`

Add a join model such as `CashDepositBatchTransaction`.

Suggested fields:

- `id`
- `cashDepositBatchId`
- `bankTransactionId`
- `amountIncluded`
- `createdAt`

This lets one deposit batch be made up of many cash-sale transactions.

## Why A Deposit Batch Is Better Than Matching Sale By Sale

This business deposits pooled cash, not one sale at a time.

So the app should support:

- 4 or 10 cash sales in one day
- one lump deposit to the bank
- one bank statement inflow confirming that lump

Trying to match every individual sale to a statement line would be confusing and false to how the operation actually works.

## Matching Logic

When a statement line is categorized as `Cash deposit confirmation`, the app should open a matching step.

Suggested auto-match rules:

1. same inflow amount
2. target account is `Customer Deposit Account`
3. deposit date is same day or within 2 days
4. still in `PENDING_CONFIRMATION` or `OVERDUE`

Suggestion priority:

- exact amount + same day
- exact amount + next day
- exact amount + within 2 days
- near amount match should not auto-confirm; only suggest if explicitly desired later

Recommended behavior:

- show top suggested pending deposit batches
- allow one-click confirmation if the match is exact
- allow manual override if staff know the right batch

## Alerts And Exceptions

Two important alerts should exist.

### 1. Cash Not Yet Deposited

Definition:

- cash sales remain in `Cash Account`
- they are not yet attached to any pending deposit batch
- they are older than the allowed threshold, recommended `24 hours`

Show:

- total undeposited cash amount
- oldest sale date in the undeposited pool
- number of transactions included

### 2. Pending Cash Deposit Not Confirmed

Definition:

- a cash deposit batch was recorded
- but no bank statement inflow has confirmed it within the allowed threshold, recommended `24 hours`

Show:

- total pending amount
- deposit date
- age / days overdue
- who recorded it

These alerts should appear on Banking home under `Needs attention`.

## UI Recommendation

Add a dedicated Banking workspace section:

- `Cash deposits`

Subsections inside it:

- `Undeposited cash`
- `Pending confirmation`
- `Confirmed recently`

Primary actions:

- `Create deposit from cash`
- `Review pending deposits`
- `Match statement line`

Do not bury this inside generic `Transactions`. This is a distinct operational workflow.

## Move Money Behavior

Recommended rule:

- normal account-to-account transfers keep their current behavior
- only `Cash Account -> Customer Deposit Account` uses the special pending-confirmation workflow

That keeps the rest of Banking simple and only adds complexity where the business truly needs it.

## Statement Review Behavior

When a statement line is categorized as `Cash deposit confirmation`:

- show a compact matching panel directly under the line or in a side drawer
- auto-suggest likely pending deposit batches
- if one exact match exists, make it visually obvious
- require explicit staff confirmation before final link

Recommended wording:

- `Suggested pending cash deposit`
- `Confirm this bank inflow matches the pending cash deposit of NGN ...`

## Impact On Availability And Balances

This should not create fake money.

Recommended balance behavior:

- cash sales increase `Cash Account`
- creating a pending deposit batch does not make the cash disappear from audit visibility
- instead, show cash as:
  - `cash on hand`
  - `cash sent to bank, waiting for confirmation`
- once confirmed by statement line, the deposit batch is completed and the audit trail is closed

If desired, `Cash Account` can later show a split summary:

- available cash on hand
- pending bank confirmation
- confirmed historical outflow

## Reporting Impact

Add reporting support for:

- cash sales recorded today
- undeposited cash
- pending cash deposits awaiting statement confirmation
- confirmed cash deposits
- overdue cash deposits

This should be visible inside Banking reports and optionally in management reporting.

## Admin Policy Hooks

These values should be configurable in Admin later if needed:

- maximum hours before `cash not yet deposited` flag appears
- maximum hours before `pending cash deposit not confirmed` becomes overdue
- auto-match window in days for statement confirmation

## Recommended Build Order

1. Add `CashDepositBatch` data model and relationships
2. Add special `Move money` handling for `Cash Account -> Customer Deposit Account`
3. Add `Cash deposit confirmation` transaction category
4. Add pending-deposit matching inside statement review
5. Add Banking alerts for undeposited and overdue deposits
6. Add `Cash deposits` workspace in Banking
7. Add reporting and policy configuration

## Recommendation Summary

The cleanest implementation is:

- keep cash sales recording into `Cash Account`
- turn cash-to-bank movement into a pending deposit batch
- confirm that batch only when a matching bank statement inflow is reviewed
- flag cash that is still undeposited
- flag deposits that were claimed but not yet bank-confirmed

This best matches how the business actually handles cash while preserving the rule that every important money movement must be traceable to a bank statement confirmation.
