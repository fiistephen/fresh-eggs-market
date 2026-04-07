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
