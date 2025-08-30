#!/usr/bin/env bash
set -euo pipefail
echo "[setup] The DB will be created and seeded with demo data on first run (path: backend/app/data/app.db)."
echo "[setup] To start only the backend, run: ./dev.sh"
echo "[setup] To force a DB rebuild: RESET_DB=1 ./dev.sh"
