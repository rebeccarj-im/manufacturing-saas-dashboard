from pydantic import BaseModel
from typing import List, Optional, Literal

DateRange = Literal["7d","30d","90d","ytd","custom"]

class TrendPoint(BaseModel):
    date: str
    value: float

class KPIBlock(BaseModel):
    revenue: float
    revenue_change_pct: Optional[float] = None
    gross_margin_pct: float
    orders: int
    aov: float
    active_customers: int
    churn_rate_pct: float
    nps: float
    cac: Optional[float] = None
    ltv: Optional[float] = None
    arr: Optional[float] = None

class DashboardResponse(BaseModel):
    last_updated: str
    kpis: KPIBlock
    trends: dict
    sales_funnel: Optional[list] = None
    top_products: Optional[list] = None
    alerts: Optional[list] = None
    risks: Optional[list] = None
