# Fresh Eggs Operations V2 Phase 1 Execution Plan

## Phase Name

V2 Phase 1: Banking Foundation

## Purpose

Phase 1 establishes the financial foundation required for the rest of V2.

This phase is responsible for:

- making Banking the start-of-day workspace
- introducing `Cash on Hand` as a system account
- supporting Providus bank statement import and review
- supporting bulk manual banking entry
- adding reconciliation as an explicit workflow
- preparing the system for later booking allocation and POS settlement work

This phase does **not** yet rewrite bookings or sales fully. It creates the trustworthy money layer they will depend on.

## In Scope

1. New `Cash on Hand` account type
2. Banking workspace redesign
3. Bulk manual row entry
4. Providus statement CSV import
5. Imported line review and categorization
6. Unallocated income and unallocated expense handling
7. Internal transfer flow, including Cash -> Bank
8. Reconciliation records and reconciliation status per account
9. Deduplication rules for statement import
10. Migration and backfill plan for existing V1 banking data

## Out Of Scope

1. Booking allocation engine
2. Booking rewrite
3. Sales rewrite
4. Multi-batch sales
5. Medusa upload and automated POS matching
6. Full Reports module redesign
7. Admin UI for managing all account/category definitions

These will be built on top of Phase 1.

## Success Criteria

Phase 1 is successful when:

1. Staff can enter 20 to 50 banking lines in one session without repetitive modal use.
2. A Providus CSV can be imported, reviewed, categorized, and posted into the system.
3. The system can show per-account reconciliation status.
4. `Cash on Hand` can receive cash sales and later be transferred into a real bank account.
5. Imported unknown items can sit in `Unallocated Income` or `Unallocated Expense` without blocking the workflow.
6. Posted banking data remains compatible with later booking-allocation work.

## Product Decisions Locked For Phase 1

1. Banking is the source of truth for money.
2. `Cash on Hand` is treated as a pseudo-bank account.
3. Imported bank statement rows are reviewed before final posting.
4. Unclear imported rows must not be forced into false categories.
5. Reconciliation is an explicit action with a saved record.
6. Existing V1 data should be preserved, not discarded.

## Current V1 Constraints

Current schema limitations in [schema.prisma](/Users/fiistephen/Downloads/Fresh%20Eggs%20Operations/fresh-eggs-ops/api/prisma/schema.prisma):

- `BankAccountType` has only `CUSTOMER_DEPOSIT`, `SALES`, and `PROFIT`.
- `BankTransaction` is already final/postable data but has no import/review layer.
- There is no concept of statement file, statement line, reconciliation record, or posting status.
- Banking UI is single-transaction oriented and not suitable for high-volume review.

## Target Architecture

## 1. Account Model

### Required account types

Existing:
- `CUSTOMER_DEPOSIT`
- `SALES`
- `PROFIT`

New:
- `CASH_ON_HAND`

### Recommended `BankAccount` additions

- `isVirtual Boolean @default(false)`
- `supportsStatementImport Boolean @default(true)`
- `sortOrder Int @default(0)`

Recommended behavior:
- `CASH_ON_HAND` should have `isVirtual = true`
- `CASH_ON_HAND` should have `supportsStatementImport = false`

## 2. Statement Import Layer

### New model: `BankStatementImport`

Suggested fields:

- `id`
- `bankAccountId`
- `provider` (`PROVIDUS` for now)
- `originalFilename`
- `statementDateFrom`
- `statementDateTo`
- `openingBalance`
- `closingBalance`
- `status`
- `rawRowCount`
- `parsedRowCount`
- `postedRowCount`
- `importedById`
- `createdAt`
- `updatedAt`

Suggested enum: `StatementImportStatus`

- `DRAFT`
- `REVIEWING`
- `POSTED`
- `PARTIALLY_POSTED`
- `CANCELLED`

### New model: `BankStatementLine`

Suggested fields:

- `id`
- `importId`
- `lineNumber`
- `transactionDate`
- `actualTransactionDate`
- `valueDate`
- `description`
- `docNum`
- `debitAmount`
- `creditAmount`
- `runningBalance`
- `direction`
- `reviewStatus`
- `suggestedCategory`
- `selectedCategory`
- `selectedCustomerId`
- `notes`
- `fingerprint`
- `postedTransactionId`
- `rawPayload Json`
- `createdAt`
- `updatedAt`

Suggested enum: `StatementLineReviewStatus`

- `PENDING_REVIEW`
- `READY_TO_POST`
- `POSTED`
- `SKIPPED`
- `DUPLICATE`

### Why separate import lines from bank transactions

Because imported rows are not yet trustworthy accounting records until reviewed.

The lifecycle should be:

1. import raw file
2. parse rows
3. review rows
4. classify rows
5. post reviewed rows into `BankTransaction`

## 3. Reconciliation Layer

### New model: `BankReconciliation`

