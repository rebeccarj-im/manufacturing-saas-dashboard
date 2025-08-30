#!/usr/bin/env bash
set -euo pipefail

# ========= config =========
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# Your actual paths
DB_PATH="${DB_PATH:-backend/app/data/app.db}"
SCHEMA_PATH="${SCHEMA_PATH:-backend/app/db/sql/init_schema.sql}"
DATA_PATH="${DATA_PATH:-backend/app/db/sql/init_data.sql}"

DB_RESET="${DB_RESET:-0}"   # Set to 1 to force rebuild
# =========================

log() { printf "\033[1;36m[start]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ---- Preflight checks ----
if ! have "$PYTHON_BIN"; then err "Cannot find $PYTHON_BIN"; exit 1; fi
if ! have node; then err "Cannot find node (need >=18)"; exit 1; fi
if ! have sqlite3; then err "Cannot find sqlite3 (used to initialize the database)"; exit 1; fi

# Choose a package manager
PKG=""
if have pnpm; then PKG="pnpm"
elif have yarn; then PKG="yarn"
elif have npm; then PKG="npm"
else err "No package manager found (pnpm/yarn/npm)"; exit 1
fi

# ---- Utility: wait for service readiness ----
wait_for_tcp() {
  local host="$1" port="$2" name="$3" timeout="${4:-60}"
  local start_ts=$(date +%s)
  while true; do
    if "$PYTHON_BIN" - "$host" "$port" >/dev/null 2>&1 <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.5)
try:
    s.connect((sys.argv[1], int(sys.argv[2])))
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
    then
      log "✅ $name ready (tcp: $host:$port)"
      break
    fi
    if [ $(( $(date +%s) - start_ts )) -ge "$timeout" ]; then
      err "$name did not become ready within ${timeout}s (tcp: $host:$port)"
      return 1
    fi
    sleep 0.3
  done
}

wait_for_http() {
  local url="$1" name="$2" timeout="${3:-90}"
  if have curl; then
    local start_ts=$(date +%s)
    while true; do
      if curl -fsS "$url" >/dev/null 2>&1; then
        log "✅ $name ready (http: $url)"
        break
      fi
      if [ $(( $(date +%s) - start_ts )) -ge "$timeout" ]; then
        err "$name did not become ready within ${timeout}s (http: $url)"
        return 1
      fi
      sleep 0.5
    done
  else
    # Fallback to TCP probe
    # Naively extract host and port from URL (assumes http://host:port/...)
    local host_port="${url#*://}"
    host_port="${host_port%%/*}"
    local host="${host_port%%:*}"
    local port="${host_port##*:}"
    wait_for_tcp "$host" "$port" "$name" "$timeout"
  fi
}

# ---- Initialize database (if needed) ----
init_db_if_needed() {
  ABS_DB="$("$PYTHON_BIN" - <<'PY' "$DB_PATH"
import os,sys
print(os.path.abspath(sys.argv[1]))
PY
)"
  DB_DIR="$(dirname "$DB_PATH")"
  mkdir -p "$DB_DIR"

  if [ "$DB_RESET" = "1" ] || [ ! -f "$DB_PATH" ]; then
    log "🔄 Rebuilding database: $DB_PATH"
    rm -f "$DB_PATH"

    if [ ! -f "$SCHEMA_PATH" ]; then err "Schema file not found: $SCHEMA_PATH"; exit 1; fi
    if [ ! -f "$DATA_PATH" ]; then err "Data file not found: $DATA_PATH"; exit 1; fi

    log "🧱 Applying schema: $SCHEMA_PATH"
    sqlite3 "$DB_PATH" < "$SCHEMA_PATH"

    log "📥 Importing seed data: $DATA_PATH"
    sqlite3 "$DB_PATH" < "$DATA_PATH"

    log "🔎 Verify: show executive_kpis row count"
    sqlite3 "$DB_PATH" "SELECT COUNT(*) AS kpi_rows FROM executive_kpis;" | awk '{print "    executive_kpis rows = " $0}'
  else
    log "✅ Database exists, skipping init (to rebuild: DB_RESET=1 ./start.sh)"
  fi

  export DATABASE_URL="sqlite:////$ABS_DB"
  log "DATABASE_URL=$DATABASE_URL"
}

init_db_if_needed

# ---- Start backend ----
log "Preparing backend dependencies (backend/.venv)"
cd backend

[ -f app/__init__.py ] || touch app/__init__.py

if [ ! -d ".venv" ]; then
  log "Creating virtual environment backend/.venv"
  "$PYTHON_BIN" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip wheel >/dev/null
log "Installing backend requirements"
pip install -r requirements.txt >/dev/null

mkdir -p data

log "Starting backend : http://localhost:${BACKEND_PORT}"
# Force unbuffered logs for easier debugging
PYTHONUNBUFFERED=1 uvicorn app.main:app --reload --host 0.0.0.0 --port "${BACKEND_PORT}" &
BACK_PID=$!

deactivate || true
cd ..

# Wait for backend port to be ready (avoid first-screen API failures)
wait_for_tcp "127.0.0.1" "$BACKEND_PORT" "Backend (Uvicorn)" 90 || true
# If your backend has /health or /openapi.json, uncomment either line for stronger checks:
# wait_for_http "http://localhost:${BACKEND_PORT}/health" "Backend health check" 90 || true
# wait_for_http "http://localhost:${BACKEND_PORT}/openapi.json" "Backend OpenAPI" 90 || true

# ---- Start frontend ----
log "Preparing frontend dependencies (frontend/${PKG})"
cd frontend
if [ ! -d "node_modules" ]; then
  log "Installing frontend dependencies (${PKG} install)"
  if [ "$PKG" = "pnpm" ]; then pnpm install
  elif [ "$PKG" = "yarn" ]; then yarn install
  else npm install
  fi
fi

# If your frontend needs to know the backend address, export it here (depends on your code)
# export VITE_API_BASE_URL="http://localhost:${BACKEND_PORT}"

log "Starting frontend : http://localhost:${FRONTEND_PORT}"
# Disable frontend's auto-open behavior (varies by package manager)
export BROWSER=none

if [ "$PKG" = "pnpm" ]; then pnpm dev -- --port "${FRONTEND_PORT}" --host &
elif [ "$PKG" = "yarn" ]; then yarn dev --port "${FRONTEND_PORT}" --host &
else npm run dev -- --port "${FRONTEND_PORT}" --host &
fi
FRONT_PID=$!
cd ..

# Wait until the frontend home is accessible before opening the browser
wait_for_http "http://localhost:${FRONTEND_PORT}" "Frontend (Vite)" 120 || true

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true
  fi
}
log "Open: http://localhost:${FRONTEND_PORT}"
open_url "http://localhost:${FRONTEND_PORT}"

cleanup() {
  log "Shutting down services..."
  kill "${BACK_PID}" >/dev/null 2>&1 || true
  kill "${FRONT_PID}" >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

# Main loop: exit when either side quits
while true; do
  if kill -0 "${BACK_PID}" >/dev/null 2>&1 && kill -0 "${FRONT_PID}" >/dev/null 2>&1; then
    sleep 1
    continue
  fi
  break
done
