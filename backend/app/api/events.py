# backend/app/api/events.py
from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
import sqlite3
import json
from datetime import datetime, timezone
from app.db.session import engine

router = APIRouter(prefix="/api", tags=["events"])

# Event types supported in the MVP (from the standard spec)
ALLOWED_EVENTS = {
    "switch_range_or_granularity",
    "drilldown",
    "alert_click",
    "export_csv",
}

# ---- DB helpers ----
def _conn() -> sqlite3.Connection:
    """
    Open a concurrency-friendly SQLite connection.
    - WAL journal for better read/write concurrency
    - busy_timeout to reduce 'database is locked' errors under load
    """
    db_path = engine.url.database
    conn = sqlite3.connect(db_path, timeout=5, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.row_factory = sqlite3.Row
    return conn

def _ensure_tables(conn: sqlite3.Connection) -> None:
    """
    Keep the standard user_events table unchanged (no DEFAULT needed),
    and add a side table for RUM meta metrics (acceptance measurements).
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            event_time  DATETIME NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_events_time ON user_events(event_time)")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_event_meta (
            event_id INTEGER NOT NULL REFERENCES user_events(id) ON DELETE CASCADE,
            metric   TEXT NOT NULL,
            v        REAL,
            raw      TEXT,
            PRIMARY KEY (event_id, metric)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_eventmeta_metric ON user_event_meta(metric)")
    conn.commit()

def _normalize_event_time(event_time_in: Optional[str]) -> str:
    """
    Normalize incoming event_time to UTC 'YYYY-MM-DD HH:MM:SS'.
    - Accepts ISO8601 with/without 'Z' / timezone offset.
    - If missing, use current UTC time.
    """
    if not event_time_in:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    try:
        dt = datetime.fromisoformat(str(event_time_in).replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid event_time format")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    return dt.strftime("%Y-%m-%d %H:%M:%S")

def _insert_event(cur: sqlite3.Cursor, event_type: str, event_time_str: str) -> int:
    """
    Insert the event row and return its auto-incremented ID.
    Always writes event_time explicitly to avoid relying on table DEFAULT.
    """
    cur.execute(
        "INSERT INTO user_events(event_type, event_time) VALUES (?, ?)",
        (event_type, event_time_str),
    )
    return cur.lastrowid

def _insert_meta(cur: sqlite3.Cursor, event_id: int, meta: Any) -> None:
    """
    Persist meta metrics.

    Accepts either:
      A) {"metric":"ttfb_ms","v":123}
      B) {"ttfb_ms":123,"render_total_ms":860}

    Stores the numeric value in 'v' (REAL) and the original payload in 'raw'.
    Non-dict meta is ignored.
    """
    if not meta:
        return

    def _to_float(x):
        return float(x) if isinstance(x, (int, float)) else None

    if isinstance(meta, dict) and "metric" in meta and "v" in meta:
        m, v = str(meta["metric"]), _to_float(meta["v"])
        cur.execute(
            "INSERT OR REPLACE INTO user_event_meta(event_id, metric, v, raw) VALUES (?,?,?,?)",
            (event_id, m, v, json.dumps(meta)),
        )
    elif isinstance(meta, dict):
        for k, v in meta.items():
            cur.execute(
                "INSERT OR REPLACE INTO user_event_meta(event_id, metric, v, raw) VALUES (?,?,?,?)",
                (event_id, str(k), _to_float(v), json.dumps({k: v})),
            )
    # silently ignore non-dict meta

@router.post("/events")
def record_event(body: Dict[str, Any]):
    """
    Standard request example:
    { "event_type": "drilldown", "event_time": "2025-08-21T12:00:00Z", "meta": { "key": "revenue" } }

    Standard response:
    { "status": "logged" }
    """
    event_type = body.get("event_type")
    if not isinstance(event_type, str) or not event_type:
        raise HTTPException(status_code=400, detail="event_type is required")
    if event_type not in ALLOWED_EVENTS:
        raise HTTPException(status_code=400, detail="invalid event_type")

    event_time_str = _normalize_event_time(body.get("event_time"))
    meta = body.get("meta")

    with _conn() as conn:
        _ensure_tables(conn)
        cur = conn.cursor()
        try:
            cur.execute("BEGIN")
            event_id = _insert_event(cur, event_type, event_time_str)
            _insert_meta(cur, event_id, meta)
            conn.commit()
        except Exception as e:
            conn.rollback()
            # Surface a clean 500 while keeping server logs meaningful
            raise HTTPException(status_code=500, detail="failed to record event") from e

    return {"status": "logged"}
