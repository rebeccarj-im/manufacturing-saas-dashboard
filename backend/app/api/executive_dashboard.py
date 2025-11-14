# backend/app/api/executive_dashboard.py
from fastapi import APIRouter, Query
from typing import Literal, Dict, List, Optional, Tuple
import sqlite3, datetime as dt
from app.db.session import engine

router = APIRouter(tags=["executive-dashboard"])

# ---------- date helpers ----------
def month_floor(d: dt.date) -> dt.date:
    return d.replace(day=1)

def month_add(d: dt.date, months: int) -> dt.date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return dt.date(y, m, 1)

def to_quarter_label(ym: str) -> str:
    y, m = ym.split("-")
    q = (int(m) - 1) // 3 + 1
    return f"{y}-Q{q}"

def build_timeframe(range_: Literal["6m","12m"], granularity: Literal["month","quarter"]):
    """
    Compute time window aligned to full months.
    NOTE: For 6m/12m, the window is inclusive and contains exactly 6/12 months.
          Example (12m on Aug 2025): 2024-09-01 ~ 2025-08-31
    """
    today = dt.date.today()
    start_of_this_month = month_floor(today)
    end_date = month_add(start_of_this_month, 1) - dt.timedelta(days=1)  # end of current month
    months = 6 if range_ == "6m" else 12
    # start at -(months-1) to include the current month for a total of `months`
    start_date = month_add(start_of_this_month, -(months - 1))
    return {
        "range": range_,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "granularity": granularity,
    }

def list_periods(tf: Dict) -> List[str]:
    """List categorical x-axis labels for the timeframe in month or quarter granularity."""
    start = dt.date.fromisoformat(tf["start_date"]).replace(day=1)
    end = dt.date.fromisoformat(tf["end_date"]).replace(day=1)
    out: List[str] = []
    cur = start
    while cur <= end:
        ym = cur.strftime("%Y-%m")
        if tf["granularity"] == "month":
            out.append(ym)
        else:
            q = to_quarter_label(ym)
            if not out or out[-1] != q:
                out.append(q)
        cur = month_add(cur, 1)
    return out

def _conn() -> sqlite3.Connection:
    db_path = engine.url.database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def _sum(xs) -> float:
    return float(sum(xs)) if xs else 0.0

def _delta_dir(cur: float, prev: float) -> Tuple[Optional[float], str]:
    if prev == 0:
        return (None, "flat")
    frac = (cur - prev) / prev
    return (frac, "up" if frac > 0 else ("down" if frac < 0 else "flat"))

def _as_fraction(v: Optional[float]) -> float:
    """
    Normalize a rate that might be stored as 0–1 or 0–100 into a 0–1 fraction.
    None -> 0.0. Treat values <= 2 as already ratios (to allow NRR > 1).
    """
    try:
        fv = float(v)
    except Exception:
        return 0.0
    return fv if fv <= 2 else fv / 100.0

