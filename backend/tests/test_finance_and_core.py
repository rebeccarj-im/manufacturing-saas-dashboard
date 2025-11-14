# backend/app/tests/test_finance_and_core.py
from fastapi.testclient import TestClient

def test_health(client: TestClient):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_executive_dashboard(client: TestClient):
    r = client.get("/api/executive-dashboard?range=6m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    assert "timeframe" in data and "executiveKpis" in data and "revenueTrend" in data

def test_finance_overview(client: TestClient):
    r = client.get("/api/finance/overview?range=12m&granularity=month")
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data and isinstance(data["kpis"], list)
    assert "revenueTrend" in data and isinstance(data["revenueTrend"], list)

def test_finance_kpi_revenue_drilldown(client: TestClient):
    r = client.get("/api/finance/kpis/revenue?range=6m&granularity=month&by=customer")
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "revenue"
    assert "series" in data and isinstance(data["series"], list)
    assert "breakdown" in data and isinstance(data["breakdown"], list)

def test_finance_kpi_gm_drilldown(client: TestClient):
    r = client.get("/api/finance/kpis/gm?range=6m&granularity=quarter&by=industry")
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "gm"
    assert data.get("unit") in (None, "%")  