Suggested fields:

- `id`
- `bankAccountId`
- `statementImportId` optional
- `statementDate`
- `openingBalance`
- `closingBalance`
- `systemBalance`
- `variance`
- `status`
- `notes`
- `reconciledById`
- `createdAt`

Suggested enum: `ReconciliationStatus`

- `BALANCED`
- `VARIANCE`
- `OPEN`

### Account-level status computation

Each account view should show:

- latest reconciliation status
- latest reconciliation date
- latest reconciled closing balance
- current system balance
- current out-of-balance warning if any

## 4. Bank Transaction Enhancements

### Recommended `BankTransaction` additions

- `sourceType`
- `statementLineId` optional unique
- `internalTransferGroupId` optional
- `postedAt`

Suggested enum: `TransactionSourceType`

- `MANUAL`
- `STATEMENT_IMPORT`
- `INTERNAL_TRANSFER`
- `SYSTEM`

### Transaction category additions needed now

Current categories are not sufficient for Phase 1.

Recommended additions:

- `UNALLOCATED_INCOME`
- `UNALLOCATED_EXPENSE`
- `CASH_SALE`
- `INTERNAL_TRANSFER_IN`
- `INTERNAL_TRANSFER_OUT`

Notes:
- `UNALLOCATED_*` categories are temporary but valid posted accounting buckets.
- `INTERNAL_TRANSFER_*` should support Cash -> Bank and later other internal movements.
- Keep existing categories to preserve compatibility with V1 data.

## 5. Parser Specification For Providus CSV

Use [providus statement sample.csv](/Users/fiistephen/Downloads/Fresh%20Eggs%20Operations/providus%20statement%20sample.csv) as the canonical sample for Phase 1 parser behavior.

### Parser requirements

1. Detect file provider as Providus.
2. Read statement metadata from header area:
- customer name
- NUBAN number
- statement period
- opening balance
- closing balance
3. Detect transaction header row:
- `Transaction Date,Actual Transaction Date,Transaction Details,Value Date,Debit Amount,Credit Amount,Current Balance,DR/CR,DOC-NUM`
4. Ignore non-transaction rows such as:
- branch/title rows
- summary rows before table
- `Balance B/F` row for posting purposes
- final `Total` row
- disclaimer rows
5. Parse numeric values by stripping commas and quotes.
6. Derive direction:
- debit present -> `OUTFLOW`
- credit present -> `INFLOW`
7. Preserve the raw description and doc number.
8. Preserve running balance from `Current Balance`.
9. Build a stable fingerprint for dedupe.
10. Create import lines in `PENDING_REVIEW` state.

### Suggested fingerprint input

Concatenate normalized values:

- bank account id
- transaction date
- value date
- direction
- debit amount
- credit amount
- description
- doc num
- running balance

Hash this string and store it on `BankStatementLine.fingerprint`.

## 6. Bulk Manual Entry Model

Manual row entry should not require one modal per transaction.

### Required capability

A workspace grid where the user can:

- pick account
- enter date
- paste description
- choose category
- choose direction
- enter amount in `Received` or `Spent`
- optionally link customer
- save many rows in one action

### Posting behavior

- valid reviewed rows should create `BankTransaction` records in bulk
- invalid rows should remain highlighted and unposted
- the save action should return per-row success/failure feedback

## API Plan

## 1. Account endpoints

### `GET /banking/accounts`
Enhance response to include:

- `isVirtual`
- `supportsStatementImport`
- latest reconciliation summary

## 2. Bulk manual entry

### `POST /banking/transactions/bulk`
Input:
- array of manual rows

Behavior:
- validate each row independently
- create all valid rows in one transaction or return structured partial errors based on final implementation choice
- recommended first version: reject all if any row is invalid, to reduce ambiguity

## 3. Statement import

### `POST /banking/imports/providus/preview`
Input:
- CSV file upload
- target bank account id

Behavior:
- parse file
- create `BankStatementImport`
- create `BankStatementLine` records
- return import summary and preview rows

### `GET /banking/imports/:id`
Return:
- import metadata
- balances
- counts by status

### `GET /banking/imports/:id/lines`
Return:
- paginated or filtered review rows

### `PATCH /banking/imports/:id/lines/:lineId`
Allow:
- selected category
- selected customer
- notes
- review status

### `POST /banking/imports/:id/post`
Behavior:
- post all `READY_TO_POST` rows into `BankTransaction`
- mark them `POSTED`
- link `postedTransactionId`
- update import counters

## 4. Reconciliation

### `POST /banking/reconciliations`
Input:
- bank account id
- statement import id optional
- statement date
- opening balance
- closing balance
- notes

Behavior:
- compute system balance from posted transactions
- compute variance
- save reconciliation record

### `GET /banking/reconciliations`
Filter by:
- bank account
- status
- date range

