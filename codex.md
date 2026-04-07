# Fresh Eggs Operations — Codex Working Memory

> Purpose: This is Codex's persistent working memory for the Fresh Eggs Operations project. Codex should read this at the start of every session, use it to regain context quickly, and update it after meaningful work so future sessions stay grounded in reality.

---

## 1. How Codex Should Use This File

Codex should do these things every session:

1. Read this file first.
2. Read `../claude.md` and `../IMPLEMENTATION_PLAN.md` if deeper business or historical context is needed.
3. Verify reality before acting:
   - check the local repo state
   - check GitHub state if relevant
   - check VPS state before deployment or server edits
4. Update this file after meaningful work, decisions, or environment changes.

This file is for:

- fast recovery of context
- remembering operational details
- preserving working conventions
- recording what Codex actually changed
- improving future execution quality

This file should avoid storing secrets. Reference secret locations, not secret values.

---

## 2. Current Project Snapshot

Fresh Eggs Operations is a full-stack operations system for Fresh Eggs Market. It replaces the business's manual workflows and Loyverse-based POS flow with a custom app covering:

- batch management
- customer booking
- sales
- banking
- inventory
- alerts/dashboard
- customer portal

Core stack:

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Fastify + Prisma
- Database: PostgreSQL
- Auth: self-managed JWT

The local working project folder is:

- `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops`

Context and planning docs are here:

- `/Users/fiistephen/Downloads/Fresh Eggs Operations/claude.md`
- `/Users/fiistephen/Downloads/Fresh Eggs Operations/IMPLEMENTATION_PLAN.md`
- `/Users/fiistephen/Downloads/Fresh Eggs Operations/codex.md`
- `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/codex.md`

GitHub repo:

- `git@github.com:fiistephen/fresh-eggs-market.git`
- https://github.com/fiistephen/fresh-eggs-market

---

## 3. Environments

### Local machine

- Local repo is initialized and connected to GitHub.
- Main branch tracks `origin/main`.
- `.gitignore` excludes nested `node_modules`, nested `dist`, env files, logs, and `.DS_Store`.

### VPS production

Current live environment:

- Host: `203.161.42.197`
- OS: AlmaLinux 8 with cPanel
- Domain: `https://fresheggsmarket.hiddekellabs.com`

Live backend project location:

- `/opt/fresh-eggs-ops`

Live frontend document root:

- `/home/digivlrx/fresheggsmarket.hiddekellabs.com`

Important live facts:

- The live backend is a Docker Compose project running `api` and `db`.
- Live API port: `127.0.0.1:3002`
- Live DB port: `127.0.0.1:5433`
- Postgres data persists in Docker volume: `fresh-eggs-ops_pgdata`
- The live setup is currently working well and must not be overwritten casually.
- `/opt/fresh-eggs-ops` is not a Git repo.

Tracked VPS clone for pull-based updates:

- `/opt/fresh-eggs-market-src`

That clone:

- is connected to GitHub with a dedicated deploy key
- tracks `main`
- exists specifically so Codex can pull changes on the VPS without disturbing the live app immediately

---

## 4. Deployment Model

Do not replace the live app folder blindly.

Safe deployment model:

1. Work locally in the Git repo.
2. Commit and push to GitHub.
3. On the VPS, pull updates into `/opt/fresh-eggs-market-src`.
4. Deploy from the clone into the existing live locations using the deployment script.

The deployment script is:

- `/opt/fresh-eggs-market-src/scripts/deploy_vps.sh` on the VPS
- `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/scripts/deploy_vps.sh` locally

Deployment script behavior:

- pulls latest Git changes unless `SKIP_PULL=1`
- backs up files before replacing them
- syncs backend code into `/opt/fresh-eggs-ops/api`
- rebuilds and restarts the live API container from the existing live project
- builds frontend from the tracked clone
- syncs frontend build output into the cPanel docroot
- preserves:
  - live `.env`
  - live `docker-compose.yml`
  - existing Postgres volume
  - frontend `.htaccess`
  - frontend `.well-known`

