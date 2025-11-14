"""
KPIs API module for manufacturing dashboard.
Provides key performance indicators and metrics endpoints.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
import random
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/kpis", tags=["kpis"])

# Mock data generators
def generate_timeframe():
    """Generate a default timeframe."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=180)  # 6 months
    return {
        "range": "6m",
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "granularity": "month"
    }

def generate_kpi_data():
    """Generate mock KPI data for demonstration."""
    return {
        "overall_equipment_effectiveness": round(random.uniform(0.75, 0.95), 3),
        "production_yield": round(random.uniform(0.85, 0.98), 3),
        "throughput": random.randint(1000, 5000),
        "downtime_percentage": round(random.uniform(0.02, 0.08), 3),
        "quality_rate": round(random.uniform(0.92, 0.99), 3),
        "on_time_delivery": round(random.uniform(0.88, 0.97), 3),
        "overall_productivity": round(random.uniform(0.80, 0.94), 3),
        "capacity_utilization": round(random.uniform(0.75, 0.92), 3),
        "scrap_rate": round(random.uniform(0.01, 0.05), 3),
        "maintenance_compliance": round(random.uniform(0.85, 0.98), 3),
        "timestamp": datetime.now().isoformat()
    }

def generate_trend_points(days: int = 30):
    """Generate trend data for the specified number of days."""
    trends = []
    base_date = datetime.now() - timedelta(days=days)
    
    for i in range(days):
        date = base_date + timedelta(days=i)
        trends.append({
            "date": date.strftime("%Y-%m-%d"),
            "oee": round(random.uniform(0.70, 0.96), 3),
            "yield": round(random.uniform(0.80, 0.98), 3),
            "throughput": random.randint(800, 5200),
            "downtime": round(random.uniform(0.01, 0.10), 3)
        })
    
    return trends

def generate_breakdown():
    """Generate breakdown data by department."""
    departments = [
        "Assembly Line A", "Assembly Line B", "Machining", 
        "Quality Control", "Packaging", "Shipping"
    ]
    breakdown = []
    for dept in departments:
        breakdown.append({
            "name": dept,
            "value": round(random.uniform(0.80, 0.98), 3),
            "delta": round(random.uniform(-0.05, 0.05), 3),
            "target": 0.95,
            "status": "above_target" if random.random() > 0.3 else "below_target"
        })
    return breakdown

def generate_kpi_metadata():
    """Generate KPI metadata and definitions."""
    return {
        "overall_equipment_effectiveness": {
            "name": "Overall Equipment Effectiveness",
            "description": "Measures how effectively manufacturing equipment is being utilized",
            "unit": "%",
            "target": 0.85,
            "category": "efficiency"
        },
        "production_yield": {
            "name": "Production Yield",
            "description": "Percentage of products that meet quality standards",
            "unit": "%",
            "target": 0.95,
            "category": "quality"
        },
        "throughput": {
            "name": "Production Throughput",
            "description": "Number of units produced per time period",
            "unit": "units",
            "target": 4500,
            "category": "production"
        },
        "downtime_percentage": {
            "name": "Downtime Percentage",
            "description": "Percentage of time equipment is not operational",
            "unit": "%",
            "target": 0.05,
            "category": "reliability"
        }
    }

# API Endpoints
@router.get("/")
async def get_all_kpis():
    """Get all current KPI metrics."""
    return generate_kpi_data()

@router.get("/trends")
async def get_kpi_trends(days: int = Query(30, ge=7, le=365)):
    """Get KPI trends for the specified number of days."""
    return generate_trend_points(days)

@router.get("/breakdown")
async def get_kpi_breakdown():
    """Get KPI breakdown by department or line."""
    return generate_breakdown()

@router.get("/metadata")
async def get_kpi_metadata():
    """Get KPI metadata and definitions."""
    return generate_kpi_metadata()

@router.get("/{kpi_id}")
async def get_kpi_detail(kpi_id: str):
    """Get detailed information for a specific KPI."""
    kpis = generate_kpi_data()
    metadata = generate_kpi_metadata()
    
    if kpi_id not in kpis:
        raise HTTPException(status_code=404, detail="KPI not found")
    
    kpi_meta = metadata.get(kpi_id, {
        "name": kpi_id.replace("_", " ").title(),
        "description": "Key performance indicator",
        "unit": "%",
        "category": "general"
    })
    
    return {
        "kpi_id": kpi_id,
        "value": kpis[kpi_id],
        "metadata": kpi_meta,
        "target": kpi_meta.get("target", 0.9),
        "status": "above_target" if kpis[kpi_id] > kpi_meta.get("target", 0.9) else "below_target",
        "timestamp": datetime.now().isoformat()
    }

@router.get("/{kpi_id}/history")
async def get_kpi_history(kpi_id: str, days: int = Query(30, ge=7, le=365)):
    """Get historical data for a specific KPI."""
    trends = generate_trend_points(days)
    kpis = generate_kpi_data()
    
    if kpi_id not in kpis:
        raise HTTPException(status_code=404, detail="KPI not found")
    
    history = []
    for trend in trends:
        if kpi_id == "overall_equipment_effectiveness":
            history.append({"date": trend["date"], "value": trend["oee"]})
        elif kpi_id == "production_yield":
            history.append({"date": trend["date"], "value": trend["yield"]})
        elif kpi_id == "throughput":
            history.append({"date": trend["date"], "value": trend["throughput"]})
        elif kpi_id == "downtime_percentage":
            history.append({"date": trend["date"], "value": trend["downtime"]})
        else:
            # For other KPIs, generate random historical data
            base_value = kpis[kpi_id]
            variation = random.uniform(-0.1, 0.1) * base_value
            history.append({
                "date": trend["date"], 
                "value": round(base_value + variation, 3)
            })
    
    return history

@router.get("/{kpi_id}/comparison")
async def get_kpi_comparison(kpi_id: str):
    """Get KPI comparison with previous period."""
    kpis = generate_kpi_data()
    
    if kpi_id not in kpis:
        raise HTTPException(status_code=404, detail="KPI not found")
    
    current_value = kpis[kpi_id]
    previous_value = current_value * random.uniform(0.9, 1.1)
    change = current_value - previous_value
    change_percentage = (change / previous_value) * 100 if previous_value != 0 else 0
    
    return {
        "kpi_id": kpi_id,
        "current_value": current_value,
        "previous_value": round(previous_value, 3),
        "change": round(change, 3),
        "change_percentage": round(change_percentage, 2),
        "direction": "up" if change > 0 else "down",
        "period": "month_over_month"
    }

# Health check endpoint
@router.get("/health")
async def health_check():
    """KPI service health check."""
    return {
        "status": "healthy",
        "service": "kpis",
        "timestamp": datetime.now().isoformat(),
        "endpoints_available": [
            "/api/kpis/",
            "/api/kpis/trends",
            "/api/kpis/breakdown", 
            "/api/kpis/metadata",
            "/api/kpis/{kpi_id}",
            "/api/kpis/{kpi_id}/history",
            "/api/kpis/{kpi_id}/comparison"
        ]
    }