# backend/app/api/ai_summary.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
import os, math, time, logging

# ---- Optional OpenAI import (graceful fallback) ----
_OPENAI_AVAILABLE = False
try:
    import openai  # SDK v1.x
    _OPENAI_AVAILABLE = True
except Exception:
    pass

router = APIRouter(prefix="/api", tags=["ai"])

# -------------------- Schemas --------------------

class KpiItem(BaseModel):
    key: str
    label: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    delta: Optional[float] = None
    direction: Optional[Literal["up", "down", "flat"]] = None

class RevenuePoint(BaseModel):
    period: str
    recognized: Optional[float] = 0
    booked: Optional[float] = 0
    backlog: Optional[float] = 0

class Timeframe(BaseModel):
    range: Optional[Literal["6m", "12m"]] = "12m"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    granularity: Optional[Literal["month", "quarter"]] = "month"

class AlertItem(BaseModel):
    id: int
    type: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: Optional[Literal["low", "medium", "high"]] = "low"
    created_at: Optional[str] = None

class RiskItem(BaseModel):
    id: int
    title: str
    owner: Optional[str] = None
    due: Optional[str] = None
    mitigation: Optional[str] = None
    status: Optional[str] = None

class DashboardPayload(BaseModel):
    timeframe: Optional[Timeframe] = None
    executiveKpis: Optional[List[KpiItem]] = Field(default_factory=list)
    revenueTrend: Optional[List[RevenuePoint]] = Field(default_factory=list)
    alerts: Optional[List[AlertItem]] = Field(default_factory=list)
    risks: Optional[List[RiskItem]] = Field(default_factory=list)

class AiSummaryRequest(BaseModel):
    data: DashboardPayload
    question: Optional[str] = None
    provider: Optional[Literal["openai", "auto", "none"]] = "auto"
    model: Optional[str] = None
    max_tokens: Optional[int] = 400
    temperature: Optional[float] = 0.2

class AiSummaryResponse(BaseModel):
    source: Literal["openai", "heuristic"]
    summary: str
    highlights: List[str] = Field(default_factory=list)
    cautions: List[str] = Field(default_factory=list)
    actions: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)

# -------------------- Helpers --------------------

def _format_pct(x: Optional[float]) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "—"
    return f"{x*100:.1f}%"

def _pick(kpis: List[KpiItem], key: str) -> Optional[KpiItem]:
    for k in kpis:
        if k.key == key:
            return k
    return None

def _is_greeting(q: Optional[str]) -> bool:
    """Detect simple English greetings."""
    if not q:
        return False
    ql = q.strip().lower()
    greetings = ["hi", "hello", "hey", "yo", "hola", "hi there", "good morning", "good afternoon", "good evening"]
    return any(ql.startswith(g) or ql == g for g in greetings)

