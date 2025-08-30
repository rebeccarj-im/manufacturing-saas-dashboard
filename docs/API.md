# Executive Dashboard – API Documentation

## Overview
- Base Path: `/api`
- Content-Type: `application/json`
- Auth: Handled by API Gateway in production (see Technical Design). Dev uses Vite proxy.

> **Notation & Conventions**
> - Monetary values are returned as numbers with an optional `unit` (default: `¥`).
> - **Rates are unitless ratios.** Prefer **0–1** for percentages; **NRR may be >1** (e.g., 1.08 = 108%). If any source stores 0–100, the backend/FE normalize for display.
> - `delta` values are **fractional change vs the previous equal-length window** (e.g., +8.2% → `0.082`).

---

## 1. Health Check
**Endpoint:** `GET /api/health`  
**Response:**
```json
{ "status": "ok" }
```

---

## 2. Executive Dashboard (MVP)

**Endpoint:** `GET /api/executive-dashboard`  
**Query Params:**
- `range` (string, optional): `6m | 12m` (default `12m`)
- `granularity` (string, optional): `month | quarter` (default `month`)

**Response:**
```json
{
  "timeframe": {
    "range": "12m",
    "start_date": "2024-09-01",
    "end_date": "2025-08-31",
    "granularity": "month"
  },
  "executiveKpis": [
    { "key": "revenue",          "label": "Recognized Revenue", "value": 12450000, "unit": "¥", "delta": 0.082, "direction": "up" },
    { "key": "backlog",          "label": "Backlog",            "value": 8350000,  "unit": "¥", "delta": -0.031, "direction": "down" },
    { "key": "uptime",           "label": "Uptime",             "value": 0.992,                "delta": null,  "direction": "flat" },
    { "key": "nrr",              "label": "NRR",                "value": 1.08,                 "delta": null,  "direction": "flat" },
    { "key": "gm",               "label": "Gross Margin",       "value": 0.37,                 "delta": null,  "direction": "flat" },
    { "key": "payback",          "label": "Payback (mo)",       "value": 13.2,     "unit": "mo","delta": null,  "direction": "down" },

    { "key": "book_to_bill",     "label": "Book-to-Bill",       "value": 1.12 },
    { "key": "coverage_months",  "label": "Coverage Months",    "value": 6.4 },
    { "key": "arr",              "label": "ARR",                "value": 24300000, "unit": "¥" },
    { "key": "forecast",         "label": "Forecast",           "value": 940000,   "unit": "¥" }
  ],
  "revenueTrend": [
    { "period": "2025-06", "recognized": 880000, "booked": 950000, "backlog": 6500000 },
    { "period": "2025-07", "recognized": 910000, "booked": 990000, "backlog": 6600000 },
    { "period": "2025-08", "recognized": 950000, "booked": 980000, "backlog": 6700000 }
  ],
  "alerts": [
    { "id": 1, "type": "ops", "title": "DOA above threshold", "description": "1.2% > target 0.8%", "severity": "high", "created_at": "2025-08-21T12:00:00Z" }
  ],
  "risks": [
    { "id": 1, "title": "Key material A supply instability", "owner": "COO", "due": "2025-09-10", "mitigation": "Dual source", "status": "mitigating" }
  ]
}
```

**Field Semantics**
- `timeframe.start_date` / `end_date`: inclusive date window, aligned to full months.
- `revenueTrend.period`:
  - `granularity=month` → `"YYYY-MM"` (e.g., `2025-08`)
  - `granularity=quarter` → `"YYYY-Qn"` (e.g., `2025-Q3`)
- **Backlog semantics**:
  - `revenueTrend.backlog`: **period-end value**.
  - Quarterly view uses the **quarter-end value** (last month of quarter).
- **KPI semantics**:
  - `revenue` (currency): Sum of recognized revenue in window.
  - `backlog` (currency): Ending undelivered orders amount (period-end).
  - `uptime` (ratio): Weighted availability in window.
  - `nrr` (ratio): Net Revenue Retention (can be >1).
  - `gm` (ratio): Gross margin.
  - `payback` (months): CAC payback period (MVP can be static).
  - `book_to_bill` (ratio): Σ(booked) / Σ(recognized) over window.
  - `coverage_months` (months): **Fixed 6-month** average recognized denominator.
  - `arr` (currency): **12 × MRR**, where MRR is end-month subscription/recurring sum.
  - `forecast` (currency): **Pipeline × win rate** (preferred); fallback to trailing 3-month average × **1.02**.

---

## 3. Drill-Down APIs

### (a) KPI Drilldown
**Endpoint:** `GET /api/kpis/{key}`  
**Path Param:** `key` ∈ `revenue | backlog | uptime | nrr | gm | payback | book_to_bill | coverage_months | arr | forecast`  
**Query Params:** `range`, `granularity` (same as above)  
**Response:** Trend, breakdown by dimension (e.g., customer, product), depending on the KPI.

### (b) Operations – Uptime
**Endpoint:** `GET /api/operations/uptime`  
Returns uptime metrics over time (ratio). Supports `range`/`granularity`.

### (c) Customers – At Risk
**Endpoint:** `GET /api/customers/at-risk`  
Returns customers at churn risk with MRR, risk (0–1), and reasons.

---

## 4. Analytics & Tracking
**Endpoint:** `POST /api/events`  
**Payload:**
```json
{ "event_type": "drilldown", "event_time": "2025-08-21T12:00:00Z", "meta": { "key": "revenue" } }
```
**Response:**
```json
{ "status": "logged" }
```

**Event Types (MVP)**
- `switch_range_or_granularity`
- `drilldown`
- `alert_click`
- `export_csv`

---

## 5. Errors
- 400 – Invalid parameter (range/granularity).
- 500 – Internal error (DB unavailable, etc.).