@router.get("/api/executive-dashboard")
def executive_dashboard(
    range: Literal["6m","12m"] = Query("12m"),
    granularity: Literal["month","quarter"] = Query("month"),
):
    tf = build_timeframe(range, granularity)
    start_ym = dt.date.fromisoformat(tf["start_date"]).strftime("%Y-%m")
    end_ym   = dt.date.fromisoformat(tf["end_date"]).strftime("%Y-%m")
    months = 6 if range == "6m" else 12

    with _conn() as conn:
        # ---- Revenue Trend (monthly rows → optional quarterly aggregation) ----
        rows = conn.execute(
            """
            SELECT period,
                   COALESCE(recognized,0) AS recognized,
                   COALESCE(booked,0)     AS booked,
                   COALESCE(backlog,0)    AS backlog
            FROM revenue_trend
            WHERE period BETWEEN ? AND ?
            ORDER BY period
            """,
            (start_ym, end_ym),
        ).fetchall()

        agg: Dict[str, Dict[str, float]] = {}
        for r in rows:
            label = r["period"] if granularity == "month" else to_quarter_label(r["period"])
            a = agg.setdefault(label, {"recognized": 0.0, "booked": 0.0, "backlog": 0.0})
            # Sum recognized/booked over months in the label bucket
            a["recognized"] += float(r["recognized"])
            a["booked"]     += float(r["booked"])
            # Backlog is period-end stock; quarter view should take the quarter-end value (last month wins)
            a["backlog"]     = float(r["backlog"])

        trend = [
            {"period": p, **agg.get(p, {"recognized": 0.0, "booked": 0.0, "backlog": 0.0})}
            for p in list_periods(tf)
        ]

        # ---- KPI bases (within selected window) ----
        sum_rec = _sum([t["recognized"] for t in trend])
        sum_book = _sum([t["booked"] for t in trend])
        end_backlog = float(rows[-1]["backlog"]) if rows else 0.0

        # Gross Margin (ratio 0–1)
        gm_row = conn.execute(
            "SELECT SUM(amount) AS amt, SUM(profit) AS pf FROM orders WHERE order_date BETWEEN ? AND ?",
            (tf["start_date"], tf["end_date"]),
        ).fetchone()
        gm_frac = (float(gm_row["pf"]) / float(gm_row["amt"])) if gm_row and gm_row["amt"] else 0.0

        # Uptime (ratio 0–1)
        up_row = conn.execute(
            "SELECT AVG(uptime) AS u FROM ops_uptime WHERE period BETWEEN ? AND ?",
            (start_ym, end_ym),
        ).fetchone()
        uptime = _as_fraction(up_row["u"]) if up_row else 0.0

        # NRR (ratio; may be >1) – latest available up to end_ym
        nrr_row = conn.execute(
            "SELECT nrr FROM retention_nrr WHERE period <= ? ORDER BY period DESC LIMIT 1",
            (end_ym,),
        ).fetchone()
        nrr = _as_fraction(nrr_row["nrr"]) if nrr_row else 1.0

        # Coverage Months = ending backlog / avg recognized of last 6 months (fixed denominator)
        trailing6 = conn.execute(
            """
            SELECT recognized FROM revenue_trend
            WHERE period <= ?
            ORDER BY period DESC
            LIMIT 6
            """,
            (end_ym,),
        ).fetchall()
        avg6 = _sum([float(r["recognized"]) for r in trailing6]) / (len(trailing6) or 1)
        coverage_months = float(end_backlog / avg6) if avg6 > 0 else 0.0

        # ARR = 12 × MRR, where MRR is end-month subscription/recurring sum
        arr_row = conn.execute(
            """
            SELECT SUM(amount) AS mrr
            FROM orders
            WHERE type IN ('subscription','recurring')
              AND strftime('%Y-%m', order_date) = ?
            """,
            (end_ym,),
        ).fetchone()
        arr = float(arr_row["mrr"]) * 12.0 if arr_row and arr_row["mrr"] else 0.0

        # Forecast:
        # Preferred: pipeline × win rate (requires monetary pipeline). Since our schema stores stage counts (not £),
        # we fall back to trailing 3-month average × 1.02 per spec.
        last3 = conn.execute(
            "SELECT recognized FROM revenue_trend ORDER BY period DESC LIMIT 3"
        ).fetchall()
        avg3 = _sum([float(r["recognized"]) for r in last3]) / (len(last3) or 1)
        forecast = avg3 * 1.02  # simple momentum uplift fallback

        book_to_bill = float(sum_book / sum_rec) if sum_rec > 0 else 1.0

        # Deltas vs previous same-length window (revenue & backlog)
        prev_start = month_add(dt.date.fromisoformat(tf["start_date"]), -months)
        prev_end   = month_add(month_floor(dt.date.fromisoformat(tf["end_date"])), -months)
        prev_end = month_add(prev_end, 1) - dt.timedelta(days=1)  # ensure prev_end is end-of-month
        prev_rows = conn.execute(
            """
            SELECT period, recognized, booked, backlog
            FROM revenue_trend
            WHERE period BETWEEN ? AND ?
            ORDER BY period
            """,
            (prev_start.strftime("%Y-%m"), prev_end.strftime("%Y-%m")),
        ).fetchall()
        prev_sum_rec = _sum([float(r["recognized"]) for r in prev_rows])
        prev_end_backlog = float(prev_rows[-1]["backlog"]) if prev_rows else 0.0
        rev_delta, rev_dir = _delta_dir(sum_rec, prev_sum_rec)
        bk_delta,  bk_dir  = _delta_dir(end_backlog, prev_end_backlog)

        executiveKpis = [
            {"key": "revenue",          "label": "Recognized Revenue", "value": round(sum_rec, 2), "unit": "£", "delta": rev_delta, "direction": rev_dir},
            {"key": "backlog",          "label": "Backlog",            "value": round(end_backlog, 2), "unit": "£", "delta": bk_delta, "direction": bk_dir},
            {"key": "uptime",           "label": "Uptime",             "value": round(uptime, 4), "delta": None, "direction": "flat"},          # ratio 0–1
            {"key": "nrr",              "label": "NRR",                "value": round(nrr, 4),    "delta": None, "direction": "flat"},          # ratio; may be >1
            {"key": "gm",               "label": "Gross Margin",       "value": round(gm_frac, 4), "delta": None, "direction": "flat"},         # ratio 0–1
            {"key": "payback",          "label": "Payback (mo)",       "value": 9.0, "unit": "mo", "delta": None, "direction": "flat"},         # MVP static
            {"key": "book_to_bill",     "label": "Book-to-Bill",       "value": round(book_to_bill, 2)},
            {"key": "coverage_months",  "label": "Coverage Months",    "value": round(coverage_months, 1)},
            {"key": "arr",              "label": "ARR",                "value": round(arr, 2), "unit": "£"},
            {"key": "forecast",         "label": "Forecast",           "value": round(forecast, 2), "unit": "£"},
        ]

        alerts = conn.execute(
            "SELECT id, type, title, description, severity, created_at FROM alerts ORDER BY created_at DESC LIMIT 6"
        ).fetchall()
        risks = conn.execute(
            "SELECT id, title, owner, due, mitigation, status FROM risks ORDER BY id DESC LIMIT 6"
        ).fetchall()

        revenueTrend = [{"period": t["period"], "recognized": t["recognized"], "booked": t["booked"], "backlog": t["backlog"]} for t in trend]

        return {
            "timeframe": tf,
            "executiveKpis": executiveKpis,
            "revenueTrend": revenueTrend,
            "alerts": [dict(a) for a in alerts],
            "risks": [dict(r) for r in risks],
        }