def _heuristic_summary(payload: DashboardPayload, question: Optional[str]) -> AiSummaryResponse:
    """Enhanced heuristic summary with better analysis and insights."""
    kpis = payload.executiveKpis or []
    tf = payload.timeframe
    gran = tf.granularity if tf else "month"
    rng = tf.range if tf else "12m"

    rev = _pick(kpis, "revenue")
    bkl = _pick(kpis, "backlog")
    upt = _pick(kpis, "uptime")
    nrr = _pick(kpis, "nrr")
    gm  = _pick(kpis, "gm")
    pback = _pick(kpis, "payback")
    cac = _pick(kpis, "cac")
    ltv = _pick(kpis, "ltv")

    # Analyze all deltas to find patterns
    deltas = [(k.key, k.delta or 0, k.label or k.key, k.value) for k in kpis if k.delta is not None]
    deltas.sort(key=lambda x: abs(x[1]), reverse=True)
    top_up = next((d for d in deltas if d[1] > 0), None)
    top_down = next((d for d in deltas if d[1] < 0), None)
    positive_deltas = [d for d in deltas if d[1] > 0.02]  # >2% improvement
    negative_deltas = [d for d in deltas if d[1] < -0.02]  # >2% decline

    # Build summary with context
    summary_parts = []
    if rev:
        rev_val = f"{rev.value:,.0f}{rev.unit or ''}"
        rev_delta = _format_pct(rev.delta) if rev.delta else "stable"
        summary_parts.append(f"Revenue at {rev_val} ({rev_delta} change)")
    
    if len(positive_deltas) > len(negative_deltas):
        summary_parts.append(f"{len(positive_deltas)} metrics improving")
    elif len(negative_deltas) > len(positive_deltas):
        summary_parts.append(f"{len(negative_deltas)} metrics declining")
    
    summary = f"Over {rng} ({gran}ly view): " + ". ".join(summary_parts) if summary_parts else f"Analyzing {rng} period"
    
    if question:
        q_category = _categorize_question(question)
        if q_category == "trend_analysis":
            summary += f" | Analyzing trends for: {question}"
        elif q_category == "explanation":
            summary += f" | Explaining: {question}"

    # Enhanced highlights
    highlights = []
    if top_up:
        highlights.append(f"🎯 {top_up[2]} improved by {_format_pct(top_up[1])} - strongest positive change")
    
    if rev and rev.delta and rev.delta > 0.05:
        highlights.append(f"📈 Revenue growth of {_format_pct(rev.delta)} exceeds 5% threshold")
    elif rev and rev.delta and rev.delta > 0:
        highlights.append(f"📈 Revenue trending up ({_format_pct(rev.delta)})")
    
    if nrr and nrr.value and nrr.value >= 1.10:
        highlights.append(f"🚀 Strong NRR at {nrr.value:.2f} - significant expansion momentum")
    elif nrr and nrr.value and nrr.value >= 1.00:
        highlights.append(f"✅ NRR at {nrr.value:.2f} - healthy net expansion")
    
    if gm and gm.value and gm.value >= 0.40:
        highlights.append(f"💰 Gross margin at {_format_pct(gm.value)} - strong profitability")
    
    if ltv and cac and ltv.value and cac.value and ltv.value > 0 and cac.value > 0:
        ltv_cac_ratio = ltv.value / cac.value
        if ltv_cac_ratio >= 3.0:
            highlights.append(f"💎 LTV:CAC ratio of {ltv_cac_ratio:.1f}x indicates strong unit economics")
    
    if upt and upt.value and upt.value >= 0.995:
        highlights.append(f"⚡ Uptime at {_format_pct(upt.value)} - excellent reliability")
    
    if bkl and bkl.delta and bkl.delta > 0.10:
        highlights.append(f"📦 Backlog increased {_format_pct(bkl.delta)} - strong forward visibility")

    # Enhanced cautions with severity
    cautions = []
    if bkl and bkl.delta is not None and bkl.delta < -0.10:
        cautions.append("⚠️ Backlog declined >10% - investigate booking trends and pipeline health")
    elif bkl and bkl.delta is not None and bkl.delta < -0.05:
        cautions.append("⚠️ Backlog dropped >5% - monitor delivery velocity vs new bookings")
    
    if gm and gm.value is not None and gm.value < 0.25:
        cautions.append("🔴 Gross margin <25% - critical: review pricing, COGS, and service costs")
    elif gm and gm.value is not None and gm.value < 0.30:
        cautions.append("⚠️ Gross margin <30% - investigate COGS variance and service cost drivers")
    
    if nrr and nrr.value is not None and nrr.value < 0.90:
        cautions.append("🔴 NRR <90% - significant churn risk; prioritize retention and expansion")
    elif nrr and nrr.value is not None and nrr.value < 0.95:
        cautions.append("⚠️ NRR <95% - assess churn drivers and expansion pipeline health")
    
    if upt and upt.value is not None and upt.value < 0.98:
        cautions.append("🔴 Uptime <98% - critical reliability issues; review incident patterns")
    elif upt and upt.value is not None and upt.value < 0.985:
        cautions.append("⚠️ Uptime <98.5% - review MTTR/MTBF and quality gate metrics")
    
    if ltv and cac and ltv.value and cac.value and ltv.value > 0 and cac.value > 0:
        ltv_cac_ratio = ltv.value / cac.value
        if ltv_cac_ratio < 2.0:
            cautions.append(f"⚠️ LTV:CAC ratio {ltv_cac_ratio:.1f}x below 3:1 target - optimize acquisition efficiency")
    
    if pback and pback.value and pback.value > 12:
        cautions.append(f"⚠️ Payback period {pback.value:.1f} months - consider optimizing sales efficiency")
    
    if top_down and abs(top_down[1]) > 0.10:
        cautions.append(f"📉 {top_down[2]} declined {_format_pct(top_down[1])} - investigate root cause")
    
    if payload.alerts:
        high_severity = [a for a in payload.alerts if a.severity == "high"]
        if high_severity:
            a = high_severity[0]
            cautions.append(f"🔴 HIGH SEVERITY ALERT: {a.title}")
        else:
            a = payload.alerts[0]
            cautions.append(f"⚠️ Active alert: [{a.severity}] {a.title}")

    # Enhanced actions with priority
    actions = []
    if bkl and bkl.value and rev and rev.value:
        coverage_months = (bkl.value / max(rev.value/6.0, 1e-6))
        if coverage_months < 3:
            actions.append("🔴 URGENT: Coverage <3 months - accelerate bookings or adjust burn rate")
        elif coverage_months < 4:
            actions.append("📋 Coverage <4 months - review pipeline and prioritize high-probability deals")
        elif coverage_months > 8:
            actions.append("📋 Coverage >8 months - consider accelerating delivery or adjusting capacity")
    
    if gm and gm.value and gm.value < 0.35:
        actions.append("📋 Deep-dive COGS variance analysis; review warranty costs and field service efficiency")
    
    if nrr and nrr.value and nrr.value < 1.0:
        actions.append("📋 Develop expansion playbook for top 20 accounts; conduct churn analysis interviews")
    
    if upt and upt.value and upt.value < 0.99:
        actions.append("📋 Review recent incident post-mortems; implement preventive measures for recurring issues")
    
    if len(negative_deltas) >= 3:
        actions.append("📋 Multiple metrics declining - schedule cross-functional review to identify common drivers")
    
    if not actions:
        if len(positive_deltas) >= 3:
            actions.append("✅ Strong performance across metrics - maintain momentum and scale successful initiatives")
        else:
            actions.append("📋 Review detailed metrics for optimization opportunities")

    return AiSummaryResponse(
        source="heuristic",
        summary=summary[:400],
        highlights=highlights[:4],
        cautions=cautions[:4],
        actions=actions[:4],
        meta={"provider": "none", "heuristic": True, "enhanced": True},
    )