Normal deploy commands on VPS:

```bash
cd /opt/fresh-eggs-market-src
git pull
sudo bash scripts/deploy_vps.sh
```

Targeted deploys:

```bash
sudo bash scripts/deploy_vps.sh api
sudo bash scripts/deploy_vps.sh web
```

Important caution:

- The live VPS compose file is not identical to the repo compose file.
- Production currently uses the live compose shape in `/opt/fresh-eggs-ops`.
- Do not swap production to the repo compose file without an explicit reconciliation step.

---

## 5. Current Codebase Reality

The local repo contains:

- backend routes for: auth, batches, bookings, customers, sales, banking, inventory, alerts, portal
- frontend pages for: dashboard, batches, batch detail, bookings, customers, sales, banking, inventory, login, portal
- deployment and Docker config

The VPS live backend is behind the current repo in at least these areas:

- `alerts.js` exists in repo clone but not in live backend folder
- `portal.js` exists in repo clone but not in live backend folder
- some backend files differ between live and repo
- live production structure is narrower than the repo's broader Docker setup

Implication:

- future deploys should be deliberate and verified
- the current repo should be treated as the evolving source of truth for code
- the current live VPS should be treated as the source of truth for active runtime topology until a controlled transition is done

---

## 6. Codex Rules For This Project

When working on this project, Codex should:

1. Read this file first, then check `claude.md` for business rules.
2. Prefer updating the GitHub-backed local repo instead of editing ad hoc files on the VPS.
3. Treat production data as valuable and persistent.
4. Never overwrite production config or Docker volumes casually.
5. Before any deployment:
   - inspect `git status`
   - inspect the intended diff
   - inspect the VPS target paths if the deploy affects production
6. Keep deployment changes reversible.
7. Add or update scripts/docs when a manual process becomes repeatable.
8. Record every meaningful change in the log below.

---

## 7. Self-Improvement Notes

Codex should keep improving its workflow for this project. Current lessons:

- preserve working production first; optimize workflow second
- separate "tracked source" from "live runtime" when a server was bootstrapped manually
- do not assume repo config matches production config
- create deployment tooling that respects the current runtime topology
- document the safe path immediately after creating it

Future improvements Codex should consider when appropriate:

- add a production release checklist
- add a pre-deploy diff summary command
- add a backup/rollback helper for API and frontend deploys
- reconcile the repo compose model with the real VPS topology in a controlled way
- bring `codex.md` and `claude.md` into a consistent maintenance rhythm

---

## 8. Working Log

### 2026-04-07

- Reviewed `claude.md` and `IMPLEMENTATION_PLAN.md` to recover full project context.
- Verified the local project structure in `fresh-eggs-ops`.
- Confirmed the local project was not originally a Git repo.
- Confirmed GitHub SSH access from the Mac.
- Initialized the local Git repo and connected it to:
  - `git@github.com:fiistephen/fresh-eggs-market.git`
- Fixed `.gitignore` to exclude nested build/dependency artifacts and env files.
- Created the initial Git commit and pushed `main` to GitHub.
- Verified SSH access from the Mac to the VPS.
- Inspected the live VPS deployment and confirmed:
  - live backend at `/opt/fresh-eggs-ops`
  - live frontend in cPanel docroot
  - live Postgres data in Docker volume `fresh-eggs-ops_pgdata`
  - live app currently works and should be preserved
- Created a dedicated GitHub deploy key on the VPS.
- Configured VPS SSH access for GitHub using a dedicated alias.
- Cloned the GitHub repo on the VPS into:
  - `/opt/fresh-eggs-market-src`
- Compared live VPS files/config with the tracked clone.
- Identified that the live deployment topology differs from the repo topology.
- Added a safe VPS deployment workflow to the repo:
  - `scripts/deploy_vps.sh`
  - `scripts/README.md`
  - updated `DEPLOY.md`