### `GET /banking/accounts/:id/reconciliation-status`
Return:
- latest reconciliation
- current balance summary
- stale / variance flags

## 5. Internal transfers

### `POST /banking/transfers/internal`
Input:
- from account id
- to account id
- amount
- description
- date

Behavior:
- create paired transactions
- link them with shared transfer group id

This endpoint is required for `Cash on Hand -> Customer Deposit` banking movement.

## UI Plan

## Banking page structure

Replace the current transaction-first tabbed page with a workspace-centered layout.

### Primary sections

1. Account switcher
2. Reconciliation status banner
3. Workspace mode toggle
- `Manual Entry`
- `Imported Review`
- `Posted Transactions`
4. Right-side or lower summary panel
- statement closing balance
- system balance
- variance
- rows ready to post
- rows still unallocated

## Screen 1: Banking Workspace

Purpose:
- daily operations home

Should support:
- row grid
- keyboard-friendly entry
- add/remove rows
- inline validation
- quick customer search
- clear direction columns (`Received` and `Spent`)

## Screen 2: Statement Import Review

Purpose:
- review Providus CSV imports before posting

Should show per row:
- date
- description
- doc num
- amount in / out
- suggested category
- selected category
- customer match if any
- review state
- duplicate badge if applicable

## Screen 3: Reconciliation View

Purpose:
- compare statement balances against system balances

Should show:
- last reconciled at
- status badge
- opening balance
- closing balance
- system balance
- variance
- import used
- who reconciled it

## Screen 4: Internal Transfer Modal / Drawer

Purpose:
- move money from Cash on Hand into bank
- move money between accounts when needed

## UX Acceptance Rules

1. No one-transaction modal loop for common banking work.
2. Imported rows should be editable inline.
3. Unknown rows should not block the import workflow.
4. Reconciliation status must be visible before entering more data.
5. Cash account should feel normal in the app even though it has no bank statement import.

## Data Migration Plan

## Migration 1: schema changes

Add:
- new account type
- new categories
- import models
- reconciliation model
- transaction source metadata

## Migration 2: seed cash account

Create one default account:
- `Cash on Hand`
- type `CASH_ON_HAND`
- `isVirtual = true`
- `supportsStatementImport = false`

## Migration 3: backfill existing transactions

Backfill existing `BankTransaction` records with:
- `sourceType = MANUAL`
- `postedAt = createdAt` or current timestamp based on implementation choice

## Migration 4: no retroactive reconciliation required

Do **not** force historical reconciliation recreation.

Phase 1 reconciliation begins from go-live onward.

## Migration 5: no booking/sales rewrites yet

Current booking and sales logic remain operational during Phase 1.

They will be reworked in later phases once the new banking foundation is stable.

## Staging Test Checklist

Use staging URL and staging database only.

## Account tests

- `Cash on Hand` exists and is visible in Banking
- `Cash on Hand` cannot accept statement import
- real bank accounts still load normally

## Manual entry tests

- can add 10+ rows in one session
- can save multiple valid rows together
- invalid row blocks post with clear error location
- customer-linked rows can be saved

## Providus import tests

- sample CSV parses successfully
- header metadata extracted correctly
- transaction rows counted correctly
- `Balance B/F` is not posted as live transaction
- final totals row is ignored
- closing balance matches import summary

## Review tests

- row category can be changed inline
- row can be moved to `UNALLOCATED_INCOME` or `UNALLOCATED_EXPENSE`
- duplicate rows are flagged
- ready rows can be bulk-posted
- posted rows link to created bank transactions

## Reconciliation tests

- reconciliation can be created from imported statement
- variance is zero when import and system match
- variance is shown when rows are missing or mismatched
- account banner updates with latest reconciliation status

## Internal transfer tests

- cash to customer deposit creates paired in/out entries
- transfer updates both account balances correctly
- transfer entries can be filtered and reported later

## Regression tests

- existing V1 banking transaction listing still works
- dashboard bank balances still compute correctly
- alerts depending on banking do not break

## Implementation Order

1. schema changes and migrations
2. seed cash account
3. parser utility for Providus CSV
4. import models and preview endpoint
5. review/post endpoints
6. bulk manual entry endpoint
7. internal transfer endpoint
8. reconciliation endpoints
9. banking UI redesign
10. staging verification with real sample files

## Engineering Notes

1. Keep parser logic in a dedicated utility module, not inside route handlers.
2. Keep import rows separate from final transactions.
3. Use strong dedupe fingerprints to reduce double posting.
4. Prefer explicit states over ambiguous booleans.
5. Design API response shapes so Phase 2 booking allocation can reuse them.

## Deliverables At End Of Phase 1

1. migrated schema
2. cash account seeded
3. Providus CSV import working
4. review/post pipeline working
5. bulk manual banking entry working
6. reconciliation records working
7. redesigned Banking UI in staging
8. staging checklist passed
