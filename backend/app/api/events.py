# backend/app/api/events.py
from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
import sqlite3
from datetime import datetime
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
    db_path = engine.url.database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def _ensure_table(conn: sqlite3.Connection) -> None:
    """
    Align with the standard SQLite schema: only create the standard columns
    (event_type / event_time). Do not introduce non-standard columns such as
    payload / idempotency_key.
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            event_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Time index (consistent with the standard)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_events_time ON user_events(event_time)")
    conn.commit()

def _insert_event(conn: sqlite3.Connection, event_type: str, event_time: Optional[str]) -> None:
    if event_time:
        conn.execute(
            "INSERT INTO user_events(event_type, event_time) VALUES (?, ?)",
            (event_type, event_time),
        )
    else:
        # Use the column's DEFAULT CURRENT_TIMESTAMP
        conn.execute(
            "INSERT INTO user_events(event_type) VALUES (?)",
            (event_type,),
        )
    conn.commit()

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

    event_time = body.get("event_time")
    if event_time:
        # Tolerate ISO8601 with a trailing 'Z'; perform basic validation only, no reformatting
        try:
            datetime.fromisoformat(event_time.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="invalid event_time format")

    with _conn() as conn:
        _ensure_table(conn)
        _insert_event(conn, event_type, event_time)

    # Return according to the standard contract
    return {"status": "logged"}