- Pulled the deployment workflow into the VPS clone.
- Created Codex project memory files:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/codex.md`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/codex.md`
- Created a staging subdomain in cPanel:
  - `staging.fresheggsmarket.hiddekellabs.com`
- Added staging Apache proxy config to route `/api` to `127.0.0.1:3003`.
- Added staging deployment assets to the repo:
  - `docker-compose.staging.yml`
  - `scripts/deploy_vps_staging.sh`
- Fixed the repo API Dockerfile so Git-based builds work without an API lockfile.
- Deployed a fully isolated staging stack on the VPS:
  - project name: `fresh-eggs-staging`
  - API port: `127.0.0.1:3003`
  - DB port: `127.0.0.1:5434`
  - DB volume: `fresh-eggs-staging_pgdata`
- Built and published the staging frontend into:
  - `/home/digivlrx/staging.fresheggsmarket.hiddekellabs.com`
- Verified:
  - staging API health is OK
  - staging frontend is served by Apache
  - staging is isolated from production
- Remaining blocker for public staging URL:
  - resolved on 2026-04-07 after Cloudflare DNS was added
  - staging now resolves publicly to `203.161.42.197`
  - Let's Encrypt certificate is active for `staging.fresheggsmarket.hiddekellabs.com`
  - public staging URL is live

---

## 9. Update Protocol

Codex should update this file whenever any of the following happens:

- new deployment workflow
- VPS topology changes
- Git workflow changes
- major feature/module work
- architectural decisions
- debugging discoveries that will matter later
- production incidents or rollbacks

Minimum update format:

- date
- what changed
- why it changed
- what future Codex sessions should remember

## 10. 2026-04-07 V2 Planning Update

- Reviewed the original build transcript, the review transcript, the current V1 app, the sample Providus bank statement, the sample Medusa settlement report, and the supporting screenshots.
- Confirmed from `claude.md` that the product direction is full replacement of Loyverse, not integration.
- Created a formal V2 specification document at:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/V2_IMPLEMENTATION_SPEC.md`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/V2_IMPLEMENTATION_SPEC.md`
- Locked in the core V2 architecture direction:
  - banking first
  - allocation-driven bookings
  - sales linked to money trail
  - dedicated Reports module
  - multi-batch sales support
  - admin-managed catalog/configuration
  - portal expansion after internal workflow correction
- Added a new required financial account concept for V2:
  - `Cash on Hand`
  - this should behave like a pseudo-bank account for cash sales and later banking transfers
- Screenshots are references for workflow meaning and report structure only. V2 UI should be clearer and better than the source tools, not visually cloned from them.
- Remaining helpful inputs for implementation:
  - one real manual batch analysis sample
  - one receipt print example
  - final crack allowance threshold
  - confirmation on whether refunds should appear in receipt log as a separate receipt type

- Created an execution-ready Phase 1 build document focused on Banking Foundation:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/V2_PHASE_1_BANKING_EXECUTION_PLAN.md`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/V2_PHASE_1_BANKING_EXECUTION_PLAN.md`
- Phase 1 is locked to: Cash on Hand, bulk banking entry, Providus CSV import, review/post workflow, internal transfers, and reconciliation.
- Phase 1 intentionally does not yet rewrite bookings or sales; it prepares the financial layer they will depend on.

## 11. 2026-04-07 Phase 1 Banking Implementation Progress

- Implemented the core Phase 1 banking backend foundation in the repo.
- Prisma schema changes added:
  - `CASH_ON_HAND` bank account type
  - bank account flags for `isVirtual`, `supportsStatementImport`, and `sortOrder`
  - new transaction categories for unallocated income/expense, cash sale, and internal transfers
  - new `TransactionSourceType`, `StatementProvider`, `StatementImportStatus`, `StatementLineReviewStatus`, and `ReconciliationStatus` enums
  - new models:
    - `BankStatementImport`
    - `BankStatementLine`
    - `BankReconciliation`
