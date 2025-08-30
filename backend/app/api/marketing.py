# backend/app/api/marketing.py
from fastapi import APIRouter, Query
from typing import Literal, List, Dict, Optional, Tuple
import sqlite3, datetime as dt
from app.db.session import engine

router = APIRouter(prefix="/api/marketing", tags=["marketing"])

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
    q = (int(m) - 1)//3 + 1
    return f"{y}-Q{q}"

def build_timeframe(range_: Literal["6m","12m"], granularity: Literal["month","quarter"]):
    """
    Alignment: the window includes the current full month, totaling 6/12 months
    (start from the first day of this month and go back 5/11 months).
    """
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

def periods(tf: Dict) -> List[str]:
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

def _agg(rows, keys: List[str], granularity: str, tf_ps: List[str], keep_last: bool=False) -> Tuple[Dict[str, Dict[str, float]], Dict[str, int]]:
    """
    Aggregate by period:
      - keep_last=False: sum the keys
      - keep_last=True: keep the last value (not used here)
    Returns: (sum_map, count_map) — useful for dividing later for "average-type" metrics.
    """
    agg: Dict[str, Dict[str, float]] = {}
    cnt: Dict[str, int] = {}
    for r in rows:
        p = r["period"]
        p = p if granularity == "month" else to_quarter_label(p)
        if p not in tf_ps:
            continue
        slot = agg.setdefault(p, {k: 0.0 for k in keys})
        for k in keys:
            if keep_last:
                slot[k] = float(r[k] or slot[k] or 0)
            else:
                slot[k] += float(r[k] or 0)
        cnt[p] = cnt.get(p, 0) + 1
    return agg, cnt

