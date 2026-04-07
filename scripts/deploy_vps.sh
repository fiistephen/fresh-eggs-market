#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="${SRC_DIR:-/opt/fresh-eggs-market-src}"
LIVE_DIR="${LIVE_DIR:-/opt/fresh-eggs-ops}"
WEB_ROOT="${WEB_ROOT:-/home/digivlrx/fresheggsmarket.hiddekellabs.com}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/fresh-eggs-backups}"
SKIP_PULL="${SKIP_PULL:-0}"
TARGET="${1:-all}"

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/deploy_vps.sh [api|web|all]

Defaults:
  SRC_DIR=/opt/fresh-eggs-market-src
  LIVE_DIR=/opt/fresh-eggs-ops
  WEB_ROOT=/home/digivlrx/fresheggsmarket.hiddekellabs.com
  BACKUP_ROOT=/opt/fresh-eggs-backups

Behavior:
  - Pulls the latest code into the tracked VPS clone unless SKIP_PULL=1
  - Backs up the files it is about to replace
  - Syncs API code into the existing live Docker project
  - Builds the frontend and syncs the static output into the cPanel docroot
  - Preserves the live .env, docker-compose.yml, database volume, and .htaccess

Examples:
  sudo bash scripts/deploy_vps.sh
  sudo bash scripts/deploy_vps.sh api
  sudo SKIP_PULL=1 bash scripts/deploy_vps.sh web
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

backup_dir() {
  local source_dir="$1"
  local backup_dir="$2"

  mkdir -p "$backup_dir"
  rsync -a "$source_dir"/ "$backup_dir"/
}

sync_api() {
  local timestamp="$1"
  local backup_dir="${BACKUP_ROOT}/${timestamp}/api"

  echo "Backing up live API to ${backup_dir}"
  backup_dir "${LIVE_DIR}/api" "$backup_dir"

  echo "Syncing API code into live app directory"
  rsync -a --delete \
    --exclude 'node_modules' \
    "${SRC_DIR}/api/" "${LIVE_DIR}/api/"

  echo "Rebuilding and restarting API container"
  (
    cd "$LIVE_DIR"
    docker compose build api
    docker compose up -d api
  )

  echo "API deploy complete"
}

sync_web() {
  local timestamp="$1"
  local backup_dir="${BACKUP_ROOT}/${timestamp}/web"

  echo "Backing up live web root to ${backup_dir}"
  backup_dir "$WEB_ROOT" "$backup_dir"

  echo "Installing frontend dependencies"
  (cd "${SRC_DIR}/web" && npm ci)

  echo "Building frontend"
  (cd "${SRC_DIR}/web" && npm run build)

  echo "Syncing built frontend into docroot"
  rsync -a --delete \
    --exclude '.htaccess' \
    --exclude '.well-known' \
    "${SRC_DIR}/web/dist/" "${WEB_ROOT}/"

  echo "Web deploy complete"
}

main() {
  ensure_root

  require_cmd git
  require_cmd rsync
  require_cmd docker
  require_cmd npm

  ensure_path "${SRC_DIR}/.git"
  ensure_path "${LIVE_DIR}/api"
  ensure_path "${LIVE_DIR}/docker-compose.yml"
  ensure_path "${LIVE_DIR}/.env"
  ensure_path "${WEB_ROOT}"

  case "$TARGET" in
    api|web|all) ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown target: $TARGET" >&2
      usage
      exit 1
      ;;
  esac

  if [[ "$SKIP_PULL" != "1" ]]; then
    echo "Pulling latest code into ${SRC_DIR}"
    git -C "$SRC_DIR" pull --ff-only
  fi

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "${BACKUP_ROOT}/${timestamp}"

  case "$TARGET" in
    api)
      sync_api "$timestamp"
      ;;
    web)
      sync_web "$timestamp"
      ;;
    all)
      sync_api "$timestamp"
      sync_web "$timestamp"
      ;;
  esac

  cat <<EOF

Deploy finished.
Backups: ${BACKUP_ROOT}/${timestamp}
Notes:
  - Live .env was preserved
  - Live docker-compose.yml was preserved
  - Existing Postgres Docker volume was not touched
  - Frontend .well-known and .htaccess were preserved
  - Prisma schema changes still need an explicit DB migration/push step when required
EOF
}

main "$@"