- Updated seed logic to create a fourth account:
  - `Cash on Hand`
  - virtual account
  - no statement import
  - `lastFour = CASH`
- Added backend utilities:
  - `api/src/utils/banking.js`
  - `api/src/utils/providusStatement.js`
- Rebuilt `api/src/routes/banking.js` to support:
  - account summaries with reconciliation context
  - manual transaction entry
  - bulk transaction entry
  - internal transfers
  - Providus statement preview import
  - statement import review and posting
  - reconciliation creation and history
  - existing unbooked deposit, liability, expense, and daily summary endpoints preserved
- Added a missing backend endpoint needed by the new UI:
  - `GET /banking/imports`
- Updated alert logic so future cash workflow can recognize:
  - old cash deposit behavior
  - new `Cash on Hand -> bank` internal transfer behavior
- Rebuilt the frontend banking screen in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Banking.jsx`
- The new Banking UI now includes:
  - workspace overview
  - richer account cards
  - manual banking entry modal
  - bulk banking entry modal
  - internal transfer modal
  - Providus statement import modal
  - import queue and per-line review
  - reconciliation history
  - reconciliation creation modal
- Updated dashboard bank-account visuals to account for the fourth `Cash on Hand` account.
- Verification completed:
  - frontend build passes locally after reinstalling web dependencies
  - backend route syntax passes
  - Prisma schema validates after adding the missing `Customer.statementLines` back relation
  - Prisma client generates successfully locally
  - banking route module imports successfully after Prisma client generation
- Important local environment note:
  - the API repo did not have local dependencies installed when implementation started
  - the web repo had a broken Rollup optional dependency and needed `npm i` before `vite build` worked
- What future Codex sessions should remember:
  - Phase 1 foundation is implemented in code, but database migration and live deployment are still separate steps
  - bookings and sales have not yet been rewritten to use allocations or auto-flow into the new banking foundation
  - the next logical build step is Phase 2: payment allocation plus booking rewrite

## 12. 2026-04-07 Staging Deployment Update

- Deployed the Phase 1 banking foundation to staging from branch:
  - `codex/phase1-banking-foundation`
- Staging source checkout on VPS was moved to that branch at:
  - `/opt/fresh-eggs-market-src`
- Staging deploy completed successfully after:
  - rebuilding the staging API container
  - pushing Prisma schema changes to the staging database
  - rebuilding the staging frontend
  - syncing the built frontend into the staging docroot
- Verified on staging:
  - `https://staging.fresheggsmarket.hiddekellabs.com` returns HTTP 200
  - staging API is healthy internally on `127.0.0.1:3003/health`
  - new tables exist in staging Postgres:
    - `bank_statement_imports`
    - `bank_statement_lines`
    - `bank_reconciliations`
- Important deployment nuance discovered:
  - `prisma db push` for staging required `--accept-data-loss` because Prisma warned about the new unique constraint on `bank_transactions.source_fingerprint`
  - this was safe in staging because `bank_transactions` had `0` rows
- Important VPS/Docker quirk discovered:
  - a dead staging API container got stuck in `Removal In Progress`
  - root cause was a stale `virtfs` overlay mount under:
    - `/home/virtfs/digivlrx/var/lib/docker/overlay2/.../merged`
  - unmounting that stale path allowed Docker to remove the dead staging API container cleanly
- What future Codex sessions should remember:
  - if staging API container removal hangs again on this VPS, check for a stale `virtfs` overlay mount before assuming the app is broken
  - production is still untouched

## 13. 2026-04-07 Phase 2 Booking Allocation Update

- Implemented the Phase 2 foundation that connects bookings to real money already recorded in Banking.
- Added a new Prisma model:
  - `booking_payment_allocations`
- Added relations so:
  - one bank transaction can fund multiple bookings
  - one booking can be funded by multiple bank transactions
