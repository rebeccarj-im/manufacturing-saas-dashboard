# backend/app/api/manufacturing.py
from fastapi import APIRouter, Query
from typing import Literal, List, Dict, Optional
import sqlite3
import datetime as dt
from app.db.session import engine

router = APIRouter(prefix="/api/manufacturing", tags=["manufacturing"])

# ---------- DB ----------
def _conn() -> sqlite3.Connection:
    db_path = engine.url.database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# ---------- timeframe helpers ----------
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

def build_timeframe(
    range_: Literal["6m", "12m"],
    granularity: Literal["month", "quarter"]
):
    """
    Period end: end of the current month (inclusive).
    Period start: go back 5/11 months so the window contains exactly 6/12 full months
    (inclusive of the first and last day).
    """
    today = dt.date.today()
    end_date = month_add(month_floor(today), 1) - dt.timedelta(days=1)
    months = 6 if range_ == "6m" else 12
    start_date = month_add(month_floor(today), -(months - 1))
    return {
        "range": range_,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "granularity": granularity,
    }

def periods(tf: Dict) -> List[str]:
    """
    Return the sequence of periods within the window:
    - month: YYYY-MM
    - quarter: YYYY-Qn (bucketed by the last month within the quarter)
    """
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

# ---------- value helpers ----------
def _as_fraction(v) -> float:
    """Normalize 0–1 or 0–100 values to 0–1; None/errors -> 0."""
    try:
        f = float(v)
    except Exception:
        return 0.0
    return f if f <= 1.5 else f / 100.0

def _to_percent(v) -> float:
    """Any ratio form -> percentage 0–100."""
    return _as_fraction(v) * 100.0

def _agg_avg(
    rows: List[sqlite3.Row] | List[Dict[str, float]],
    keys: List[str],
    granularity: str,
    tf_periods: List[str]
) -> Dict[str, Dict[str, float]]:
    """
    Bucket and average the given keys by month/quarter.
    `rows` must contain 'period' plus each key in `keys`.
    Returns: {period: {k: avg, ...}, ...} containing only periods present in `tf_periods`.
    """
    agg: Dict[str, Dict[str, float]] = {}
    cnt: Dict[str, int] = {}
    for r in rows:
        p = r["period"] if isinstance(r, sqlite3.Row) else r.get("period")  # type: ignore
        if not isinstance(p, str):
            continue
        p = p if granularity == "month" else to_quarter_label(p)
        if p not in tf_periods:
            continue
        a = agg.setdefault(p, {k: 0.0 for k in keys})
        for k in keys:
            v = float(r[k] if isinstance(r, sqlite3.Row) else (r.get(k) or 0.0))  # type: ignore
            a[k] += v
        cnt[p] = cnt.get(p, 0) + 1

    for p in list(agg.keys()):
        c = max(1, cnt.get(p, 1))
        for k in keys:
            agg[p][k] = agg[p][k] / c
    return agg

# =====================================================
# Overview
# =====================================================
@router.get("/overview")
def manufacturing_overview(
    range: Literal["6m", "12m"] = Query("12m"),
    granularity: Literal["month", "quarter"] = Query("month"),
):
    tf = build_timeframe(range, granularity)
    tf_ps = periods(tf)

    with _conn() as conn:
        # uptime (convert to percentage)
        up_rows_raw = conn.execute(
            "SELECT period, uptime FROM ops_uptime ORDER BY period"
        ).fetchall()
        up_rows = [
            {"period": r["period"], "uptime": _to_percent(r["uptime"])}
            for r in up_rows_raw
        ]
        up_agg = _agg_avg(up_rows, ["uptime"], granularity, tf_ps)

        # reliability (hours)
        rel_rows = conn.execute(
            "SELECT period, COALESCE(mtbf_hours,0) AS mtbf, COALESCE(mttr_hours,0) AS mttr "
            "FROM ops_reliability ORDER BY period"
        ).fetchall()
        rel_agg = _agg_avg(rel_rows, ["mtbf", "mttr"], granularity, tf_ps)

        # quality (convert to percentage)
        q_rows_raw = conn.execute(
            "SELECT period, doa_pct AS doa, defect_pct AS defect, warranty_pct AS warranty "
            "FROM ops_quality ORDER BY period"
        ).fetchall()
        q_rows = [
            {
                "period": r["period"],
                "doa": _to_percent(r["doa"]),
                "defect": _to_percent(r["defect"]),
                "warranty": _to_percent(r["warranty"]),
            }
            for r in q_rows_raw
        ]
        q_agg = _agg_avg(q_rows, ["doa", "defect", "warranty"], granularity, tf_ps)

        # service cost (currency)
        c_rows = conn.execute(
            "SELECT period, COALESCE(cost_per_device,0) AS cost_per_device "
            "FROM ops_service_cost ORDER BY period"
        ).fetchall()
        c_agg = _agg_avg(c_rows, ["cost_per_device"], granularity, tf_ps)

        def _avg_of(agg: Dict[str, Dict[str, float]], key: str) -> float:
            vals = [agg[p][key] for p in tf_ps if p in agg]
            return (sum(vals) / max(1, len(vals))) if vals else 0.0

        kpis = [
            {"key": "uptime", "label": "Uptime", "value": round(_avg_of(up_agg, "uptime"), 3), "unit": "%"},
            {"key": "mtbf", "label": "MTBF (hours)", "value": round(_avg_of(rel_agg, "mtbf"), 1), "unit": "h"},
            {"key": "mttr", "label": "MTTR (hours)", "value": round(_avg_of(rel_agg, "mttr"), 1), "unit": "h"},
            {"key": "doa", "label": "DOA %", "value": round(_avg_of(q_agg, "doa"), 2), "unit": "%"},
            {"key": "defect", "label": "Defect %", "value": round(_avg_of(q_agg, "defect"), 2), "unit": "%"},
            {"key": "warranty", "label": "Warranty %", "value": round(_avg_of(q_agg, "warranty"), 2), "unit": "%"},
            {"key": "cost_per_device", "label": "Service Cost / Device", "value": round(_avg_of(c_agg, "cost_per_device"), 2), "unit": "£"},
        ]

        qualityTrend = [
            {
                "period": p,
                "doa": round(q_agg.get(p, {}).get("doa", 0.0), 2),
                "defect": round(q_agg.get(p, {}).get("defect", 0.0), 2),
                "warranty": round(q_agg.get(p, {}).get("warranty", 0.0), 2),
            }
            for p in tf_ps
        ]

        reliabilityTrend = [
            {
                "period": p,
                "mtbf": round(rel_agg.get(p, {}).get("mtbf", 0.0), 1),
                "mttr": round(rel_agg.get(p, {}).get("mttr", 0.0), 1),
            }
            for p in tf_ps
        ]

        costTrend = [
            {
                "period": p,
                "cost_per_device": round(c_agg.get(p, {}).get("cost_per_device", 0.0), 2),
            }
            for p in tf_ps
        ]

        # breakdown by fault_type (devices)
        bd_rows = conn.execute(
            "SELECT COALESCE(fault_type,'Unknown') AS name, COUNT(*) AS cnt "
            "FROM devices GROUP BY COALESCE(fault_type,'Unknown') ORDER BY cnt DESC"
        ).fetchall()
        total = sum(int(r["cnt"]) for r in bd_rows) or 1
        breakdown = [
            {"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"]) / total}
            for r in bd_rows
        ]

        return {
            "timeframe": tf,
            "kpis": kpis,
            "qualityTrend": qualityTrend,
            "reliabilityTrend": reliabilityTrend,
            "costTrend": costTrend,
            "breakdown": breakdown,
        }

