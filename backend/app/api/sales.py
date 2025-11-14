# backend/app/api/sales.py
from fastapi import APIRouter, Query
from typing import Literal, List, Dict, Optional
import sqlite3, datetime as dt
from app.db.session import engine

router = APIRouter(prefix="/api/sales", tags=["sales"])

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
    """
    Window: the cutoff is the current full month (end of this month).
    The start is the first day of the month that is 6/12 months back
    (inclusive of the starting month).
    """
    today = dt.date.today()
    end_date = month_add(month_floor(today), 1) - dt.timedelta(days=1)   # end of the current month
    months = 6 if range_ == "6m" else 12
    start_date = month_add(month_floor(today), -months)                  # inclusive of the starting month
    return {
        "range": range_,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "granularity": granularity,
    }

def wanted_periods(tf: Dict) -> List[str]:
    start = dt.date.fromisoformat(tf["start_date"]).replace(day=1)
    end = dt.date.fromisoformat(tf["end_date"]).replace(day=1)
    out: List[str] = []
    cur = start
    while cur <= end:
        if tf["granularity"] == "month":
            out.append(cur.strftime("%Y-%m"))
        else:
            label = to_quarter_label(cur.strftime("%Y-%m"))
            if not out or out[-1] != label:
                out.append(label)
        cur = month_add(cur, 1)
    return out

def _conn() -> sqlite3.Connection:
    db_path = engine.url.database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def _sum(xs): return float(sum(xs)) if xs else 0.0

