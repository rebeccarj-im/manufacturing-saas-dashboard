from fastapi import APIRouter
from datetime import datetime
router = APIRouter(prefix="/api", tags=["alerts"])

@router.get("/alerts")
def list_alerts():
    # simple static example; primary alerts are embedded in /executive-dashboard
    now = datetime.utcnow().isoformat()
    return [
        {"id":"info:1","level":"info","message":"All systems nominal","created_at":now},
    ]