def _analyze_trends(revenue_trend: List[RevenuePoint]) -> Dict[str, Any]:
    """Analyze revenue trends to provide context."""
    if not revenue_trend or len(revenue_trend) < 2:
        return {}
    
    trends = {}
    # Calculate growth rates
    recent = revenue_trend[-3:] if len(revenue_trend) >= 3 else revenue_trend
    if len(recent) >= 2:
        rec_growth = []
        book_growth = []
        for i in range(1, len(recent)):
            prev_rec = recent[i-1].recognized or 0
            curr_rec = recent[i].recognized or 0
            prev_book = recent[i-1].booked or 0
            curr_book = recent[i].booked or 0
            if prev_rec > 0:
                rec_growth.append((curr_rec - prev_rec) / prev_rec)
            if prev_book > 0:
                book_growth.append((curr_book - prev_book) / prev_book)
        
        if rec_growth:
            trends["avg_revenue_growth"] = sum(rec_growth) / len(rec_growth)
            trends["revenue_accelerating"] = len(rec_growth) >= 2 and rec_growth[-1] > rec_growth[0]
        if book_growth:
            trends["avg_booking_growth"] = sum(book_growth) / len(book_growth)
            trends["booking_accelerating"] = len(book_growth) >= 2 and book_growth[-1] > book_growth[0]
    
    # Backlog trend
    if len(revenue_trend) >= 2:
        latest_bkl = revenue_trend[-1].backlog or 0
        prev_bkl = revenue_trend[-2].backlog or 0
        if prev_bkl > 0:
            trends["backlog_change_pct"] = (latest_bkl - prev_bkl) / prev_bkl
    
    return trends

