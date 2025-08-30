# Executive Dashboard – Product Requirements Document (PRD)

## 1. Background
Executives need to quickly answer:
- **Now** – How are core business metrics performing?
- **Reason** – What drives changes and where are the risks?
- **Action** – What should we do (which alerts/tasks require attention)?

Existing reporting is fragmented, laggy, and not interactive. The goal is a **single-screen, drillable Executive Dashboard** that loads within seconds and drives action.

---

## 2. Goals & Success Metrics

### Goals
- Single-screen aggregated view of core KPIs and operational highlights.
- Multi-dimensional drill-down for rapid root-cause discovery.
- Integrated alerts/risks to drive actions.
- Smooth performance for large displays.

### Success Metrics (MVP Acceptance)
- First-screen **TTFB < 300ms**, render complete **< 1s**
- Time granularity switch **< 200ms**
- Alert cards auto-refresh **every 30s**
- KPI drill-down accessible within **≤ 2 clicks**

---

## 3. Target Users & Use Cases

### Users
- CEO, CFO, COO, and senior executives
- Department heads (Finance, Operations, Sales, Marketing)

### Use Cases
- Weekly/monthly business reviews
- Sales forecasting & budget adjustments
- Operational anomaly monitoring (e.g., backlog spikes, uptime drops)
- Board/investor presentations

---

## 4. Features & Priorities

| Module | First-Screen Content | Implementation | Collaboration Value | Priority |
|---|---|---|---|---|
| Dashboard | “Now / Reason / Action”: 6 KPIs (Backlog, Uptime, NRR, GM%, Payback, Revenue) + 4 Highlights (Book-to-Bill, Coverage Months, ARR, Forecast) | React + ECharts (FE), FastAPI aggregation (BE), Vite proxy in dev | Addresses exec priorities | MVP |
| Prototype Design | Layout: KPI area / revenue trends / risk panel / tri-color alerts; M/Q granularity | Componentized cards; URL params; backend recalculation | Visual consistency | MVP |
| API Contract | `GET /api/executive-dashboard` returns `executiveKpis`, `revenueTrend`, `alerts`, `risks`, `timeframe` | FastAPI routes; SQLite aggregation; aligned TS types | Stable contract | MVP |
| Data Model | `orders, customers, expenses, revenue_trend, retention_nrr` tables; backlog is period-end | Indexed queries; unified logic; ratios for rates | Reduces mismatch | MVP |
| Acceptance Criteria | TTFB/render/switch/alert polling as above | Indexed queries, light aggregation, lazy-loading | Quantifiable | MVP |
| Roadmap | P2: Real backlog integration, telemetry uptime, AI summary | ETL hooks, caching, graceful degradation | Incremental | P2 |
| Third-Party | Optional AI summary with fallback | `/api/ai-summary` (future), error fallback | Stability | P2 |
| Analytics & Tracking | Events: drilldown, switch, alert click, export CSV | `user_events` table; FE tracking | Data-driven iteration | MVP |

---

## 5. KPI Definitions (Unified)

> **Rates are unitless ratios (prefer 0–1; NRR may be >1).** Frontend renders as percentages.  
> **Delta** is fractional change vs previous equal-length window.

- **Recognized Revenue (`revenue`)** – Sum recognized in window.
- **Backlog (`backlog`)** – Period-end undelivered orders; **quarter shows quarter-end**.
- **Uptime (`uptime`)** – Weighted availability over window.
- **NRR (`nrr`)** – (Opening MRR - churn + expansion) / Opening MRR (can be >1).
- **GM% (`gm`)** – Σprofit / Σamount (prefer 0–1).
- **Payback (`payback`)** – CAC payback in months (MVP static if needed).
- **Book-to-Bill (`book_to_bill`)** – Σbooked / Σrecognized.
- **Coverage Months (`coverage_months`)** – Ending backlog / **avg recognized of last 6 months**.
- **ARR (`arr`)** – `12 × MRR`, MRR from end-month subscription/recurring.
- **Forecast (`forecast`)** – **Pipeline × win rate**; fallback to trailing 3-month average × 1.02.

---

## 6. Interaction & Navigation
- Time range: `6m` / `12m`; granularity: `month` / `quarter`.
- Drill-down:
  - `/operations/uptime` (Uptime)
  - `/sales/kpis/pipeline` (Book-to-Bill)
  - `/sales/kpis/revenue` (Forecast)
  - `/supply/kpis/inventory_turns` (Coverage Months)
  - `/supply` (Backlog)
  - `/finance/kpis/{revenue|nrr|gm|payback|arr}`

---

## 7. Performance & Stability
- **Performance:** Indexed time-series queries; lightweight aggregation; lazy load for drill-down.
- **Stability:** API fallbacks return cached/hidden defaults; third-party failures must not block the main flow.

---

## 8. Observability & Analytics
- Event logging to `user_events`: `switch_range_or_granularity`, `drilldown`, `alert_click`, `export_csv`.
- Metrics via API gateway and application logs.

---

## 9. Roadmap
- **MVP (Delivered):** Static-rule alerts, manual metric definitions, first-screen interactions & drill-down framework.
- **P2 (Planned):** Real backlog data, telemetry uptime integration, `/api/ai-summary` with graceful degradation.
- **P3 (Optional):** Analytics dashboard; anomaly detection & forecasting.

---

## 10. Acceptance Criteria (Detailed)
- Functional: First-screen KPIs & highlights reflect backend; drill-down consistency; granularity switch triggers recalculation.
- Performance: TTFB < 300ms; render < 1s; switch < 200ms.
- Stability: Fallbacks/caching active; third-party failures do not block.
- Observability: Event logs queryable; drill-down and time-switch tracked.