# =========================================================
# 1) Sales Overview
# =========================================================
@router.get("/overview")
def sales_overview(
    range: Range = Query("12m"),
    granularity: Gran = Query("month"),
):
    tf = build_timeframe(range, granularity)
    want_list = wanted_periods(tf)
    want = set(want_list)

    with _conn() as conn:
        # ---- KPIs (snapshot + window aggregates) ----
        def get_stage(name: str) -> int:
            r = conn.execute(
                "SELECT value FROM pipeline_stages WHERE stage_name = ?",
                (name,)
            ).fetchone()
            return int(r["value"]) if r and r["value"] is not None else 0

        k_leads = get_stage("Leads")
        k_mql   = get_stage("MQL")
        k_sql   = get_stage("SQL")
        k_won   = get_stage("Won")

        wr_rows = conn.execute(
            "SELECT period, win_rate_pct, sales_cycle_days FROM pipeline_winrate ORDER BY period DESC"
        ).fetchall()
        win_rate = None      # percentage value (e.g., 34.5)
        sales_cycle = None
        for row in wr_rows:
            p = row["period"]
            p = p if granularity == "month" else to_quarter_label(p)
            if p in want:
                win_rate = float(row["win_rate_pct"] or 0)
                sales_cycle = float(row["sales_cycle_days"] or 0)
                break
        if win_rate is None and wr_rows:
            win_rate = float(wr_rows[0]["win_rate_pct"] or 0)
            sales_cycle = float(wr_rows[0]["sales_cycle_days"] or 0)

        avg_deal_row = conn.execute(
            "SELECT AVG(amount) AS avg_amt FROM orders WHERE order_date BETWEEN ? AND ?",
            (tf["start_date"], tf["end_date"])
        ).fetchone()
        avg_deal = float(avg_deal_row["avg_amt"] or 0)

        rev_row = conn.execute(
            "SELECT SUM(amount) AS rev FROM orders WHERE order_date BETWEEN ? AND ?",
            (tf["start_date"], tf["end_date"])
        ).fetchone()
        revenue = float(rev_row["rev"] or 0)

        new_cust_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM customers WHERE created_at BETWEEN ? AND ?",
            (tf["start_date"], tf["end_date"])
        ).fetchone()
        new_customers = int(new_cust_row["cnt"] or 0)

        kpis = [
            {"key": "leads",         "label": "Leads",               "value": k_leads},
            {"key": "mql",           "label": "MQL",                 "value": k_mql},
            {"key": "sql",           "label": "SQL",                 "value": k_sql},
            {"key": "won",           "label": "Won",                 "value": k_won},
            {"key": "win_rate",      "label": "Win Rate",            "value": float(win_rate or 0.0), "unit": "%"},
            {"key": "sales_cycle",   "label": "Sales Cycle",         "value": float(sales_cycle or 0.0), "unit": "days"},
            {"key": "avg_deal",      "label": "Avg Deal Size",       "value": avg_deal, "unit": "£"},
            {"key": "new_customers", "label": "New Customers",       "value": new_customers},
            {"key": "revenue",       "label": "Recognized Revenue",  "value": revenue, "unit": "£"},
        ]

        # ---- Pipeline Trend (aggregate the daily table to M/Q using sum) ----
        rows = conn.execute(
            "SELECT period, stage_name, value FROM pipeline_stages_daily "
            "WHERE period BETWEEN ? AND ? ORDER BY period",
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        agg: Dict[str, Dict[str, float]] = {}
        for r in rows:
            day = r["period"]          # YYYY-MM-DD
            ym = day[:7]
            label = ym if granularity == "month" else to_quarter_label(ym)
            a = agg.setdefault(label, {"Leads":0.0, "MQL":0.0, "SQL":0.0, "Won":0.0})
            a[r["stage_name"]] = a.get(r["stage_name"], 0.0) + float(r["value"] or 0)

        pipelineTrend = []
        for p in want_list:
            a = agg.get(p, {"Leads":0.0, "MQL":0.0, "SQL":0.0, "Won":0.0})
            pipelineTrend.append({
                "period": p,
                "leads": a.get("Leads", 0.0),
                "mql":   a.get("MQL", 0.0),
                "sql":   a.get("SQL", 0.0),
                "won":   a.get("Won", 0.0),
            })

        # ---- Win rate Trend (M/Q average; win_rate_pct is a percentage value) ----
        wr_all = conn.execute(
            "SELECT period, win_rate_pct, sales_cycle_days FROM pipeline_winrate ORDER BY period"
        ).fetchall()
        wr_agg: Dict[str, Dict[str, float]] = {}
        wr_cnt: Dict[str, int] = {}
        for r in wr_all:
            label = r["period"] if granularity == "month" else to_quarter_label(r["period"])
            if label in want:
                obj = wr_agg.setdefault(label, {"win_rate_pct":0.0, "sales_cycle_days":0.0})
                obj["win_rate_pct"] += float(r["win_rate_pct"] or 0)
                obj["sales_cycle_days"] += float(r["sales_cycle_days"] or 0)
                wr_cnt[label] = wr_cnt.get(label, 0) + 1

        winrateTrend = []
        for p in want_list:
            c = wr_cnt.get(p, 1)
            x = wr_agg.get(p, {"win_rate_pct":0.0, "sales_cycle_days":0.0})
            winrateTrend.append({
                "period": p,
                "win_rate_pct": (x["win_rate_pct"]/c) if c else 0.0,     # percentage value
                "sales_cycle_days": (x["sales_cycle_days"]/c) if c else 0.0,
            })

        # ---- Top Products (within the window) ----
        tp_rows = conn.execute(
            "SELECT name, SUM(revenue) AS rev FROM top_products_daily "
            "WHERE period BETWEEN ? AND ? GROUP BY name ORDER BY rev DESC LIMIT 10",
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        topProducts = [{"name": r["name"], "revenue": float(r["rev"] or 0)} for r in tp_rows]

        # ---- Top Customers (within the window) ----
        tc_rows = conn.execute(
            "SELECT COALESCE(c.name,'Unknown') AS name, SUM(o.amount) AS rev "
            "FROM orders o LEFT JOIN customers c ON c.id = o.customer_id "
            "WHERE o.order_date BETWEEN ? AND ? "
            "GROUP BY COALESCE(c.name,'Unknown') ORDER BY rev DESC LIMIT 10",
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        topCustomers = [{"name": r["name"], "revenue": float(r["rev"] or 0)} for r in tc_rows]

        return {
            "timeframe": tf,
            "kpis": kpis,
            "pipelineTrend": pipelineTrend,
            "winrateTrend": winrateTrend,
            "topProducts": topProducts,
            "topCustomers": topCustomers,
        }

# =========================================================
# 2) KPI Drilldown
# =========================================================
@router.get("/kpis/{key}")
def sales_kpi_drilldown(
    key: Literal["pipeline", "win_rate", "sales_cycle", "avg_deal", "new_customers", "revenue"],
    range: Range = Query("12m"),
    granularity: Gran = Query("month"),
    by: Literal["customer", "industry", "source"] = Query("customer"),
):
    tf = build_timeframe(range, granularity)
    want_list = wanted_periods(tf)
    want = set(want_list)

    with _conn() as conn:
        series: List[Dict[str, float | str]] = []
        unit: Optional[str] = None

        if key == "pipeline":
            rows = conn.execute(
                "SELECT period, stage_name, value FROM pipeline_stages_daily "
                "WHERE period BETWEEN ? AND ? ORDER BY period",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            agg: Dict[str, Dict[str, float]] = {}
            for r in rows:
                ym = r["period"][:7]
                label = ym if granularity == "month" else to_quarter_label(ym)
                a = agg.setdefault(label, {"leads":0.0, "mql":0.0, "sql":0.0, "won":0.0})
                a[r["stage_name"].lower()] = a.get(r["stage_name"].lower(), 0.0) + float(r["value"] or 0)
            series = [{"period": p, **agg.get(p, {"leads":0.0, "mql":0.0, "sql":0.0, "won":0.0})} for p in want_list]
            unit = ""  # counts

        elif key in ("win_rate", "sales_cycle"):
            rows = conn.execute(
                "SELECT period, win_rate_pct, sales_cycle_days FROM pipeline_winrate ORDER BY period"
            ).fetchall()
            agg: Dict[str, Dict[str, float]] = {}
            cnt: Dict[str, int] = {}
            for r in rows:
                label = r["period"] if granularity == "month" else to_quarter_label(r["period"])
                if label in want:
                    a = agg.setdefault(label, {"win_rate_pct":0.0, "sales_cycle_days":0.0})
                    a["win_rate_pct"] += float(r["win_rate_pct"] or 0)      # percentage value
                    a["sales_cycle_days"] += float(r["sales_cycle_days"] or 0)
                    cnt[label] = cnt.get(label, 0) + 1
            for p in want_list:
                c = cnt.get(p, 1)
                x = agg.get(p, {"win_rate_pct":0.0, "sales_cycle_days":0.0})
                series.append({
                    "period": p,
                    "win_rate_pct": (x["win_rate_pct"]/c) if c else 0.0,
                    "sales_cycle_days": (x["sales_cycle_days"]/c) if c else 0.0,
                })
            unit = "%" if key == "win_rate" else "days"

        elif key == "avg_deal":
            rows = conn.execute(
                "SELECT substr(order_date,1,7) ym, AVG(amount) avg_amt "
                "FROM orders WHERE order_date BETWEEN ? AND ? "
                "GROUP BY ym ORDER BY ym",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            buckets: Dict[str, float] = {}
            for r in rows:
                p = r["ym"] if granularity == "month" else to_quarter_label(r["ym"])
                buckets[p] = float(r["avg_amt"] or 0)
            series = [{"period": p, "value": buckets.get(p, 0.0)} for p in want_list]
            unit = "£"

        elif key == "new_customers":
            rows = conn.execute(
                "SELECT substr(created_at,1,7) ym, COUNT(*) cnt "
                "FROM customers WHERE created_at BETWEEN ? AND ? "
                "GROUP BY ym ORDER BY ym",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            buckets: Dict[str, float] = {}
            for r in rows:
                p = r["ym"] if granularity == "month" else to_quarter_label(r["ym"])
                buckets[p] = float(r["cnt"] or 0)
            series = [{"period": p, "value": buckets.get(p, 0.0)} for p in want_list]
            unit = ""

        else:  # revenue
            rows = conn.execute(
                "SELECT substr(order_date,1,7) ym, SUM(amount) amt "
                "FROM orders WHERE order_date BETWEEN ? AND ? "
                "GROUP BY ym ORDER BY ym",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            buckets: Dict[str, float] = {}
            for r in rows:
                p = r["ym"] if granularity == "month" else to_quarter_label(r["ym"])
                buckets[p] = float(r["amt"] or 0)
            series = [{"period": p, "recognized": buckets.get(p, 0.0)} for p in want_list]
            unit = "£"

        # ---- Breakdown (within the window, aggregate recognized by dimension + share) ----
        dim_col = {"customer": "name", "industry": "industry", "source": "source"}[by]
        bd_rows = conn.execute(
            f"""
            SELECT COALESCE(c.{dim_col}, 'Unknown') AS name,
                   SUM(COALESCE(o.amount,0)) AS value
            FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            WHERE o.order_date BETWEEN ? AND ?
            GROUP BY COALESCE(c.{dim_col}, 'Unknown')
            ORDER BY value DESC
            LIMIT 20
            """,
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        total = _sum([float(r["value"] or 0) for r in bd_rows]) or 1.0
        breakdown = [{"name": r["name"], "value": float(r["value"] or 0), "share": float(r["value"] or 0)/total} for r in bd_rows]

        return {"timeframe": tf, "metric": key, "series": series, "breakdown": breakdown, "unit": unit}