- Rebuilt the booking backend in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/bookings.js`
- New booking backend behavior:
  - booking creation now supports `paymentAllocations`
  - booking updates can replace allocations
  - customer funds lookup endpoint added:
    - `GET /bookings/customer-funds/:customerId`
  - bookings still store `amountPaid` for compatibility, but it now reflects applied allocations when allocations are used
- Updated banking and alert logic to stop treating allocated deposits as fully unbooked:
  - `/api/src/routes/banking.js`
  - `/api/src/routes/alerts.js`
- Rebuilt the Bookings UI in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Bookings.jsx`
- New booking UI flow:
  - choose customer
  - choose batch and quantity
  - apply money from real available customer payments
  - no manual typed payment in the normal backend booking flow
- The new Bookings screen copy is intentionally simpler and more operational:
  - tells staff to record money in Banking first
  - then come to Bookings to apply that money
- Deployed this Phase 2 work to staging from:
  - `codex/phase1-banking-foundation`
- Verified on staging:
  - site returns HTTP 200
  - API health is OK on `127.0.0.1:3003/health`
  - `booking_payment_allocations` table exists in staging Postgres
- Important deployment note:
  - the same staging Docker `virtfs` overlay mount issue happened again during API recreation
  - the safe recovery remained:
    - unmount stale `virtfs` overlay path for the dead staging API container
    - remove dead staging API container
    - rerun staging deploy
- What future Codex sessions should remember:
  - bookings are now moving toward banking-first workflow
  - portal booking flow and sales fulfillment flow are still not upgraded to allocations yet
  - next logical step is Phase 3: sales fulfillment tied to booking allocations and payment proof

## 14. 2026-04-07 Phase 3 Sales Fulfillment Update

- Implemented the next sales workflow upgrade so the Sales screen starts from the customer and makes staff choose the right path:
  - complete an already-paid booking pickup
  - or record a direct sale
- Rebuilt the sales backend in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/sales.js`
- New sales backend behavior:
  - added `GET /sales/customer-workspace/:customerId`
  - sales list and single-sale responses now include booking context
  - sale responses now expose `sourceType` as `BOOKING` or `DIRECT`
  - booking pickup can infer the batch from the booking instead of forcing staff to reselect it
  - booking pickup is now protected so it only works when the booking is fully paid
  - booking pickup requires the sale quantity to match the booked quantity exactly
  - direct sales still allow `CASH`, `TRANSFER`, and `POS_CARD`
  - booking pickups are saved as `PRE_ORDER`
- Rebuilt the Sales UI in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Sales.jsx`
- New sales UI flow:
  - search and choose customer first
  - review any open bookings for that customer
  - if a booking is fully paid, continue with booking pickup
  - if not, staff are told clearly to finish payment in Banking first
  - if there is no booking to use, choose a received batch for a direct sale
  - item entry now happens after the correct sales path is chosen
- UX direction for this step:
  - clearer staff language
  - less accounting jargon
  - stronger guidance at the point of action
  - lower chance of recording a pickup as the wrong type of sale
- Local verification completed:
  - `node --check` passed for `/api/src/routes/sales.js`
  - dynamic module import passed for `/api/src/routes/sales.js`
  - frontend build passed after the UI rewrite
- What future Codex sessions should remember:
  - this is the first safe Phase 3 slice, not the final sales model
  - cash and transfer proof still need deeper linkage back into Banking transactions
  - sales are still single-batch at the schema level for now
  - next logical step after validation is staging deploy and review, then deeper sales-to-banking proof and reporting work

## 15. 2026-04-07 Direct Sale Money Trail Update

