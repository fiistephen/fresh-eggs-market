# Fresh Eggs Operations Batch Module V2 Spec

## Purpose

This document defines the proper V2 upgrade for the `Batches` module based on:

- the batch discussion in `Fresh Eggs Operations App Meeting  Transcript 2.md`
- the existing V2 implementation direction in `V2_IMPLEMENTATION_SPEC.md`
- the current app state already shipped to staging

This is the next major operational module pass after:

- Banking foundation
- booking allocation
- sales fulfillment improvements
- reports center
- batch policy reporting
- items module foundation
- admin transaction category configuration

Batch V2 is important because the business starts from two places:

1. money enters through Banking
2. stock enters through Batches

## Product Position

`Batches` is not just a record of incoming stock.

It is the operational source of truth for:

- what stock is expected
- what stock was actually received
- what FE items are inside the stock
- what can still be booked
- what can still be sold
- what has been lost to cracks or damage
- whether the company made the profit it expected from that batch

## Exact Batch Decisions From Meeting 2

## 1. Batch Creation

- A batch is created before it is received.
- It starts open for booking after creation.
- A batch has:
  - expected date
  - expected quantity
  - available for booking
  - pricing context
- A batch can contain more than one FE item.
- Different FE items inside one batch can have different cost prices.
- Two FE items are common, but the system should not hard-limit the batch to only two.

## 2. Batch Receiving

- Inventory should only populate after a batch is received.
- Receiving must support:
  - actual quantity
  - free crates
  - multiple FE items
  - per-item cost price
  - per-item quantity
  - per-item free quantity where needed
- Additional crates received for crack adjustment must be visible in the received totals.

## 3. How Batch Stock Reduces

- A batch does not reduce because of bookings.
- A batch reduces because of sales.
- A batch also reduces because of write-off.
- One sale can draw from more than one batch.
- Batch stock calculations must therefore be line-level and batch-aware, not only sale-header-based.

## 4. Cracks And Damage

- Crack handling is tracked by crates, not by single eggs.
- Once a crate is no longer complete, it is operationally treated as no longer being a full crate.
- There are two important outcomes:
  - totally damaged crates written off
  - mildly cracked eggs/crates sold later at discount
- Staff should be able to record crack-related losses during operations/counting.
- There must be a crack allowance threshold.
- Anything beyond that threshold should flag in red for investigation.
- The final threshold is a configurable business setting, not a hardcoded constant.

## 5. Batch Analysis

Batch analysis must stop being a manual spreadsheet exercise.

It should show:

- batch date / name
- received quantities
- free or adjustment crates
- FE mix inside the batch
- cost price by FE
- sales summary by FE
- sales summary by sale type
- cracked crates sold at discount
- totally damaged crates written off
- total revenue
- total cost
- actual profit

## 6. Company Policy Comparison

The business policy discussed in meeting 2 is:

- expected profit target is about `NGN 500 per crate`

So each batch should show:

- expected profit based on policy
- actual profit
- variance to policy
- whether the batch beat or missed policy
- visible reason/context when performance is weak

## 7. Monthly Batch Summary

There should be a monthly rolled-up batch summary showing:

- total number of batches
- total profit for the month
- per-batch profit
- how many batches were above company policy
- how many batches were below company policy
- overall variance to target

## 8. FE Items And Batch Relationship

- FE codes are items.
- If a new FE appears during batch receiving and it does not already exist, it becomes a new item.
- If an FE already exists, it should be reused as the same item.
- Batch receiving should therefore integrate tightly with the `Items` module.

## Problems In The Current App

The current app already does some batch work well, but Batch V2 is still needed because:

- batch creation UX is still basic
- batch receiving UX is not yet built around the new Items model
- batch detail is not yet the strong operational workspace it should be
- batch lifecycle signals are not yet as clear as they need to be
- crack/write-off handling needs better staff guidance
- batch analysis exists, but the full workflow still feels like a technical view rather than an operational one

## Batch Module V2 Goals

1. Make the batch list clearer and easier to scan.
2. Make batch creation faster and more accurate.
3. Make receiving a batch feel like a guided stock intake workflow.
4. Make batch detail the main workspace for understanding that batch.
5. Show staff what matters immediately:
   - booking pressure
   - sales movement
   - remaining sale-ready stock
   - crack issues
   - policy performance
6. Connect FE items to the Items module without extra mental overhead.
7. Reduce spreadsheet-style manual reasoning.

## UX Direction

The Batch module should feel operational, not technical.

Design principles:

