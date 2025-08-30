#!/usr/bin/env bash
set -euo pipefail

export PYTHONUNBUFFERED=1

# Enter the backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Normalize DB path to: backend/app/data/app.db
DB_PATH="${DB_PATH:-$SCRIPT_DIR/app/data/app.db}"
mkdir -p "$(dirname "$DB_PATH")"

# Compute absolute path; SQLAlchemy SQLite absolute URL needs four slashes
ABS_DB="$(python3 - <<'PY' "$DB_PATH"
import os,sys; print(os.path.abspath(sys.argv[1]))
PY
)"

# If DATABASE_URL is not provided, use the normalized path
export DATABASE_URL="${DATABASE_URL:-sqlite:////$ABS_DB}"

# session.py will auto-create tables and seed demo data; to force rebuild, start with RESET_DB=1
# Example: RESET_DB=1 ./dev.sh
export AUTO_BOOTSTRAP_DB="${AUTO_BOOTSTRAP_DB:-1}"

# Ensure proper Python package structure to avoid "No module named 'app'"
[ -f app/__init__.py ] || touch app/__init__.py

# Run backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
