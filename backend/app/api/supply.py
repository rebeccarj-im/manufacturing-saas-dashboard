# backend/app/api/supply.py
from fastapi import APIRouter, Query
from typing import Literal, List, Dict, Optional
import sqlite3, datetime as dt
from app.db.session import engine

router = APIRouter(prefix="/api/supply", tags=["supply"])

# ---------- DB helper ----------
def _conn() -> sqlite3.Connection:
    db_path = engine.url.database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# ---------- timeframe helpers ----------
Range = Literal["6m", "12m"]
Gran = Literal["month", "quarter"]

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

def build_timeframe(range_: Range, granularity: Gran):
    # Align with other modules: window is aligned to full months.
    # End = end of the current month; start = first day of the month 6/12 months ago (inclusive).
    today = dt.date.today()
    end_date = month_add(month_floor(today), 1) - dt.timedelta(days=1)   # end of this month
    months = 6 if range_ == "6m" else 12
    start_date = month_add(month_floor(today), -months)                  # inclusive start month
    return {
        "range": range_,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "granularity": granularity,
    }

def list_periods(tf: Dict) -> List[str]:
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

# =========================================================
# 1) Supply Overview
# =========================================================
@router.get("/overview")
def supply_overview(
    range: Range = Query("12m"),
    granularity: Gran = Query("month"),
):
    tf = build_timeframe(range, granularity)
    want_list = list_periods(tf)
    want = set(want_list)

    with _conn() as conn:
        # ---- KPIs ----
        # COGS total (summed from the static breakdown table)
        br_rows = conn.execute(
            "SELECT component, cost FROM supply_cogs_breakdown"
        ).fetchall()
        cogs_total = sum(float(r["cost"] or 0) for r in br_rows)

        # Note: the period columns in these tables are YYYY-MM
        lead_rows = conn.execute(
            "SELECT period, lead_time_days FROM supply_lead_time "
            "WHERE period BETWEEN ? AND ? ORDER BY period",
            (tf["start_date"][:7], tf["end_date"][:7])
        ).fetchall()
        inv_rows = conn.execute(
            "SELECT period, turns_per_year FROM supply_inventory_turns "
            "WHERE period BETWEEN ? AND ? ORDER BY period",
            (tf["start_date"][:7], tf["end_date"][:7])
        ).fetchall()
        var_rows = conn.execute(
            "SELECT period, variance_pct FROM supply_cogs_variance "
            "WHERE period BETWEEN ? AND ? ORDER BY period",
            (tf["start_date"][:7], tf["end_date"][:7])
        ).fetchall()

        def avg_from_rows(rows, col) -> float:
            vals = [float(r[col] or 0) for r in rows]
            return (sum(vals) / len(vals)) if vals else 0.0

        avg_lead = avg_from_rows(lead_rows, "lead_time_days")
        avg_turns = avg_from_rows(inv_rows, "turns_per_year")
        avg_var = avg_from_rows(var_rows, "variance_pct")

        kpis = [
            {"key": "lead_time",       "label": "Avg Lead Time",   "value": avg_lead,  "unit": "days"},
            {"key": "inventory_turns", "label": "Inventory Turns", "value": avg_turns, "unit": "turns"},
            {"key": "cogs_variance",   "label": "COGS Variance",   "value": avg_var,   "unit": "%"},
            {"key": "cogs_total",      "label": "COGS Total",      "value": cogs_total,"unit": "£"},
        ]

        # ---- Trends (aggregate to month/quarter; for quarters, average the months within the quarter) ----
        def group_avg(rows, value_key: str) -> List[Dict[str, float]]:
            agg: Dict[str, Dict[str, float]] = {}
            cnt: Dict[str, int] = {}
            for r in rows:
                ym = r["period"]
                label = ym if granularity == "month" else to_quarter_label(ym)
                if label in want:
                    a = agg.setdefault(label, {value_key: 0.0})
                    a[value_key] = a.get(value_key, 0.0) + float(r[value_key] or 0)
                    cnt[label] = cnt.get(label, 0) + 1
            result = []
            for p in want_list:
                c = cnt.get(p, 0)
                v = (agg.get(p, {}).get(value_key, 0.0) / c) if c else 0.0
                result.append({"period": p, value_key: v})
            return result

        leadTimeTrend = group_avg(lead_rows, "lead_time_days")
        inventoryTurnsTrend = group_avg(inv_rows, "turns_per_year")
        cogsVarianceTrend = group_avg(var_rows, "variance_pct")

        # ---- COGS Breakdown (static table) ----
        total_cost = sum(float(r["cost"] or 0) for r in br_rows) or 1.0
        cogsBreakdown = [
            {"name": r["component"], "value": float(r["cost"] or 0), "share": float(r["cost"] or 0) / total_cost}
            for r in br_rows
        ]

        return {
            "timeframe": tf,
            "kpis": kpis,
            "leadTimeTrend": leadTimeTrend,
            "inventoryTurnsTrend": inventoryTurnsTrend,
            "cogsVarianceTrend": cogsVarianceTrend,
            "cogsBreakdown": cogsBreakdown,
        }