- strong status cards at the top
- clearer wording for stock intake and stock loss
- fewer ambiguous numeric fields
- obvious differences between:
  - expected
  - received
  - booked
  - sold
  - written off
  - still available for sale
- tables where staff need precision
- summary cards where managers need clarity

## Screen-Level Scope

## 1. Batch List Page

The batch list should become a command center.

Each row or card should show:

- batch name
- expected date
- status
- expected quantity
- received quantity
- booked quantity
- sold quantity
- available for sale
- crack alert state
- policy performance signal

Suggested quick filters:

- Open
- Received
- Closed
- Needs receiving
- Has crack alert
- Below policy

Suggested quick actions:

- Create batch
- Receive batch
- Open batch detail
- Close batch

## 2. Create Batch Flow

The create flow should collect:

- expected date
- expected quantity
- available for booking
- default wholesale price
- default retail price
- optional planning notes

Important note:

- creation should not force final FE breakdown if that is only confirmed on receipt day
- however, the UI should make it clear that the FE mix will be confirmed when the batch is received

## 3. Receive Batch Flow

This should be a strong guided intake screen.

It should capture:

- actual quantity received
- free crates
- adjustment crates if relevant
- FE lines inside the batch

Each FE line should support:

- item / FE code
- cost price
- paid quantity
- free quantity

Important behavior:

- existing FE items should be searchable from the Items module
- brand-new FE item should be creatable inline when needed
- totals should be validated live
- received total should agree with batch intake total before confirmation

## 4. Batch Detail Page

This should become the main operational view for one batch.

Top summary area should show:

- batch status
- expected date
- received date
- expected quantity
- actual received quantity
- booked quantity
- sold quantity
- write-off quantity
- available for sale
- crack alert
- expected profit
- actual profit
- variance to policy

Sections on the page should include:

- FE breakdown
- bookings against this batch
- sales fulfilled from this batch
- inventory counts and write-offs
- batch analysis
- action log / notes

## 5. Inventory / Count Entry Within Batch

Batch-linked count entry should support:

- physical count
- cracked write-off in crates
- notes

The UI should explain plainly:

- bookings do not reduce batch stock
- sales reduce stock
- write-offs reduce stock

## 6. Batch Analysis View

This should show:

- received FE mix
- cost by FE
- sales by FE
- wholesale / retail / cracked sold
- damaged write-off
- actual profit
- policy target
- variance

If possible, also show:

- short commentary field or notes
- highlight reason when low margin is driven by unusually high purchase cost

## Data And Logic Requirements

## 1. Core Batch Stock Math

For each batch, the system should compute:

- received quantity
- sold quantity
- written-off quantity
- booked quantity
- on-hand quantity
- available-for-sale quantity

Rules:

- bookings reserve capacity, but do not reduce physical stock
- sales reduce stock
- write-offs reduce stock

## 2. FE / Item Linkage

Each `BatchEggCode` should remain linked to an `Item`.

Required behavior:

- reuse existing FE item where possible
- create new FE item if it does not already exist
- keep historical FE items even when retired later

## 3. Crack Logic

The system needs separate tracked values for:

- damaged crates written off
- mildly cracked quantity sold at discount

Crack allowance should be read from Admin policy settings.

## 4. Policy Logic

Expected batch profit should be:

- `received crate count * target profit per crate`

Actual batch profit should come from:

- actual sales revenue
- minus actual sale cost
- with cracked sold and write-offs correctly reflected

## Suggested Build Order

## Phase A. Batch Workspace Foundation

- improve batch list
- improve batch detail summary
- add clearer status/policy/crack indicators

## Phase B. Receive Flow Upgrade

- rebuild receive batch flow around FE item lines
- add inline FE item creation/reuse
- improve live validation

## Phase C. Count And Write-Off Workflow

- improve record-count flow
- make crack/write-off entry clearer
- show effect on batch stock immediately

## Phase D. Batch Analysis Upgrade

- strengthen batch analysis view
- add clearer FE-level breakdown
- add policy comparison language and visual signals

## Phase E. Monthly Batch Reporting Tie-In

- tighten Batch Summary report using the upgraded batch model and UX

## Out Of Scope For This Batch Spec

These are related, but not part of Batch Module V2 itself:

- customer portal redesign
- broader non-egg sales workflow
- investor report redesign outside batch reporting
- freeform custom banking categories

## Immediate Execution Recommendation

After approving this spec, implementation should start with:

1. Batch list and batch detail UX upgrade
2. receive flow upgrade
3. count/write-off flow refinement

That order gives the fastest visible improvement while staying aligned with the business rules from meeting 2.
