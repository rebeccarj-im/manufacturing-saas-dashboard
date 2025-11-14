# backend/tests/test_smoke_domains.py
from fastapi.testclient import TestClient
import datetime as dt

def _month_add(d: dt.date, months: int) -> dt.date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return dt.date(y, m, 1)

def _period_count(start_date: str, end_date: str, granularity: str) -> int:
    """Consistent with the backend: count periods by month/quarter (inclusive of start and end)."""
    start = dt.date.fromisoformat(start_date).replace(day=1)
    end = dt.date.fromisoformat(end_date).replace(day=1)
    periods = []
    cur = start
    while cur <= end:
        ym = cur.strftime("%Y-%m")
        if granularity == "month":
            periods.append(ym)
        else:
            y, m = ym.split("-")
            q = (int(m) - 1) // 3 + 1
            label = f"{y}-Q{q}"
            if not periods or periods[-1] != label:
                periods.append(label)
        cur = _month_add(cur, 1)
    return len(periods)


# ========================= Sales =========================

def test_sales_overview_basic(client: TestClient):
    r = client.get("/api/sales/overview?range=6m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    tf = data["timeframe"]
    assert tf["range"] == "6m" and tf["granularity"] == "month"
    # At least one trend field length matches the window
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["pipelineTrend"]) == expect

def test_sales_kpi_units_and_series_len(client: TestClient):
    # win_rate -> unit %
    r = client.get("/api/sales/kpis/win_rate?range=6m&granularity=month&by=customer")
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "win_rate"
    assert data["unit"] == "%"
    tf = data["timeframe"]
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["series"]) == expect


# ======================= Marketing =======================

def test_marketing_overview_basic(client: TestClient):
    r = client.get("/api/marketing/overview?range=6m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    tf = data["timeframe"]
    assert tf["range"] == "6m" and tf["granularity"] == "month"
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["visitsTrend"]) == expect

def test_marketing_kpi_conversion_unit_and_series(client: TestClient):
    r = client.get("/api/marketing/kpis/conversion?range=6m&granularity=month&by=source")
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "conversion"
    assert data["unit"] == "%"
    tf = data["timeframe"]
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["series"]) == expect


# ======================== Supply ========================

def test_supply_overview_basic(client: TestClient):
    r = client.get("/api/supply/overview?range=6m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    tf = data["timeframe"]
    assert tf["range"] == "6m" and tf["granularity"] == "month"
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["leadTimeTrend"]) == expect

def test_supply_kpi_lead_time_unit_and_series(client: TestClient):
    r = client.get("/api/supply/kpis/lead_time?range=6m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "lead_time"
    assert data["unit"] == "days"
    tf = data["timeframe"]
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["series"]) == expect


# ===================== Manufacturing =====================

def test_manufacturing_overview_basic(client: TestClient):
    r = client.get("/api/manufacturing/overview?range=6m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    tf = data["timeframe"]
    assert tf["range"] == "6m" and tf["granularity"] == "month"
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    # One of the quality trends
    assert len(data["qualityTrend"]) == expect

def test_manufacturing_kpi_uptime_unit_and_series(client: TestClient):
    r = client.get("/api/manufacturing/kpis/uptime?range=6m&granularity=month&by=fault_type")
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "uptime"
    assert data["unit"] == "%"
    tf = data["timeframe"]
    expect = _period_count(tf["start_date"], tf["end_date"], tf["granularity"])
    assert len(data["series"]) == expect
