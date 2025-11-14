# backend/app/api/finance.py
from fastapi import APIRouter, Query
from typing import Literal, List, Dict, Optional, Tuple
import sqlite3, datetime as dt
from app.db.session import engine

router = APIRouter(prefix="/api/finance", tags=["finance"])

# ---------- timeframe helpers ----------
def month_floor(d: dt.date) -> dt.date:
  return d.replace(day=1)

def month_add(d: dt.date, months: int) -> dt.date:
  y = d.year + (d.month - 1 + months) // 12
  m = (d.month - 1 + months) % 12 + 1
  return dt.date(y, m, 1)

def to_quarter_label(ym: str) -> str:
  y, m = ym.split("-")
  q = (int(m) - 1)//3 + 1
  return f"{y}-Q{q}"

def build_timeframe(range_: Literal["6m","12m"], granularity: Literal["month","quarter"]):
  # Alignment: window includes the current full month, totaling 6/12 months
  today = dt.date.today()
  start_of_this_month = month_floor(today)
  end_date = month_add(start_of_this_month, 1) - dt.timedelta(days=1)
  months = 6 if range_ == "6m" else 12
  start_date = month_add(start_of_this_month, -(months - 1))
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

def _conn() -> sqlite3.Connection:
  db_path = engine.url.database
  conn = sqlite3.connect(db_path)
  conn.row_factory = sqlite3.Row
  return conn

def _sum(xs): return float(sum(xs)) if xs else 0.0

def _as_fraction(v: Optional[float]) -> float:
  """Normalize ratios that may be 0–1 or 0–100 to 0–1; allow NRR > 1."""
  try:
    fv = float(v)
  except Exception:
    return 0.0
  return fv if fv <= 2 else fv / 100.0

# ---------- Overview ----------
@router.get("/overview")
def finance_overview(
  range: Literal["6m","12m"] = Query("12m"),
  granularity: Literal["month","quarter"] = Query("month"),
):
  tf = build_timeframe(range, granularity)
  start_ym = dt.date.fromisoformat(tf["start_date"]).strftime("%Y-%m")
  end_ym   = dt.date.fromisoformat(tf["end_date"]).strftime("%Y-%m")

  with _conn() as conn:
    rows = conn.execute(
      """
      SELECT period,
             COALESCE(recognized,0) AS recognized,
             COALESCE(booked,0)     AS booked,
             COALESCE(backlog,0)    AS backlog
      FROM revenue_trend
      WHERE period BETWEEN ? AND ?
      ORDER BY period
      """,(start_ym, end_ym)
    ).fetchall()

    # Month → Quarter: sum recognized/booked; backlog takes the period-end (last month)
    agg: Dict[str, Dict[str,float]] = {}
    for r in rows:
      p = r["period"]
      label = p if granularity == "month" else to_quarter_label(p)
      a = agg.setdefault(label, {"recognized":0.0,"booked":0.0,"backlog":0.0})
      a["recognized"] += float(r["recognized"])
      a["booked"]     += float(r["booked"])
      a["backlog"]     = float(r["backlog"])  # overwrite with period/quarter end

    trend = [{"period": p, **agg.get(p, {"recognized":0.0,"booked":0.0,"backlog":0.0})} for p in list_periods(tf)]

    sum_rec = _sum([t["recognized"] for t in trend])
    sum_book = _sum([t["booked"] for t in trend])
    end_backlog = float(rows[-1]["backlog"]) if rows else 0.0

    # GM (ratio 0–1)
    gm_row = conn.execute(
      "SELECT SUM(amount) AS amt, SUM(profit) AS pf FROM orders WHERE order_date BETWEEN ? AND ?",
      (tf["start_date"], tf["end_date"])
    ).fetchone()
    gm = (float(gm_row["pf"]) / float(gm_row["amt"])) if gm_row and gm_row["amt"] else 0.0

    # Coverage Months (fixed 6-month average)
    trailing6 = conn.execute(
      """
      SELECT recognized FROM revenue_trend
      WHERE period <= ?
      ORDER BY period DESC
      LIMIT 6
      """,(end_ym,)
    ).fetchall()
    avg6 = _sum([float(r["recognized"]) for r in trailing6]) / (len(trailing6) or 1)
    coverage_months = float(end_backlog / avg6) if avg6 > 0 else 0.0

    # ARR = 12 × current-month MRR (subscription/recurring)
    arr_row = conn.execute(
      """
      SELECT SUM(amount) AS mrr
      FROM orders
      WHERE type IN ('subscription','recurring')
        AND strftime('%Y-%m', order_date) = ?
      """,
      (end_ym,)
    ).fetchone()
    arr = float(arr_row["mrr"]) * 12.0 if arr_row and arr_row["mrr"] else 0.0

    kpis = [
      {"key":"revenue","label":"Recognized Revenue","value": round(sum_rec,2),"unit":"£"},
      {"key":"gm","label":"Gross Margin","value": round(gm,4)},  # ratio 0–1
      {"key":"backlog","label":"Backlog","value": round(end_backlog,2),"unit":"£"},
      {"key":"arr","label":"ARR","value": round(arr,2),"unit":"£"},
      {"key":"payback","label":"Payback (mo)","value": 9.0,"unit":"mo"},
      {"key":"book_to_bill","label":"Book-to-Bill","value": round((sum_book/sum_rec) if sum_rec>0 else 1.0, 2)},
      {"key":"coverage_months","label":"Coverage Months","value": round(coverage_months,1)},
    ]

    return {"timeframe": tf, "kpis": kpis, "revenueTrend": trend}