# =====================================================
# Overview
# =====================================================
@router.get("/overview")
def marketing_overview(
    range: Literal["6m","12m"] = Query("12m"),
    granularity: Literal["month","quarter"] = Query("month"),
):
    tf = build_timeframe(range, granularity)
    tf_ps = periods(tf)

    with _conn() as conn:
        # ---- traffic (visits) ----
        v_rows = conn.execute(
            "SELECT substr(visit_date,1,7) AS period, COUNT(*) AS visits "
            "FROM page_visits WHERE visit_date BETWEEN ? AND ? "
            "GROUP BY period ORDER BY period",
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        v_agg, _ = _agg(v_rows, ["visits"], granularity, tf_ps)

        # ---- funnel (Leads / MQL / SQL) from pipeline_stages_daily ----
        f_rows = conn.execute(
            "SELECT substr(period,1,7) AS period, "
            "SUM(CASE WHEN stage_name='Leads' THEN value ELSE 0 END) AS leads, "
            "SUM(CASE WHEN stage_name='MQL'   THEN value ELSE 0 END) AS mql, "
            "SUM(CASE WHEN stage_name='SQL'   THEN value ELSE 0 END) AS sql "
            "FROM pipeline_stages_daily "
            "WHERE period BETWEEN ? AND ? "
            "GROUP BY substr(period,1,7) ORDER BY period",
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        f_agg, _ = _agg(f_rows, ["leads","mql","sql"], granularity, tf_ps)

        # ---- NPS / CSAT (for quarterly view, average the monthly averages) ----
        def _avg_aspect(aspect: str) -> Dict[str, float]:
            rows = conn.execute(
                "SELECT substr(created_at,1,7) AS period, AVG(score) AS avg_score "
                "FROM feedback_scores WHERE aspect = ? AND created_at BETWEEN ? AND ? "
                "GROUP BY substr(created_at,1,7) ORDER BY period",
                (aspect, tf["start_date"], tf["end_date"])
            ).fetchall()
            a_sum, a_cnt = _agg(rows, ["avg_score"], granularity, tf_ps)
            out: Dict[str, float] = {}
            for p in tf_ps:
                s = a_sum.get(p, {}).get("avg_score", 0.0)
                c = a_cnt.get(p, 0)
                out[p] = float(s / c) if c else 0.0
            return out

        nps_avg_map = _avg_aspect("nps")
        csat_avg_map = _avg_aspect("csat")

        # KPI summary
        visits_total = sum(v_agg.get(p, {}).get("visits", 0.0) for p in tf_ps)
        leads_total  = sum(f_agg.get(p, {}).get("leads", 0.0) for p in tf_ps)
        mql_total    = sum(f_agg.get(p, {}).get("mql", 0.0) for p in tf_ps)
        sql_total    = sum(f_agg.get(p, {}).get("sql", 0.0) for p in tf_ps)
        nps_avg      = (sum(nps_avg_map.values())/max(1,len([x for x in nps_avg_map.values() if x>0]))) if any(nps_avg_map.values()) else 0.0
        csat_avg     = (sum(csat_avg_map.values())/max(1,len([x for x in csat_avg_map.values() if x>0]))) if any(csat_avg_map.values()) else 0.0
        conv_pct     = (leads_total / visits_total * 100.0) if visits_total > 0 else 0.0

        kpis = [
            {"key":"visits","label":"Website Visits","value": round(visits_total,0)},
            {"key":"leads","label":"Leads","value": round(leads_total,0)},
            {"key":"mql","label":"MQL","value": round(mql_total,0)},
            {"key":"sql","label":"SQL","value": round(sql_total,0)},
            {"key":"nps","label":"NPS","value": round(nps_avg,1)},
            {"key":"csat","label":"CSAT","value": round(csat_avg,1)},
            {"key":"conversion","label":"Visit→Lead Conversion","value": round(conv_pct,2), "unit":"%"},
        ]

        visitsTrend = [{"period": p, "visits": int(v_agg.get(p,{}).get("visits",0))} for p in tf_ps]
        funnelTrend = [{"period": p,
                        "leads": int(f_agg.get(p,{}).get("leads",0)),
                        "mql":   int(f_agg.get(p,{}).get("mql",0)),
                        "sql":   int(f_agg.get(p,{}).get("sql",0))} for p in tf_ps]
        npsTrend    = [{"period": p, "nps": round(nps_avg_map.get(p,0.0),1)} for p in tf_ps]
        csatTrend   = [{"period": p, "csat": round(csat_avg_map.get(p,0.0),2)} for p in tf_ps]

        # breakdown: source mix (approximate channel using new customers' created_at)
        bd_rows = conn.execute(
            "SELECT COALESCE(source,'Unknown') AS name, COUNT(*) AS cnt "
            "FROM customers WHERE created_at BETWEEN ? AND ? "
            "GROUP BY COALESCE(source,'Unknown') ORDER BY cnt DESC",
            (tf["start_date"], tf["end_date"])
        ).fetchall()
        total = sum(int(r["cnt"]) for r in bd_rows) or 1
        breakdown = [{"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"])/total} for r in bd_rows]

        return {
            "timeframe": tf,
            "kpis": kpis,
            "visitsTrend": visitsTrend,
            "funnelTrend": funnelTrend,
            "npsTrend": npsTrend,
            "csatTrend": csatTrend,
            "breakdown": breakdown,
        }