def _categorize_question(question: Optional[str]) -> str:
    """Categorize user question to provide better context."""
    if not question:
        return "general"
    ql = question.lower()
    
    if any(word in ql for word in ["why", "reason", "cause", "explain"]):
        return "explanation"
    elif any(word in ql for word in ["trend", "change", "move", "shift"]):
        return "trend_analysis"
    elif any(word in ql for word in ["action", "should", "recommend", "next", "do"]):
        return "action_request"
    elif any(word in ql for word in ["compare", "vs", "versus", "difference"]):
        return "comparison"
    elif any(word in ql for word in ["forecast", "predict", "future", "outlook"]):
        return "forecast"
    else:
        return "general"

def _build_prompt(payload: DashboardPayload, question: Optional[str]) -> str:
    """Build an enhanced, structured prompt for AI analysis."""
    kpis = payload.executiveKpis or []
    lines = []
    
    # Enhanced system context
    lines.append("You are a senior executive business analyst. Provide strategic insights with:")
    lines.append("- Clear, concise summaries (1-2 sentences)")
    lines.append("- Actionable highlights (key wins/opportunities)")
    lines.append("- Risk-aware cautions (what to watch)")
    lines.append("- Specific next actions (what to do next)")
    lines.append("")
    
    # Timeframe context
    tf = payload.timeframe
    lines.append("=== CONTEXT ===")
    lines.append(
        f"Time Period: {getattr(tf,'range','12m')} window, {getattr(tf,'granularity','month')}ly granularity"
    )
    if tf and tf.start_date:
        lines.append(f"Date Range: {tf.start_date} to {tf.end_date or 'present'}")
    lines.append("")
    
    # KPI analysis with context
    lines.append("=== KEY METRICS ===")
    def _fmt_k(k: KpiItem) -> str:
        val = f"{k.value:,.2f}" if isinstance(k.value, float) else str(k.value)
        dlt = _format_pct(k.delta) if k.delta is not None else "no change"
        direction_emoji = {"up": "↑", "down": "↓", "flat": "→"}.get(k.direction, "")
        label = k.label or k.key.replace("_", " ").title()
        return f"{label}: {val}{k.unit or ''} ({dlt} {direction_emoji})"
    
    if kpis:
        # Group KPIs by category
        financial = [k for k in kpis if k.key in ["revenue", "gm", "cac", "ltv", "payback"]]
        operational = [k for k in kpis if k.key in ["uptime", "mttr", "mtbf", "quality"]]
        growth = [k for k in kpis if k.key in ["nrr", "arr", "mrr", "churn"]]
        pipeline = [k for k in kpis if k.key in ["backlog", "bookings", "pipeline"]]
        
        if financial:
            lines.append("Financial: " + " | ".join(_fmt_k(k) for k in financial[:5]))
        if growth:
            lines.append("Growth: " + " | ".join(_fmt_k(k) for k in growth[:5]))
        if operational:
            lines.append("Operations: " + " | ".join(_fmt_k(k) for k in operational[:5]))
        if pipeline:
            lines.append("Pipeline: " + " | ".join(_fmt_k(k) for k in pipeline[:5]))
    lines.append("")
    
    # Revenue trend analysis
    rt = payload.revenueTrend or []
    if rt:
        lines.append("=== REVENUE TREND ===")
        trends = _analyze_trends(rt)
        if len(rt) >= 3:
            lines.append("Last 3 periods:")
            for p in rt[-3:]:
                rec = p.recognized or 0
                book = p.booked or 0
                bkl = p.backlog or 0
                lines.append(f"  {p.period}: Recognized={rec:,.0f} | Booked={book:,.0f} | Backlog={bkl:,.0f}")
        
        if trends:
            if "avg_revenue_growth" in trends:
                growth_pct = trends["avg_revenue_growth"] * 100
                lines.append(f"Revenue Growth Rate: {growth_pct:+.1f}% (avg)")
                if trends.get("revenue_accelerating"):
                    lines.append("⚠️ Revenue growth is accelerating")
            if "backlog_change_pct" in trends:
                bkl_pct = trends["backlog_change_pct"] * 100
                lines.append(f"Backlog Change: {bkl_pct:+.1f}%")
        lines.append("")
    
    # Alerts and risks
    if payload.alerts:
        lines.append("=== ACTIVE ALERTS ===")
        for alert in payload.alerts[:3]:
            lines.append(f"[{alert.severity.upper()}] {alert.title}")
            if alert.description:
                lines.append(f"  {alert.description[:100]}")
        lines.append("")
    
    if payload.risks:
        lines.append("=== RISKS ===")
        for risk in payload.risks[:3]:
            lines.append(f"{risk.title} (Owner: {risk.owner or 'TBD'}, Status: {risk.status or 'Open'})")
            if risk.mitigation:
                lines.append(f"  Mitigation: {risk.mitigation[:100]}")
        lines.append("")
    
    # Question context
    if question:
        q_category = _categorize_question(question)
        lines.append("=== USER QUESTION ===")
        lines.append(f"Question: {question}")
        lines.append(f"Question Type: {q_category}")
        lines.append("")
        lines.append("Provide a focused answer addressing the question, using the data above.")
    else:
        lines.append("=== REQUEST ===")
        lines.append("Provide an executive summary of the current business state.")
    
    lines.append("")
    lines.append("=== OUTPUT FORMAT ===")
    lines.append("Structure your response as:")
    lines.append("SUMMARY: [1-2 sentence overview]")
    lines.append("HIGHLIGHTS: [2-3 key positive points, one per line]")
    lines.append("CAUTIONS: [2-3 concerns or risks, one per line]")
    lines.append("ACTIONS: [2-3 specific next steps, one per line]")
    
    return "\n".join(lines)