# =====================================================
# Drilldown
# =====================================================
@router.get("/kpis/{key}")
def manufacturing_kpi_drilldown(
    key: Literal["uptime", "mtbf", "mttr", "doa", "defect", "warranty", "cost_per_device"],
    range: Literal["6m", "12m"] = Query("12m"),
    granularity: Literal["month", "quarter"] = Query("month"),
    by: Literal["fault_type", "device_type"] = Query("fault_type"),
):
    tf = build_timeframe(range, granularity)
    tf_ps = periods(tf)

    with _conn() as conn:
        unit: Optional[str] = None
        series: List[Dict[str, float]] = []

        if key == "uptime":
            unit = "%"
            rows_raw = conn.execute(
                "SELECT period, uptime FROM ops_uptime ORDER BY period"
            ).fetchall()
            rows = [{"period": r["period"], "uptime": _to_percent(r["uptime"])} for r in rows_raw]
            agg = _agg_avg(rows, ["uptime"], granularity, tf_ps)
            series = [{"period": p, "uptime": round(agg.get(p, {}).get("uptime", 0.0), 3)} for p in tf_ps]

        elif key in ("mtbf", "mttr"):
            unit = "h"
            rows = conn.execute(
                "SELECT period, COALESCE(mtbf_hours,0) AS mtbf, COALESCE(mttr_hours,0) AS mttr "
                "FROM ops_reliability ORDER BY period"
            ).fetchall()
            agg = _agg_avg(rows, ["mtbf", "mttr"], granularity, tf_ps)
            series = [{"period": p, key: round(agg.get(p, {}).get(key, 0.0), 1)} for p in tf_ps]

        elif key in ("doa", "defect", "warranty"):
            unit = "%"
            rows_raw = conn.execute(
                "SELECT period, doa_pct AS doa, defect_pct AS defect, warranty_pct AS warranty "
                "FROM ops_quality ORDER BY period"
            ).fetchall()
            rows = [
                {
                    "period": r["period"],
                    "doa": _to_percent(r["doa"]),
                    "defect": _to_percent(r["defect"]),
                    "warranty": _to_percent(r["warranty"]),
                }
                for r in rows_raw
            ]
            agg = _agg_avg(rows, ["doa", "defect", "warranty"], granularity, tf_ps)
            series = [{"period": p, key: round(agg.get(p, {}).get(key, 0.0), 2)} for p in tf_ps]

        elif key == "cost_per_device":
            unit = "£"
            rows = conn.execute(
                "SELECT period, COALESCE(cost_per_device,0) AS cost_per_device "
                "FROM ops_service_cost ORDER BY period"
            ).fetchall()
            agg = _agg_avg(rows, ["cost_per_device"], granularity, tf_ps)
            series = [{"period": p, "cost_per_device": round(agg.get(p, {}).get("cost_per_device", 0.0), 2)} for p in tf_ps]

        # breakdown
        if by == "fault_type":
            bd_rows = conn.execute(
                "SELECT COALESCE(fault_type,'Unknown') AS name, COUNT(*) AS cnt "
                "FROM devices GROUP BY COALESCE(fault_type,'Unknown') ORDER BY cnt DESC"
            ).fetchall()
        else:
            bd_rows = conn.execute(
                "SELECT COALESCE(type,'Unknown') AS name, COUNT(*) AS cnt "
                "FROM devices GROUP BY COALESCE(type,'Unknown') ORDER BY cnt DESC"
            ).fetchall()

        total = sum(int(r["cnt"]) for r in bd_rows) or 1
        breakdown = [
            {"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"]) / total}
            for r in bd_rows
        ]

        return {
            "timeframe": tf,
            "metric": key,
            "series": series,
            "breakdown": breakdown,
            "unit": unit,
        }
