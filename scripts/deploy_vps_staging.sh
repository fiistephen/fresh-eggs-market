#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="${SRC_DIR:-/opt/fresh-eggs-market-src}"
WEB_ROOT="${WEB_ROOT:-/home/digivlrx/staging.fresheggsmarket.hiddekellabs.com}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/fresh-eggs-backups/staging}"
ENV_FILE="${ENV_FILE:-${SRC_DIR}/.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-${SRC_DIR}/docker-compose.staging.yml}"
PROJECT_NAME="${PROJECT_NAME:-fresh-eggs-staging}"
SKIP_PULL="${SKIP_PULL:-0}"
SEED="${SEED:-0}"

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/deploy_vps_staging.sh

Defaults:
  SRC_DIR=/opt/fresh-eggs-market-src
  WEB_ROOT=/home/digivlrx/staging.fresheggsmarket.hiddekellabs.com
  BACKUP_ROOT=/opt/fresh-eggs-backups/staging
  ENV_FILE=/opt/fresh-eggs-market-src/.env.staging
  COMPOSE_FILE=/opt/fresh-eggs-market-src/docker-compose.staging.yml
  PROJECT_NAME=fresh-eggs-staging

Optional flags via env vars:
  SKIP_PULL=1  Skip git pull
  SEED=1       Seed the staging database after schema sync
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

ensure_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

ensure_path() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    echo "Required path not found: $path" >&2
    exit 1
  fi
}

dc() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

main() {
  ensure_root

  require_cmd git
  require_cmd docker
  require_cmd npm
  require_cmd rsync

  ensure_path "${SRC_DIR}/.git"
  ensure_path "$ENV_FILE"
  ensure_path "$COMPOSE_FILE"
  ensure_path "$WEB_ROOT"

  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
    "")
      ;;
    *)
      echo "This script does not take positional arguments." >&2
      usage
      exit 1
      ;;
  esac

  if [[ "$SKIP_PULL" != "1" ]]; then
    echo "Pulling latest code into ${SRC_DIR}"
    git -C "$SRC_DIR" pull --ff-only
  fi

  local timestamp backup_dir
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_dir="${BACKUP_ROOT}/${timestamp}/web"
  mkdir -p "$backup_dir"

  echo "Backing up staging web root to ${backup_dir}"
  rsync -a "${WEB_ROOT}/" "${backup_dir}/"

  # CloudLinux / cPanel virtfs mounts Docker overlay2 layers into the
  # digivlrx user jail at /home/virtfs/digivlrx/var/lib/docker/overlay2/…
  # This pins the overlays and causes "device or resource busy" errors
  # when Docker tries to recreate containers. Unmount them preemptively.
  echo "Clearing stale virtfs overlay mounts (if any)"
  for mnt in $(mount | grep 'virtfs/digivlrx.*overlay2' | awk '{print $3}'); do
    umount "$mnt" 2>/dev/null && echo "  unmounted $mnt" || true
  done

  echo "Building and starting staging API/database"
  dc up -d --build

  echo "Applying Prisma schema to staging database"
  dc exec -T api npx prisma db push

  if [[ "$SEED" == "1" ]]; then
    echo "Seeding staging database"
    dc exec -T api node prisma/seed.js
  fi

  echo "Installing frontend dependencies"
  (cd "${SRC_DIR}/web" && npm ci)

  echo "Building staging frontend"
  (cd "${SRC_DIR}/web" && npm run build)

  echo "Syncing built frontend into staging docroot"
  rsync -a --delete \
    --exclude '.htaccess' \
    --exclude '.well-known' \
    "${SRC_DIR}/web/dist/" "${WEB_ROOT}/"

  chown -R digivlrx:digivlrx "$WEB_ROOT"

  cat <<EOF

Staging deploy finished.
URL: https://staging.fresheggsmarket.hiddekellabs.com
Backups: ${BACKUP_ROOT}/${timestamp}
Notes:
  - Staging uses separate containers, ports, and Postgres volume
  - Staging frontend .htaccess and .well-known were preserved
  - Production app and production database were not touched
EOF
}

main "$@"