def _call_openai(prompt: str, model: Optional[str], max_tokens: int, temperature: float) -> Optional[str]:
    if not _OPENAI_AVAILABLE:
        return None
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        client = openai.OpenAI(api_key=api_key)
        used_model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        resp = client.chat.completions.create(
            model=used_model,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": "Be precise, executive tone, return concise bullets."},
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content.strip() if resp and resp.choices else None
    except Exception as e:
        logging.warning("OpenAI call failed: %s", e)
        return None

_LAST_CALL_TS = 0.0
_MIN_INTERVAL_SEC = 2.0  # naive rate limit

@router.post("/ai-summary", response_model=AiSummaryResponse)
def ai_summary(req: AiSummaryRequest):
    global _LAST_CALL_TS
    now = time.time()
    if now - _LAST_CALL_TS < _MIN_INTERVAL_SEC:
        raise HTTPException(status_code=429, detail="Too many requests")
    _LAST_CALL_TS = now

    # Greetings: reply politely even without an OpenAI key
    if _is_greeting(req.question):
        kpis = (req.data.executiveKpis or [])
        rev = next((k for k in kpis if k.key == "revenue"), None)
        bkl = next((k for k in kpis if k.key == "backlog"), None)
        nrr = next((k for k in kpis if k.key == "nrr"), None)
        snap = []
        if rev and rev.value is not None: snap.append(f"Revenue: {rev.value:,.0f}{rev.unit or ''}")
        if bkl and bkl.value is not None: snap.append(f"Backlog: {bkl.value:,.0f}{bkl.unit or ''}")
        if nrr and nrr.value is not None: snap.append(f"NRR: {nrr.value:.2f}")
        hello = "Hello!"
        return AiSummaryResponse(
            source="heuristic",
            summary=f"{hello} I can answer questions about your current KPIs and trends.",
            highlights=[(" | ".join(snap))] if snap else [],
            cautions=[],
            actions=["Try asking: Why did backlog move last month?"],
            meta={"greeting": True}
        )

    # Prefer OpenAI when available
    if (req.provider or "auto") in ("auto", "openai"):
        prompt = _build_prompt(req.data, req.question)
        text = _call_openai(
            prompt=prompt,
            model=req.model,
            max_tokens=min(max(req.max_tokens or 400, 200), 800),
            temperature=req.temperature or 0.2,
        )
        if text:
            def _parse_structured_response(txt: str) -> Dict[str, List[str]]:
                """Parse structured AI response into sections."""
                sections = {
                    "summary": "",
                    "highlights": [],
                    "cautions": [],
                    "actions": []
                }
                
                current_section = None
                for line in txt.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Detect section headers
                    line_lower = line.lower()
                    if line_lower.startswith("summary:"):
                        current_section = "summary"
                        sections["summary"] = line[8:].strip()
                        continue
                    elif line_lower.startswith("highlights:"):
                        current_section = "highlights"
                        content = line[11:].strip()
                        if content:
                            sections["highlights"].append(content)
                        continue
                    elif line_lower.startswith("cautions:"):
                        current_section = "cautions"
                        content = line[9:].strip()
                        if content:
                            sections["cautions"].append(content)
                        continue
                    elif line_lower.startswith("actions:"):
                        current_section = "actions"
                        content = line[8:].strip()
                        if content:
                            sections["actions"].append(content)
                        continue
                    
                    # Add content to current section
                    if current_section:
                        cleaned = line.strip("•-* ").strip()
                        if cleaned:
                            if current_section == "summary":
                                if sections["summary"]:
                                    sections["summary"] += " " + cleaned
                                else:
                                    sections["summary"] = cleaned
                            elif current_section in sections:
                                sections[current_section].append(cleaned)
                    elif not sections["summary"]:
                        # First non-empty line without section header = summary
                        sections["summary"] = cleaned
                
                return sections
            
            parsed = _parse_structured_response(text)
            
            # Fallback: if parsing didn't work well, use simple extraction
            if not parsed["summary"]:
                first_line = text.split("\n")[0].strip()
                parsed["summary"] = first_line[:320] if len(first_line) > 320 else first_line
            
            if not parsed["highlights"] and not parsed["cautions"] and not parsed["actions"]:
                # Fallback to line-by-line parsing
                for line in text.splitlines():
                    cleaned = line.strip("•-* ").strip()
                    if cleaned and len(cleaned) > 10:
                        if not parsed["highlights"]:
                            parsed["highlights"].append(cleaned)
                        elif len(parsed["highlights"]) < 3:
                            parsed["highlights"].append(cleaned)
                        elif not parsed["cautions"]:
                            parsed["cautions"].append(cleaned)
                        elif len(parsed["cautions"]) < 2:
                            parsed["cautions"].append(cleaned)
                        elif len(parsed["actions"]) < 2:
                            parsed["actions"].append(cleaned)

            return AiSummaryResponse(
                source="openai",
                summary=parsed["summary"][:400] if parsed["summary"] else text[:400],
                highlights=parsed["highlights"][:4],
                cautions=parsed["cautions"][:4],
                actions=parsed["actions"][:4],
                meta={"provider": "openai", "parsed": True},
            )

    # Fallback: heuristic summary
    return _heuristic_summary(req.data, req.question)
