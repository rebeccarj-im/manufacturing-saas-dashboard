
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
- **Prod:** Browser → API Gateway @ Edge (auth, rate-limit, retries, small TTL cache) → FastAPI

---

## 2. Frontend
- **Stack:** React + TypeScript + Vite
- **UI:** shadcn/ui (cards/layout), ECharts (charts)
- **Routing:** React Router (`/dashboard` and drill-down routes)
- **State:** Zustand / Context
- **Auto-Refresh:** Alerts every **30s**; optional full refresh every **60s**
- **Analytics events:** `switch_range_or_granularity`, `drilldown`, `alert_click`, `export_csv`

### KPI Cards
- Display currency with `unit` (default `£`).
- Render rate KPIs (`uptime/nrr/gm`) as percentages; **NRR may be >100%**.
- `delta` shows vs previous window; FE formats as `%`.

### Revenue Trend
- X-axis: `YYYY-MM` for months, `YYYY-Qn` for quarters.
- Series: `Recognized`, `Booked`, `Backlog` (backlog is period-end; for quarter, quarter-end).

### RUM Collection
- Use the **Performance API** and app hooks to send timing metrics to `/api/events` with defined `meta` keys.

---

## 3. Backend
- **Framework:** FastAPI
- **Routers:**
  - `executive_dashboard.py` – `/api/executive-dashboard`
  - `kpis.py` – `/api/kpis/{key}`
  - `operations.py` – `/api/operations/...` (e.g., `/api/operations/uptime`)
  - `customers.py` – `/api/customers/...`
  - `events.py` – `/api/events` (persists `user_events` + `user_event_meta`)
  - `health.py` – `/api/health`
  - *(optional)* `quality_gates.py` – `/api/quality-gates` (P95 summary & pass/fail)
- **Schemas:** Pydantic models under `/schemas`
- **DB:** SQLite initialized by `init_schema.sql` + `init_data.sql`

### Aggregation Logic (Key Points)
- `revenue` = Σ `revenue_trend.recognized` within window.
- `backlog` = **period-end** (`revenue_trend.backlog` of end month). Quarter uses **quarter-end** (last month wins).
- `uptime` = AVG(`ops_uptime.uptime`) → ratio.
- `nrr` = latest `retention_nrr.nrr` ≤ end-month → ratio (can be >1).
- `gm` = Σprofit / Σamount from `orders` within window → ratio.
- `book_to_bill` = Σbooked / Σrecognized over window.
- `coverage_months` = (ending backlog) / (avg recognized of **last 6 months**).
- `arr` = `12 × MRR`, MRR from end-month `orders` `type in ('subscription','recurring')`.
- `forecast` = **pipeline × win rate** (win rate ratio), fallback to trailing 3-month avg × 1.02.
- `delta` for `revenue` & `backlog` vs previous equal-length window.
- Quarter aggregation: sum flows; take **quarter-end** backlog.

---

## 4. Concurrency & Caching Guardrails
- **SQLite**:
  - `PRAGMA journal_mode=WAL;`
  - `PRAGMA synchronous=NORMAL;`
  - `PRAGMA busy_timeout=5000;`
  - Prefer dedicated read vs write connections.
- **Hot GET** – `/api/executive-dashboard`:
  - In-process TTL cache (30–60s) by `range|granularity`.
  - **Single-flight** so identical keys compute once.
  - Gateway ETag / short TTL cache in production.
- **Events** – `/api/events`:
  - Single transaction per request: insert `user_events` then `user_event_meta`.
  - *(P2)* optional async/batched writer; request contract unchanged.
- **Frontend polling**:
  - ±5s jitter for 30s polling and cancel duplicate in-flight requests.

---

## 5. API Gateway (Production)
- JWT/OAuth verification (issuer/audience/scope).
- Rate limiting per user/IP/route.
- Retries & circuit breaker.
- Small TTL cache for read-mostly endpoints.

---

## 6. Observability
- Structured logging via Uvicorn/FastAPI middleware.
- **Server-Timing** header (optional) for backend duration attribution.
- RUM events persisted via `/api/events` and aggregated from `user_event_meta`.
- Gateway metrics for latency/error rates.
- *(Optional)* Prometheus/OpenTelemetry histograms + Grafana dashboards & alerts.

---

## 7. Performance
- Indexes on time keys (`orders.order_date`, `user_events.event_time`, …).
- Lean SQL; avoid N+1 queries.
- Lazy-load drill-downs; memoize chart options in FE.
- Optional cache as above.

---

## 8. Security
- Validate `range` and `granularity`.
- Use bound SQL parameters.
- CORS restricted in production origins.
- Gateway does JWT check; backend enforces minimal authorization (RBAC/tenant).

---

## 9. Testing & Acceptance
- Unit tests: aggregation (windowing, quarter-end backlog).
- Contract tests: `/api/executive-dashboard` matches OpenAPI schema.
- E2E: ≤2 clicks to drill-down; granularity switch P95 < 200ms; alerts polling ~30s.
- *(Optional)* `/api/quality-gates` exposes recent P95 and pass/fail booleans.

---

## 10. Rollout & Config Flags
- Suggested env flags (all optional):
  - `EDB_SQLITE_WAL=1`
  - `EDB_CACHE_TTL_SECONDS=45`
  - `EDB_SINGLEFLIGHT=1`
  - `EDB_MAX_CONCURRENCY=12`
  - `EDB_EVENTS_ASYNC=0`
- All are backwards-compatible; no API contract change.