- Added the next sales-to-banking bridge so direct sales now create their own money record automatically.
- Prisma changes in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/prisma/schema.prisma`
- New schema behavior:
  - `bank_transactions` now supports an optional `sale_id`
  - `sales` now support an optional linked payment transaction
  - added new banking category:
    - `DIRECT_SALE_TRANSFER`
- Direct sale money trail rules implemented:
  - `CASH` direct sale:
    - create system inflow in `Cash Account`
    - category: `CASH_SALE`
  - `TRANSFER` direct sale:
    - create system inflow in `Customer Deposit Account`
    - category: `DIRECT_SALE_TRANSFER`
  - `POS_CARD` direct sale:
    - create system inflow in `Customer Deposit Account`
    - category: `POS_SETTLEMENT`
- Booking pickups still do not create a new payment record:
  - they remain `PRE_ORDER`
  - the sale is treated as fulfillment of money already recorded earlier
- Rebuilt sales backend behavior in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/sales.js`
- Backend additions:
  - direct sale save now creates both:
    - the sale record
    - the linked banking transaction
  - sale responses now include `paymentTransaction`
- Rebuilt UX copy in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Sales.jsx`
- Sales UX updates:
  - direct sale payment buttons now explain what account will be updated automatically
  - staff are told not to enter the same direct sale again in Banking
  - sale detail now shows the linked money trail when one exists
- Banking labels updated in:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/utils/banking.js`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Banking.jsx`
- Local verification completed:
  - Prisma schema validate passed
  - Prisma client generate passed
  - `node --check` passed for `/api/src/routes/sales.js`
  - dynamic route import passed for `/api/src/routes/sales.js`
  - frontend build passed
- What future Codex sessions should remember:
  - this is a practical first money trail, not the final reconciliation model
  - POS settlement timing/fees still need a deeper reconciliation pass against imported Medusa and bank statement data
  - direct sales now have a cleaner single-entry workflow than before

## 16. 2026-04-07 Reports Module Foundation

- Added the first dedicated Reports module so management no longer has to jump between Sales and Banking screens to read basic performance.
- New backend route file:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/reports.js`
- Backend behavior:
  - added `GET /reports/sales`
  - returns one report payload for a selected date range with:
    - summary cards
    - sales by day
    - sales by item
    - sales by category
    - sales by payment method
    - receipt log
- New frontend page:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Reports.jsx`
- App shell updates:
  - registered reports route in `/api/src/index.js`
  - added `/reports` route in `/web/src/App.jsx`
  - added Reports nav item in `/web/src/components/Layout.jsx`
- UX direction for this first reports pass:
  - plain language for managers
  - one date-range filter at the top
  - summary first, detail tables below
  - report structure based on operational questions, not analytics jargon
- Current report coverage in the new Reports page:
  - sales value
  - gross profit
  - transactions and crates sold
  - direct sale vs booking pickup mix
  - sales by payment type
  - sales by item
  - sales by category
  - sales by day
  - receipt log
- Local verification completed:
  - `node --check` passed for `/api/src/routes/reports.js`
  - dynamic route import passed for `/api/src/routes/reports.js`
  - frontend build passed after adding the Reports page
- What future Codex sessions should remember:
  - this is the first reports slice, not the full V2 reporting suite yet
  - customer deposit/liability and expense reports still live inside Banking for now
  - monthly batch reporting, investor reporting, and deeper POS charge reporting are still to come

## 17. 2026-04-07 Reports Center Restructure

- Refined the new Reports module so it now behaves like a report center instead of one long report page.
- New user-facing structure:
  - `/reports` is now a landing page with cards for each report type
  - each report type has its own page and URL
- New frontend routing:
  - `/reports/sales-summary`
  - `/reports/sales-by-item`
  - `/reports/sales-by-category`
  - `/reports/sales-by-payment-type`
  - `/reports/sales-by-employee`
  - `/reports/receipts`
- New frontend files:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/ReportDetail.jsx`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/reportsCatalog.js`
- Updated frontend files:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Reports.jsx`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/App.jsx`
- Backend refinement:
  - expanded `/api/src/routes/reports.js` to add `byEmployee`
- UX direction for this reports-center pass:
  - open one report at a time
  - less clutter on first load
  - clearer mental model for managers
  - report cards act as the navigation layer
- Screenshot influence:
  - used the shared screenshots as workflow references for separate report destinations
  - did not copy the original visual design directly
- What future Codex sessions should remember:
  - Reports is now a hub plus individual report pages
  - next reporting steps should deepen content, not collapse everything back into one screen

## 18. 2026-04-07 Reports Visualization And Executive Summary

- Strengthened the Reports experience by making the main summary pages feel closer to management-ready reporting instead of plain data dumps.
- Product decision confirmed in this pass:
  - yes, the app should include an Executive Summary report for investors and funders
  - it should live inside Reports as a first-class report, not as a hidden export or admin-only view
- New report card added:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/reportsCatalog.js`
  - new route key: `executive-summary`
