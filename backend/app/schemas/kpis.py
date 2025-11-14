from typing import List, Literal, Optional
from pydantic import BaseModel

ApiRange = Literal["6m", "12m"]
Granularity = Literal["month", "quarter"]

class Timeframe(BaseModel):
    range: ApiRange
    start_date: str
    end_date: str
    granularity: Granularity

class ExecKpi(BaseModel):
    key: str
    label: str
    value: float
    unit: Optional[str] = None
    # Fields compatible with the initial screen (may be omitted in drilldowns).
    delta: Optional[float] = None
    direction: Optional[Literal["up", "down", "flat"]] = None

class TrendPoint(BaseModel):
    period: str
    value: float

class BreakdownItem(BaseModel):
    name: str
    value: float
    delta: Optional[float] = None

class KpiResponse(BaseModel):
    timeframe: Timeframe
    kpi: ExecKpi
    trend: List[TrendPoint]
    breakdown: List[BreakdownItem]
    meta: dict = {}
