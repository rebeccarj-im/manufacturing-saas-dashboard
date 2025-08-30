from pydantic import BaseModel
from typing import List, Literal, Optional, Dict

ApiRange = Literal["6m", "12m"]
Granularity = Literal["month", "quarter"]
KpiKey = Literal[
    "revenue",
    "backlog",
    "gm",
    "arr",
    "payback",
    "book_to_bill",
    "coverage_months",
    "uptime",
    "nrr",
    "forecast",
]

class Timeframe(BaseModel):
    range: ApiRange
    start_date: str
    end_date: str
    granularity: Granularity

class ExecKpi(BaseModel):
    key: KpiKey
    label: str
    value: float
    unit: Optional[str] = None
    delta: Optional[float] = None
    direction: Optional[Literal["up", "down", "flat"]] = None

class RevenuePoint(BaseModel):
    period: str
    recognized: float
    booked: Optional[float] = 0
    backlog: Optional[float] = 0

class OverviewResp(BaseModel):
    timeframe: Timeframe
    kpis: List[ExecKpi]
    revenueTrend: List[RevenuePoint]

class DrillPoint(BaseModel):
    period: str
    # Dynamic field container: the frontend will plot multiple lines by key name
    # (e.g., value / recognized / booked / backlog / gm, etc.)
    values: Dict[str, float]

class BreakdownRow(BaseModel):
    name: str
    value: float
    share: Optional[float] = None

class DrillResp(BaseModel):
    timeframe: Timeframe
    metric: KpiKey
    series: List[Dict[str, float]]  # each dict must include at least the 'period' field
    breakdown: List[BreakdownRow]
    unit: Optional[str] = None
