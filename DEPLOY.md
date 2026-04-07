# Fresh Eggs Operations — Deployment Guide

## Current production topology

Production currently runs in two separate VPS locations:

- Live backend Docker project: `/opt/fresh-eggs-ops`
- Git-tracked source clone: `/opt/fresh-eggs-market-src`
- Live frontend docroot: `/home/digivlrx/fresheggsmarket.hiddekellabs.com`

This split is intentional. The working production app stays where it is, while Git-based updates flow through the tracked clone.

## What must be preserved

The current production deployment is working and should not be replaced blindly.

These items stay in place during normal deploys:

- `/opt/fresh-eggs-ops/.env`
- `/opt/fresh-eggs-ops/docker-compose.yml`
- Docker project name and ports
- Existing PostgreSQL Docker volume
- `/home/digivlrx/fresheggsmarket.hiddekellabs.com/.htaccess`

## Safe Git-based workflow

The VPS clone is the tracked source of truth for server-side pulls:

```bash
cd /opt/fresh-eggs-market-src
git pull
```

Deploy from the clone into the existing live locations:

```bash
cd /opt/fresh-eggs-market-src
sudo bash scripts/deploy_vps.sh
```

Targeted deploys are also supported:

```bash
sudo bash scripts/deploy_vps.sh api
sudo bash scripts/deploy_vps.sh web
```

## What the deploy script does

`scripts/deploy_vps.sh` performs a production-safe sync:

1. Pulls the latest Git changes in `/opt/fresh-eggs-market-src`
2. Backs up the files it is about to replace
3. Syncs `api/` into `/opt/fresh-eggs-ops/api`
4. Rebuilds and restarts the live API container from `/opt/fresh-eggs-ops`
5. Builds the frontend in the clone
6. Syncs built frontend assets into the cPanel docroot

It does **not** overwrite the live `.env`, the live `docker-compose.yml`, the Postgres volume, frontend `.htaccess`, or frontend `.well-known`.

## First-time VPS setup

Prerequisites:

- Docker + Docker Compose plugin
- Node.js + npm
- `rsync`
- A GitHub deploy key configured for `/opt/fresh-eggs-market-src`

Useful checks:

```bash
docker --version
docker compose version
node -v
npm -v
rsync --version
```

## Database notes

The database lives in the existing Docker volume attached to the live project. Normal deploys do not replace or recreate that volume.

If a release includes Prisma schema changes, apply the database step deliberately after review. Do not assume every code deploy should mutate the database automatically.

Example manual DB command when needed:

```bash
cd /opt/fresh-eggs-ops
docker compose exec api npx prisma migrate deploy
```

If production is still using `db push`-style changes rather than checked-in migrations, handle that as an explicit release step instead of baking it into every deploy.

## Useful production commands

```bash
cd /opt/fresh-eggs-ops
docker compose ps
docker compose logs -f api
docker compose logs -f db
docker compose build api && docker compose up -d api
docker compose exec db pg_dump -U fresheggs fresh_eggs > backup_$(date +%Y%m%d).sql
```