# ---------- Drilldown ----------
@router.get("/kpis/{key}")
def finance_kpi_drilldown(
  key: Literal["revenue","backlog","gm","arr","payback","book_to_bill","coverage_months","uptime","nrr","forecast"],
  range: Literal["6m","12m"] = Query("12m"),
  granularity: Literal["month","quarter"] = Query("month"),
  by: Literal["customer","industry","source"] = Query("customer"),
):
  tf = build_timeframe(range, granularity)
  start_ym = dt.date.fromisoformat(tf["start_date"]).strftime("%Y-%m")
  end_ym   = dt.date.fromisoformat(tf["end_date"]).strftime("%Y-%m")

  with _conn() as conn:
    unit: Optional[str] = None
    series: List[Dict[str, float]] = []

    if key == "revenue":
      rows = conn.execute(
        """
        SELECT period, recognized, booked, backlog
        FROM revenue_trend
        WHERE period BETWEEN ? AND ?
        ORDER BY period
        """,(start_ym, end_ym)
      ).fetchall()
      agg: Dict[str, Dict[str,float]] = {}
      for r in rows:
        label = r["period"] if granularity=="month" else to_quarter_label(r["period"])
        a = agg.setdefault(label, {"recognized":0.0,"booked":0.0,"backlog":0.0})
        a["recognized"] += float(r["recognized"] or 0)
        a["booked"]     += float(r["booked"] or 0)
        a["backlog"]     = float(r["backlog"] or a["backlog"])  # overwrite with period end
      series = [{"period": p, **agg.get(p, {"recognized":0.0,"booked":0.0,"backlog":0.0})} for p in list_periods(tf)]
      unit = "£"

    elif key == "backlog":
      rows = conn.execute(
        """
        SELECT period, COALESCE(backlog,0) AS backlog
        FROM revenue_trend
        WHERE period BETWEEN ? AND ?
        ORDER BY period
        """,(start_ym, end_ym)
      ).fetchall()
      if granularity == "month":
        series = [{"period": r["period"], "backlog": float(r["backlog"])} for r in rows]
      else:
        last_by_q: Dict[str, float] = {}
        for r in rows:
          q = to_quarter_label(r["period"])
          last_by_q[q] = float(r["backlog"])
        series = [{"period": p, "backlog": last_by_q.get(p, 0.0)} for p in list_periods(tf)]
      unit = "£"

    elif key == "gm":
      rows = conn.execute(
        """
        SELECT substr(order_date,1,7) AS ym,
               SUM(COALESCE(profit,0)) AS pf,
               SUM(COALESCE(amount,0)) AS amt
        FROM orders
        WHERE order_date BETWEEN ? AND ?
        GROUP BY ym
        ORDER BY ym
        """,(tf["start_date"], tf["end_date"])
      ).fetchall()
      buckets: Dict[str, Dict[str,float]] = {}
      for r in rows:
        p = r["ym"] if granularity=="month" else to_quarter_label(r["ym"])
        b = buckets.setdefault(p, {"pf":0.0,"amt":0.0})
        b["pf"]  += float(r["pf"] or 0)
        b["amt"] += float(r["amt"] or 0)
      # Return ratio 0–1
      series = [{"period": p, "gm": (buckets[p]["pf"]/buckets[p]["amt"]) if buckets[p]["amt"] else 0.0} for p in list_periods(tf)]
      unit = None

    elif key == "uptime":
      rows = conn.execute(
        """
        SELECT period, AVG(uptime) AS u
        FROM ops_uptime
        WHERE period BETWEEN ? AND ?
        GROUP BY period
        ORDER BY period
        """,(start_ym, end_ym)
      ).fetchall()
      if granularity == "month":
        series = [{"period": r["period"], "uptime": _as_fraction(r["u"])} for r in rows]
      else:
        buckets: Dict[str, List[float]] = {}
        for r in rows:
          q = to_quarter_label(r["period"])
          buckets.setdefault(q, []).append(_as_fraction(r["u"]))
        series = [{"period": p, "uptime": (sum(buckets[p])/len(buckets[p]) if buckets.get(p) else 0.0)} for p in list_periods(tf)]
      unit = None

    elif key == "nrr":
      # Prefer retention_nrr; if fewer than two rows, approximate using recognized MoM (ratio 0–1)
      rows = conn.execute(
        """
        SELECT period, nrr
        FROM retention_nrr
        WHERE period BETWEEN ? AND ?
        ORDER BY period
        """,(start_ym, end_ym)
      ).fetchall()

      if len(rows) >= 2:
        if granularity == "month":
          series = [{"period": r["period"], "nrr": _as_fraction(r["nrr"])} for r in rows]
        else:
          buckets: Dict[str, List[float]] = {}
          for r in rows:
            q = to_quarter_label(r["period"])
            buckets.setdefault(q, []).append(_as_fraction(r["nrr"]))
          series = [{"period": p, "nrr": (sum(buckets[p])/len(buckets[p]) if buckets.get(p) else 0.0)} for p in list_periods(tf)]
      else:
        start_date = dt.date.fromisoformat(tf["start_date"])
        prev_start_ym = month_add(month_floor(start_date), -1).strftime("%Y-%m")
        rev = conn.execute(
          """
          SELECT period, COALESCE(recognized,0) AS recognized
          FROM revenue_trend
          WHERE period BETWEEN ? AND ?
          ORDER BY period
          """,(prev_start_ym, end_ym)
        ).fetchall()
        rec = {r["period"]: float(r["recognized"] or 0) for r in rev}

        # Build the list of months within the window
        months_list = []
        cur = dt.date.fromisoformat(tf["start_date"]).replace(day=1)
        end = dt.date.fromisoformat(tf["end_date"]).replace(day=1)
        while cur <= end:
          months_list.append(cur.strftime("%Y-%m"))
          cur = month_add(cur, 1)

        monthly = []
        for ym in months_list:
          y, m = ym.split("-")
          prev = month_add(dt.date(int(y), int(m), 1), -1).strftime("%Y-%m")
          nrr_v = (rec.get(ym,0.0) / rec.get(prev,0.0)) if rec.get(prev,0.0) > 0 else 1.0
          monthly.append({"period": ym, "nrr": nrr_v})

        if granularity == "month":
          series = monthly
        else:
          buckets: Dict[str, List[float]] = {}
          for r in monthly:
            q = to_quarter_label(r["period"])
            buckets.setdefault(q, []).append(float(r["nrr"] or 0))
          series = [{"period": p, "nrr": (sum(buckets[p])/len(buckets[p]) if buckets.get(p) else 0.0)} for p in list_periods(tf)]

      unit = None

    else:
      # Other metrics: take the total from overview and distribute evenly across periods (simple view)
      if key in ("arr","forecast","backlog","book_to_bill","coverage_months","payback"):
        ov = finance_overview(range=range, granularity="month")
        base = next((k for k in ov["kpis"] if k["key"]==key), None)
        total = float(base["value"]) if base else 0.0
        unit = base.get("unit") if base else None
      else:
        total = 0.0
      ps = list_periods(tf)
      avg = total / (len(ps) or 1)
      series = [{"period": p, "value": avg} for p in ps]
      # Fill unit by semantics
      if key in ["arr","forecast","backlog"]:
        unit = unit or "£"
      if key in ["uptime","nrr","gm"]:
        unit = None

    # Breakdown (aggregate recognized + share by dimension within the window)
    dim_col = {"customer":"name","industry":"industry","source":"source"}[by]
    bd = conn.execute(
      f"""
      SELECT COALESCE(c.{dim_col}, 'Unknown') AS name,
             SUM(COALESCE(o.amount,0)) AS recognized
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.order_date BETWEEN ? AND ?
      GROUP BY COALESCE(c.{dim_col}, 'Unknown')
      ORDER BY recognized DESC
      LIMIT 20
      """,(tf["start_date"], tf["end_date"])
    ).fetchall()
    total_bd = _sum([float(r["recognized"] or 0) for r in bd]) or 1.0
    breakdown = [{"name": r["name"], "value": float(r["recognized"] or 0), "share": float(r["recognized"] or 0)/total_bd} for r in bd]

    return {"timeframe": tf, "metric": key, "series": series, "breakdown": breakdown, "unit": unit}