# =========================================================
# 2) KPI Drilldown
# =========================================================
@router.get("/kpis/{key}")
def supply_kpi_drilldown(
    key: Literal["lead_time", "inventory_turns", "cogs_variance", "cogs_total"],
    range: Range = Query("12m"),
    granularity: Gran = Query("month"),
    by: Literal["component"] = Query("component"),
):
    tf = build_timeframe(range, granularity)
    want_list = list_periods(tf)
    want = set(want_list)

    with _conn() as conn:
        series: List[Dict[str, float | str]] = []
        unit: Optional[str] = None

        if key == "lead_time":
            rows = conn.execute(
                "SELECT period, lead_time_days FROM supply_lead_time "
                "WHERE period BETWEEN ? AND ? ORDER BY period",
                (tf["start_date"][:7], tf["end_date"][:7])
            ).fetchall()
            agg: Dict[str, Dict[str, float]] = {}
            cnt: Dict[str, int] = {}
            for r in rows:
                label = r["period"] if granularity == "month" else to_quarter_label(r["period"])
                if label in want:
                    a = agg.setdefault(label, {"lead_time_days": 0.0})
                    a["lead_time_days"] += float(r["lead_time_days"] or 0)
                    cnt[label] = cnt.get(label, 0) + 1
            for p in want_list:
                c = cnt.get(p, 0)
                v = (agg.get(p, {}).get("lead_time_days", 0.0) / c) if c else 0.0
                series.append({"period": p, "lead_time_days": v})
            unit = "days"

        elif key == "inventory_turns":
            rows = conn.execute(
                "SELECT period, turns_per_year FROM supply_inventory_turns "
                "WHERE period BETWEEN ? AND ? ORDER BY period",
                (tf["start_date"][:7], tf["end_date"][:7])
            ).fetchall()
            agg: Dict[str, Dict[str, float]] = {}
            cnt: Dict[str, int] = {}
            for r in rows:
                label = r["period"] if granularity == "month" else to_quarter_label(r["period"])
                if label in want:
                    a = agg.setdefault(label, {"turns_per_year": 0.0})
                    a["turns_per_year"] += float(r["turns_per_year"] or 0)
                    cnt[label] = cnt.get(label, 0) + 1
            for p in want_list:
                c = cnt.get(p, 0)
                v = (agg.get(p, {}).get("turns_per_year", 0.0) / c) if c else 0.0
                series.append({"period": p, "turns_per_year": v})
            unit = "turns"

        elif key == "cogs_variance":
            rows = conn.execute(
                "SELECT period, variance_pct FROM supply_cogs_variance "
                "WHERE period BETWEEN ? AND ? ORDER BY period",
                (tf["start_date"][:7], tf["end_date"][:7])
            ).fetchall()
            agg: Dict[str, Dict[str, float]] = {}
            cnt: Dict[str, int] = {}
            for r in rows:
                label = r["period"] if granularity == "month" else to_quarter_label(r["period"])
                if label in want:
                    a = agg.setdefault(label, {"variance_pct": 0.0})
                    a["variance_pct"] += float(r["variance_pct"] or 0)
                    cnt[label] = cnt.get(label, 0) + 1
            for p in want_list:
                c = cnt.get(p, 0)
                v = (agg.get(p, {}).get("variance_pct", 0.0) / c) if c else 0.0
                series.append({"period": p, "variance_pct": v})
            unit = "%"

        else:  # cogs_total — static value, render as a constant series
            br_rows = conn.execute("SELECT cost FROM supply_cogs_breakdown").fetchall()
            total = sum(float(r["cost"] or 0) for r in br_rows)
            series = [{"period": p, "value": total} for p in want_list]
            unit = "£"

        # ---- Breakdown (by component) ----
        br = conn.execute(
            "SELECT component, cost FROM supply_cogs_breakdown ORDER BY cost DESC"
        ).fetchall()
        total_cost = sum(float(r["cost"] or 0) for r in br) or 1.0
        breakdown = [
            {"name": r["component"], "value": float(r["cost"] or 0), "share": float(r["cost"] or 0) / total_cost}
            for r in br
        ]

        return {"timeframe": tf, "metric": key, "series": series, "breakdown": breakdown, "unit": unit}
