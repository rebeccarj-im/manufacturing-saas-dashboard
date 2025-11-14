# backend/app/api/search.py
from fastapi import APIRouter, Query
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["search"])


class SearchResult(BaseModel):
    id: str
    title: str
    description: str
    type: str  # "page", "kpi", "dashboard", "module"
    url: str
    category: Optional[str] = None


# Define searchable content
SEARCHABLE_CONTENT = [
    # Pages
    SearchResult(
        id="page:dashboard",
        title="Executive Dashboard",
        description="Main executive dashboard with KPIs and metrics",
        type="page",
        url="/dashboard",
        category="Pages"
    ),
    SearchResult(
        id="page:finance",
        title="Finance Overview",
        description="Financial metrics, revenue trends, and financial KPIs",
        type="page",
        url="/finance",
        category="Pages"
    ),
    SearchResult(
        id="page:sales",
        title="Sales Overview",
        description="Sales pipeline, win rates, and sales performance",
        type="page",
        url="/sales",
        category="Pages"
    ),
    SearchResult(
        id="page:marketing",
        title="Marketing Overview",
        description="Marketing metrics, campaigns, and marketing KPIs",
        type="page",
        url="/marketing",
        category="Pages"
    ),
    SearchResult(
        id="page:supply",
        title="Supply Chain",
        description="Supply chain metrics, inventory, and logistics",
        type="page",
        url="/supply",
        category="Pages"
    ),
    SearchResult(
        id="page:manufacturing",
        title="Manufacturing",
        description="Manufacturing operations, quality, and production metrics",
        type="page",
        url="/manufacturing",
        category="Pages"
    ),
    SearchResult(
        id="page:calendar",
        title="Calendar",
        description="Calendar with meetings and schedule management",
        type="page",
        url="/calendar",
        category="Pages"
    ),
    # KPIs
    SearchResult(
        id="kpi:revenue",
        title="Revenue",
        description="Total revenue and revenue trends",
        type="kpi",
        url="/dashboard",
        category="KPIs"
    ),
    SearchResult(
        id="kpi:backlog",
        title="Backlog",
        description="Order backlog and backlog trends",
        type="kpi",
        url="/dashboard",
        category="KPIs"
    ),
    SearchResult(
        id="kpi:nrr",
        title="Net Revenue Retention (NRR)",
        description="Net revenue retention rate",
        type="kpi",
        url="/dashboard",
        category="KPIs"
    ),
    SearchResult(
        id="kpi:gm",
        title="Gross Margin",
        description="Gross margin percentage",
        type="kpi",
        url="/dashboard",
        category="KPIs"
    ),
    SearchResult(
        id="kpi:arr",
        title="Annual Recurring Revenue (ARR)",
        description="Annual recurring revenue",
        type="kpi",
        url="/dashboard",
        category="KPIs"
    ),
    SearchResult(
        id="kpi:uptime",
        title="Uptime",
        description="System uptime percentage",
        type="kpi",
        url="/dashboard",
        category="KPIs"
    ),
    # Modules
    SearchResult(
        id="module:finance",
        title="Finance Module",
        description="Financial analysis and reporting module",
        type="module",
        url="/finance",
        category="Modules"
    ),
    SearchResult(
        id="module:sales",
        title="Sales Module",
        description="Sales pipeline and performance module",
        type="module",
        url="/sales",
        category="Modules"
    ),
    SearchResult(
        id="module:marketing",
        title="Marketing Module",
        description="Marketing analytics and campaigns module",
        type="module",
        url="/marketing",
        category="Modules"
    ),
    SearchResult(
        id="module:supply",
        title="Supply Chain Module",
        description="Supply chain and logistics module",
        type="module",
        url="/supply",
        category="Modules"
    ),
    SearchResult(
        id="module:manufacturing",
        title="Manufacturing Module",
        description="Manufacturing operations module",
        type="module",
        url="/manufacturing",
        category="Modules"
    ),
]


@router.get("/search", response_model=List[SearchResult])
def search(
    q: str = Query(..., description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results"),
):
    """
    Search across pages, KPIs, and modules.
    
    Returns results matching the search query, ordered by relevance.
    """
    query_lower = q.lower().strip()
    if not query_lower:
        return []
    
    # Simple keyword matching
    results = []
    for item in SEARCHABLE_CONTENT:
        score = 0
        title_lower = item.title.lower()
        desc_lower = item.description.lower()
        
        # Exact title match gets highest score
        if query_lower in title_lower:
            if title_lower.startswith(query_lower):
                score = 100
            else:
                score = 50
        
        # Description match gets lower score
        elif query_lower in desc_lower:
            score = 25
        
        # Category match
        elif item.category and query_lower in item.category.lower():
            score = 10
        
        if score > 0:
            results.append((score, item))
    
    # Sort by score (descending) and return top results
    results.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in results[:limit]]

