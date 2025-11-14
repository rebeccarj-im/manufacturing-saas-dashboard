# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os, importlib, logging

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(title="Executive Dashboard API", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # already includes Idempotency-Key
)

# Health check
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ---- Router mounting helper (logs reasons for optional modules; no silent failures) ----
def _mount_optional(module_path: str):
    try:
        mod = importlib.import_module(module_path)
        router = getattr(mod, "router")
        app.include_router(router)
        logging.info("Mounted router: %s", module_path)
    except Exception as e:
        logging.warning("Skip router %s due to error: %s", module_path, e)

# ===== Required: executive dashboard (fail fast to avoid a half-broken system) =====
from app.api.executive_dashboard import router as dashboard_router  # noqa: E402
app.include_router(dashboard_router)
logging.info("Mounted router: app.api.executive_dashboard")

# ===== Optional modules (mount if present; if missing or failing, log the reason) =====
_optional_modules = [
    "app.api.events",         # /api/events (direct-access variant)
    "app.api.alerts",         # /api/alerts
    "app.api.kpis",           # /api/kpis/{key} (legacy endpoint)
    "app.api.finance",        # /api/finance/...
    "app.api.sales",          # /api/sales/...
    "app.api.supply",         # /api/supply/...
    "app.api.manufacturing",  # /api/manufacturing/...
    "app.api.marketing",      # /api/marketing/...
    "app.api.quality_gates",  # /api/quality-gates (P95 + pass/fail)
    "app.api.ai_summary",
    "app.api.meetings",       # /api/meetings (calendar/meetings CRUD)
    "app.api.search",         # /api/search (global search)
    "app.api.messages",       # /api/messages (user messages/notifications)
    "app.api.users",          # /api/users (user profile and settings)
]

for mod in _optional_modules:
    _mount_optional(mod)