- Main frontend report detail file upgraded:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/ReportDetail.jsx`
- UX direction for this pass:
  - keep language simple for managers and operators
  - use visuals to make trends easier to understand at a glance
  - keep tables for exact figures underneath the visuals
  - improve the Sales Summary page instead of making users piece the story together themselves
- New visual/reporting improvements:
  - stronger Sales Summary page with daily trend chart and clearer summary cards
  - Sales By Item chart for top-selling items
  - Sales By Category chart
  - Sales By Payment Type chart
  - Sales By Employee chart
  - Executive Summary page with:
    - headline KPI cards
    - sales trend
    - top item
    - main payment channel
    - best sales day
    - direct sale vs booking pickup mix
- Screenshot usage in this pass:
  - used the shared screenshots to identify which report types benefit from visuals
  - still did not copy the original visual style directly
- Local verification completed:
  - frontend build passed after adding the new charts and Executive Summary page
- What future Codex sessions should remember:
  - Executive Summary is now part of the core reporting plan
  - this is the first investor/funder-facing report layer, not the final grant/investor reporting suite
  - future reporting work should keep prioritizing clarity, plain language, and useful visuals over dense dashboards

## 19. 2026-04-07 Batch Policy And Inventory Control Slice

- After the first Reports expansion, the next roadmap slice implemented was the control layer around batches and inventory.
- Why this came next:
  - the V2 plan puts multi-batch inventory logic and control after the reporting center foundation
  - meeting 2 repeatedly stressed crack monitoring, batch performance against company policy, and easier management review
- New backend policy helper file:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/utils/operationsPolicy.js`
- Temporary policy assumptions now in code:
  - target profit per crate: NGN 500
  - temporary crack allowance threshold: 2%
  - this threshold is still provisional until operations confirms the final allowance
- Backend reporting updates:
  - expanded `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/reports.js`
  - added `GET /reports/operations`
  - new response areas:
    - `batchSummary`
    - `monthlySummary`
    - `inventoryControl`
- New reports added to the Reports center:
  - `Batch Summary`
  - `Inventory Control`
- Frontend reporting updates:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/reportsCatalog.js`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/ReportDetail.jsx`
- User-facing report behavior added:
  - Batch Summary now shows batch profit, policy target, variance, profit per crate, crack rate, and latest count issue
  - Inventory Control now shows active stock, flagged batches, crack alerts, and count discrepancies
- Batch analysis updates:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/batches.js`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/BatchDetail.jsx`
  - batch analysis now includes:
    - expected policy profit
    - variance to policy
    - profit per crate
    - cracked sold quantity/value
    - damaged write-offs
    - crack rate and alert state
- Inventory page updates:
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/api/src/routes/inventory.js`
  - `/Users/fiistephen/Downloads/Fresh Eggs Operations/fresh-eggs-ops/web/src/pages/Inventory.jsx`
  - inventory overview now shows crack-aware stock cards and highlights batches that exceed the current allowance
- Local verification completed:
  - `node --check` passed for `reports.js`, `inventory.js`, and `batches.js`
  - frontend build passed
- What future Codex sessions should remember:
  - this is a Phase 5 control slice, not the final multi-batch sale-sourcing rewrite yet
  - the current crack threshold in code is temporary and should be revisited when the final allowance is agreed
  - next likely high-value work after review is admin/configuration for policy settings or the deeper multi-batch fulfillment model