# =====================================================
# Drilldown
# =====================================================
@router.get("/kpis/{key}")
def marketing_kpi_drilldown(
    key: Literal["visits","leads","mql","sql","nps","csat","conversion"],
    range: Literal["6m","12m"] = Query("12m"),
    granularity: Literal["month","quarter"] = Query("month"),
    by: Literal["page","source","bucket"] = Query("source"),
):
    tf = build_timeframe(range, granularity)
    tf_ps = periods(tf)

    with _conn() as conn:
        unit: Optional[str] = None
        series: List[Dict[str, float]] = []
        breakdown: List[Dict[str, float]] = []

        if key == "visits":
            unit = ""
            rows = conn.execute(
                "SELECT substr(visit_date,1,7) AS period, COUNT(*) AS visits "
                "FROM page_visits WHERE visit_date BETWEEN ? AND ? "
                "GROUP BY period ORDER BY period",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            a, _ = _agg(rows, ["visits"], granularity, tf_ps)
            series = [{"period": p, "visits": int(a.get(p,{}).get("visits",0))} for p in tf_ps]
            # breakdown by page (default)
            if by == "page":
                bd = conn.execute(
                    "SELECT COALESCE(page_name,'Unknown') AS name, COUNT(*) AS cnt "
                    "FROM page_visits WHERE visit_date BETWEEN ? AND ? "
                    "GROUP BY COALESCE(page_name,'Unknown') ORDER BY cnt DESC LIMIT 20",
                    (tf["start_date"], tf["end_date"])
                ).fetchall()
            else:
                # fallback to source mix (approximate using new customers)
                bd = conn.execute(
                    "SELECT COALESCE(source,'Unknown') AS name, COUNT(*) AS cnt "
                    "FROM customers WHERE created_at BETWEEN ? AND ? "
                    "GROUP BY COALESCE(source,'Unknown') ORDER BY cnt DESC LIMIT 20",
                    (tf["start_date"], tf["end_date"])
                ).fetchall()
            tot = sum(int(r["cnt"]) for r in bd) or 1
            breakdown = [{"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"])/tot} for r in bd]

        elif key in ("leads","mql","sql"):
            unit = ""
            rows = conn.execute(
                "SELECT substr(period,1,7) AS period, "
                "SUM(CASE WHEN stage_name='Leads' THEN value ELSE 0 END) AS leads, "
                "SUM(CASE WHEN stage_name='MQL'   THEN value ELSE 0 END) AS mql, "
                "SUM(CASE WHEN stage_name='SQL'   THEN value ELSE 0 END) AS sql "
                "FROM pipeline_stages_daily WHERE period BETWEEN ? AND ? "
                "GROUP BY substr(period,1,7) ORDER BY period",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            a, _ = _agg(rows, ["leads","mql","sql"], granularity, tf_ps)
            series = [{"period": p, key: int(a.get(p,{}).get(key,0))} for p in tf_ps]
            # breakdown by source (approximate using new customers)
            bd = conn.execute(
                "SELECT COALESCE(source,'Unknown') AS name, COUNT(*) AS cnt "
                "FROM customers WHERE created_at BETWEEN ? AND ? "
                "GROUP BY COALESCE(source,'Unknown') ORDER BY cnt DESC LIMIT 20",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            tot = sum(int(r["cnt"]) for r in bd) or 1
            breakdown = [{"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"])/tot} for r in bd]

        elif key in ("nps","csat"):
            unit = ""
            aspect = "nps" if key == "nps" else "csat"
            rows = conn.execute(
                "SELECT substr(created_at,1,7) AS period, AVG(score) AS avg_score "
                "FROM feedback_scores WHERE aspect = ? AND created_at BETWEEN ? AND ? "
                "GROUP BY substr(created_at,1,7) ORDER BY period",
                (aspect, tf["start_date"], tf["end_date"])
            ).fetchall()
            a_sum, a_cnt = _agg(rows, ["avg_score"], granularity, tf_ps)
            series = []
            for p in tf_ps:
                s = a_sum.get(p, {}).get("avg_score", 0.0)
                c = a_cnt.get(p, 0)
                series.append({"period": p, key: float(s / c) if c else 0.0})
            # breakdown: NPS buckets / CSAT integer distribution
            if by == "bucket":
                if key == "nps":
                    dtrs = conn.execute(
                        "SELECT COUNT(*) AS c FROM feedback_scores WHERE aspect='nps' AND score BETWEEN 0 AND 6 AND created_at BETWEEN ? AND ?",
                        (tf["start_date"], tf["end_date"])
                    ).fetchone()["c"]
                    passv = conn.execute(
                        "SELECT COUNT(*) AS c FROM feedback_scores WHERE aspect='nps' AND score IN (7,8) AND created_at BETWEEN ? AND ?",
                        (tf["start_date"], tf["end_date"])
                    ).fetchone()["c"]
                    promo = conn.execute(
                        "SELECT COUNT(*) AS c FROM feedback_scores WHERE aspect='nps' AND score IN (9,10) AND created_at BETWEEN ? AND ?",
                        (tf["start_date"], tf["end_date"])
                    ).fetchone()["c"]
                    tot = max(1, dtrs + passv + promo)
                    breakdown = [
                        {"name":"Detractors (0-6)", "count": dtrs, "share": dtrs/tot},
                        {"name":"Passives (7-8)",  "count": passv, "share": passv/tot},
                        {"name":"Promoters (9-10)","count": promo, "share": promo/tot},
                    ]
                else:
                    bd_rows = conn.execute(
                        "SELECT CAST(score AS INTEGER) AS bucket, COUNT(*) AS cnt "
                        "FROM feedback_scores WHERE aspect='csat' AND created_at BETWEEN ? AND ? "
                        "GROUP BY CAST(score AS INTEGER) ORDER BY bucket",
                        (tf["start_date"], tf["end_date"])
                    ).fetchall()
                    tot = sum(int(r["cnt"]) for r in bd_rows) or 1
                    breakdown = [{"name": f"{int(r['bucket'])}★", "count": int(r["cnt"]), "share": int(r["cnt"])/tot} for r in bd_rows]
            else:
                bd = conn.execute(
                    "SELECT COALESCE(source,'Unknown') AS name, COUNT(*) AS cnt "
                    "FROM customers WHERE created_at BETWEEN ? AND ? "
                    "GROUP BY COALESCE(source,'Unknown') ORDER BY cnt DESC LIMIT 20",
                    (tf["start_date"], tf["end_date"])
                ).fetchall()
                tot = sum(int(r["cnt"]) for r in bd) or 1
                breakdown = [{"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"])/tot} for r in bd]

        elif key == "conversion":
            unit = "%"
            # Compute visit→lead conversion rate per period (percentage 0–100)
            v_rows = conn.execute(
                "SELECT substr(visit_date,1,7) AS period, COUNT(*) AS visits "
                "FROM page_visits WHERE visit_date BETWEEN ? AND ? "
                "GROUP BY period ORDER BY period",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            v_agg, _ = _agg(v_rows, ["visits"], granularity, tf_ps)
            f_rows = conn.execute(
                "SELECT substr(period,1,7) AS period, "
                "SUM(CASE WHEN stage_name='Leads' THEN value ELSE 0 END) AS leads "
                "FROM pipeline_stages_daily WHERE period BETWEEN ? AND ? "
                "GROUP BY substr(period,1,7) ORDER BY period",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            f_agg, _ = _agg(f_rows, ["leads"], granularity, tf_ps)

            for p in tf_ps:
                visits = float(v_agg.get(p,{}).get("visits",0.0))
                leads  = float(f_agg.get(p,{}).get("leads",0.0))
                conv = (leads/visits*100.0) if visits>0 else 0.0
                series.append({"period": p, "conversion": round(conv,2)})

            # breakdown by source (approximate using new customers)
            bd = conn.execute(
                "SELECT COALESCE(source,'Unknown') AS name, COUNT(*) AS cnt "
                "FROM customers WHERE created_at BETWEEN ? AND ? "
                "GROUP BY COALESCE(source,'Unknown') ORDER BY cnt DESC LIMIT 20",
                (tf["start_date"], tf["end_date"])
            ).fetchall()
            tot = sum(int(r["cnt"]) for r in bd) or 1
            breakdown = [{"name": r["name"], "count": int(r["cnt"]), "share": int(r["cnt"])/tot} for r in bd]

        return {"timeframe": tf, "metric": key, "series": series, "breakdown": breakdown, "unit": unit}
