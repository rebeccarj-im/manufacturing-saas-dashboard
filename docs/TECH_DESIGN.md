# Executive Dashboard – Technical Design

## 1. Architecture
```
Browser (React + Vite + ECharts)
   ↓  (proxy in dev, API Gateway in prod)
Backend (FastAPI, SQLite)
   ↓
Database (SQLite, file-based)
```

- **Dev:** Vite proxy `/api → localhost:8000`
- **Prod:** Browser → API Gateway @ Edge (auth, rate-limit, retries) → FastAPI

---

## 2. Frontend
- **Stack:** React + TypeScript + Vite
- **UI:** shadcn/ui (cards/layout), ECharts (charts)
- **Routing:** React Router (`/dashboard` and drill-down routes)
- **State:** Zustand / Context
- **Auto-Refresh:** Alerts every **30s**; optional full refresh every **60s**
- **Analytics events:** `switch_range_or_granularity`, `drilldown`, `alert_click`, `export_csv`

**KPI Cards**
- Display currency with `unit` (default `¥`).
- Render rate KPIs (`uptime/nrr/gm`) as percentages; **NRR may be >1** (shows >100%).
- `delta` shows vs previous window; FE formats as `%`.

**Revenue Trend**
- X-axis: `YYYY-MM` for months, `YYYY-Qn` for quarters.
- Series: `Recognized`, `Booked`, `Backlog` (backlog is period-end; for quarter, quarter-end).

---

## 3. Backend
- **Framework:** FastAPI
- **Routers:**
  - `executive_dashboard.py` – `/api/executive-dashboard`
  - `kpis.py` – `/api/kpis/{key}`
  - `operations.py` – `/api/operations/...` (e.g., `/api/operations/uptime`)
  - `customers.py` – `/api/customers/...`
- **Schemas:** Pydantic models under `/schemas`
- **DB:** SQLite initialized by `init_schema.sql` + `init_data.sql`

**Aggregation Logic (Key Points)**
- `revenue` = Σ `revenue_trend.recognized` within window.
- `backlog` = **period-end** (`revenue_trend.backlog` of end month). Quarter uses **quarter-end** (last month wins).
- `uptime` = AVG(`ops_uptime.uptime`) → ratio.
- `nrr` = latest `retention_nrr.nrr` ≤ end-month → ratio (can be >1).
- `gm` = Σprofit / Σamount from `orders` within window → ratio.
- `book_to_bill` = Σbooked / Σrecognized over window.
- `coverage_months` = (ending backlog) / (avg recognized of **last 6 months**).
- `arr` = `12 × MRR`, MRR from end-month `orders` `type in ('subscription','recurring')`.
- `forecast` = **pipeline × win rate** (win rate ratio), fallback to trailing-3-month avg × 1.02.
- `delta` for `revenue` & `backlog` vs previous equal-length window.

**Quarter Aggregation Rules**
- Sum `recognized` and `booked`.
- Take **quarter-end** value for `backlog`.

---

## 4. API Gateway (Production)
- Concerns: Auth (JWT/OAuth), rate limiting, retries, circuit breaker, request/response logging, CORS.
- Static response caching for read-mostly endpoints (short TTL).

---

## 5. Observability
- Structured logging via Uvicorn/FastAPI middleware.
- `user_events` writes for analytics.
- Gateway metrics for latency/error rates.

---

## 6. Performance
- Indexes on time keys: `orders(order_date)`, `user_events(event_time)`, etc.
- Lean aggregation SQL; avoid N+1 queries.
- Lazy-load heavy drill-downs; memoize chart options on FE.
- Optional caching layer (P2).

---

## 7. Security
- Input validation on `range` and `granularity`.
- Sanitize SQL params (use bound params).
- CORS restricted in production to trusted origins.

---

## 8. Testing
- Unit tests for aggregation (windowing, quarter-end backlog).
- Contract tests for `/api/executive-dashboard`.
- FE e2e for granularity switch, drill-down, alert clicks, CSV export.

---

## 9. Roadmap
- **MVP:** Core KPIs, drill-down skeleton, static alerts & risks.
- **P2:** Real backlog integration, telemetry uptime, AI summary endpoint with fallback.
- **P3:** Analytics dashboard; anomaly detection & forecasting.
