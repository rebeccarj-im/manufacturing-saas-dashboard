# backend/app/api/quality_gates.py
from fastapi import APIRouter, Query, HTTPException
import sqlite3
from typing import List, Optional, Dict, Any
from app.db.session import engine

router = APIRouter(prefix="/api", tags=["quality"])

# Acceptance targets (P95 thresholds)
TARGETS: Dict[str, float] = {
    "ttfb_ms": 300.0,
    "render_total_ms": 1000.0,
    "switch_latency_ms": 200.0,
    "alerts_poll_interval_ms": 30000.0,  # 30s
}

# Default event types to consider if none provided
DEFAULT_EVENT_TYPES: List[str] = [
    "switch_range_or_granularity",
    "drilldown",
    "alert_click",
]

# Tolerance for poll interval jitter (± milliseconds)
ALERTS_INTERVAL_TOLERANCE_MS: float = 2000.0  # 2 seconds


def _connect() -> sqlite3.Connection:
    """
    Open a read-only style connection for analytics queries.
    (No WAL/busy settings are required for read-only aggregation.)
    """
    db_path = engine.url.database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _q95(
    db: sqlite3.Connection, metric: str, event_types: List[str], days: int
) -> Dict[str, Any]:
    """
    Compute p95 for a metric over the given time window and event types.

    We read the normalized numeric value from user_event_meta.v,
    which is populated by /api/events regardless of meta format.
    """
    if not event_types:
        return {"p95": None, "count": 0, "last_sample_at": None}

    placeholders = ",".join("?" for _ in event_types)
    sql = f"""
    WITH raw AS (
      SELECT
        m.v AS v,
        e.event_time AS ts
      FROM user_event_meta m
      JOIN user_events e ON e.id = m.event_id
      WHERE m.metric = ?
        AND e.event_type IN ({placeholders})
        AND e.event_time >= datetime('now', ?)
        AND m.v IS NOT NULL
    ),
    ord AS (
      SELECT
        v,
        ts,
        ROW_NUMBER() OVER (ORDER BY v) AS rn,
        COUNT(*) OVER () AS cnt,
        MAX(ts) OVER () AS last_ts
      FROM raw
    )
    SELECT v AS p95, cnt AS count, last_ts
    FROM ord
    WHERE rn >= 0.95 * cnt
    ORDER BY rn
    LIMIT 1;
    """
    args = [metric, *event_types, f"-{days} days"]
    cur = db.execute(sql, args)
    row = cur.fetchone()
    if not row:
        return {"p95": None, "count": 0, "last_sample_at": None}
    return {
        "p95": row["p95"],
        "count": row["count"],
        "last_sample_at": row["last_ts"],
    }


@router.get("/quality-gates")
def quality_gates(
    days: int = Query(7, ge=1, le=90, description="Lookback window in days"),
    event_types: Optional[str] = Query(
        None, description="Comma-separated event types (default: typical dashboard events)"
    ),
    min_samples: int = Query(
        20, ge=1, le=10000, description="Minimum samples required to evaluate pass/fail"
    ),
):
    """
    Returns pass/fail booleans and p95 values for acceptance metrics.

    Response example:
    {
      "status": {"ttfb_ms": true, "render_total_ms": false, ...},
      "p95": {"ttfb_ms": 123.0, ...},
      "counts": {"ttfb_ms": 42, ...},
      "last_sample_at": {"ttfb_ms": "2025-09-11 12:34:56", ...},
      "targets": {...},
      "window_days": 7,
      "event_types": ["switch_range_or_granularity", "drilldown"],
      "min_samples": 20
    }
    """
    try:
        evts: List[str] = (
            [e.strip() for e in event_types.split(",") if e.strip()]
            if event_types
            else DEFAULT_EVENT_TYPES
        )

        db = _connect()

        p95_map: Dict[str, Optional[float]] = {}
        status_map: Dict[str, Optional[bool]] = {}
        counts_map: Dict[str, int] = {}
        last_ts_map: Dict[str, Optional[str]] = {}

        for metric, threshold in TARGETS.items():
            res = _q95(db, metric, evts, days)
            p95_val = res["p95"]
            cnt = int(res["count"] or 0)
            last_ts = res["last_sample_at"]

            p95_map[metric] = p95_val
            counts_map[metric] = cnt
            last_ts_map[metric] = last_ts

            if p95_val is None or cnt < min_samples:
                status_map[metric] = False
            else:
                if metric == "alerts_poll_interval_ms":
                    # Accept within ± tolerance around target interval
                    status_map[metric] = abs(p95_val - threshold) <= ALERTS_INTERVAL_TOLERANCE_MS
                else:
                    # Inclusive threshold (≤) to avoid failing exactly-at-target cases
                    status_map[metric] = p95_val <= threshold

        return {
            "status": status_map,
            "p95": p95_map,
            "counts": counts_map,
            "last_sample_at": last_ts_map,
            "targets": TARGETS,
            "window_days": days,
            "event_types": evts,
            "min_samples": min_samples,
            "tolerance_ms": {"alerts_poll_interval_ms": ALERTS_INTERVAL_TOLERANCE_MS},
        }
    except Exception as e:
        # Surface a clean 500 error message
        raise HTTPException(status_code=500, detail="failed to compute quality gates") from e
    finally:
        try:
            db.close()  # type: ignore[name-defined]
        except Exception:
            pass
