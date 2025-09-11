
# Executive Dashboard – Database Schema (SQLite)

## Overview
- File-based SQLite optimized with indexes for fast aggregation.
- **Rates are stored as unitless ratios.** Prefer **0–1** for percentages; **NRR may be >1**. If any source stores 0–100, the backend normalizes.
- Naming consistency:
  - Orders date column: `order_date`
  - Feedback timestamp: `created_at`
- **RUM metrics** (Real User Monitoring) are kept in a **side table**; units are **milliseconds** unless noted.

---

## Executive Tables
### `timeframe_window`
- `id` INTEGER PK
- `range` TEXT (unique) – e.g., `6m`, `12m`
- `start_date` DATE
- `end_date` DATE
- `granularity` TEXT – `month | quarter`

### `executive_kpis`
- `key` TEXT PK – `revenue | backlog | uptime | nrr | gm | payback | book_to_bill | coverage_months | arr | forecast`
- `label` TEXT
- `value` REAL
- `unit` TEXT
- `delta` REAL  *(fraction vs previous window)*
- `direction` TEXT CHECK `('up','down','flat')`

### `revenue_trend`
- `period` TEXT PK – `YYYY-MM` (monthly rows)
- `recognized` REAL NOT NULL DEFAULT 0
- `booked` REAL NOT NULL DEFAULT 0
- `backlog` REAL NOT NULL DEFAULT 0  *(period-end stock)*

### `pipeline_stages`
- `stage_name` TEXT PK – `Leads | MQL | SQL | Won`
- `value` INTEGER NOT NULL DEFAULT 0

### `pipeline_stages_daily`
- `period` DATE
- `stage_name` TEXT CHECK (`'Leads','MQL','SQL','Won'`)
- `value` INTEGER NOT NULL DEFAULT 0
- **PK** `(period, stage_name)`

### `pipeline_winrate`
- `period` TEXT PK – e.g., `2025-08`
- `win_rate_pct` REAL NOT NULL  *(store 0–1; backend tolerates 0–100)*
- `sales_cycle_days` INTEGER NOT NULL

### `retention_nrr`
- `period` TEXT PK
- `nrr` REAL NOT NULL          *(ratio; may be >1)*
- `gross_churn` REAL NOT NULL  *(0–1)*
- `expansion` REAL NOT NULL    *(0–1)*

### `retention_at_risk`
- `id` INTEGER PK AUTOINCREMENT
- `customer` TEXT NOT NULL
- `mrr` REAL NOT NULL
- `risk` REAL NOT NULL         *(0–1 probability)*
- `reason` TEXT

### `alerts`
- `id` INTEGER PK AUTOINCREMENT
- `type` TEXT NOT NULL       *(e.g., `ops`, `supply`, `marketing`)*
- `title` TEXT NOT NULL
- `description` TEXT
- `severity` TEXT CHECK `('low','medium','high')`
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### `risks`
- `id` INTEGER PK AUTOINCREMENT
- `title` TEXT NOT NULL
- `owner` TEXT
- `due` DATE
- `mitigation` TEXT
- `status` TEXT DEFAULT `open`

---

## Operations Tables
### `ops_uptime`
- `period` TEXT PK – `YYYY-MM`
- `uptime` REAL NOT NULL *(0–1)*

### `ops_reliability`
- `period` TEXT PK
- `mtbf_hours` REAL NOT NULL
- `mttr_hours` REAL NOT NULL

### `ops_quality`
- `period` TEXT PK
- `doa_pct` REAL NOT NULL      *(0–1)*
- `defect_pct` REAL NOT NULL   *(0–1)*
- `warranty_pct` REAL NOT NULL *(0–1)*

### `ops_service_cost`
- `period` TEXT PK
- `cost_per_device` REAL NOT NULL

---

## Supply Chain Tables
### `supply_cogs_breakdown`
- `id` INTEGER PK
- `component` TEXT NOT NULL
- `cost` REAL NOT NULL

### `supply_cogs_variance`
- `period` TEXT PK
- `variance_pct` REAL NOT NULL *(0–1)*

### `supply_lead_time`
- `period` TEXT PK
- `lead_time_days` REAL NOT NULL

### `supply_inventory_turns`
- `period` TEXT PK
- `turns_per_year` REAL NOT NULL

---

## Telemetry Tables
### `telemetry_utilization`
- `period` TEXT PK
- `avg_hours_per_device` REAL NOT NULL

### `telemetry_consumption`
- `period` TEXT PK
- `grams_per_cycle` REAL NOT NULL

### `telemetry_active_devices`
- `period` TEXT PK
- `active_devices` INTEGER NOT NULL

---

## Products (Top Products)
### `top_products_daily`
- `period` DATE PK with `name` – `YYYY-MM-DD`
- `name` TEXT NOT NULL
- `revenue` REAL NOT NULL  
**Composite PK:** `(period, name)`

### `top_products`
- `name` TEXT PK
- `revenue` REAL NOT NULL

---

## Customer & Feedback Tables
### `customers`
- `id` INTEGER PK
- `name` TEXT NOT NULL
- `industry` TEXT
- `source` TEXT
- `created_at` DATE DEFAULT `DATE('now')`

### `deals`
- `id` INTEGER PK
- `type` TEXT NOT NULL

### `orders`
- `id` INTEGER PK
- `customer_id` INTEGER REFERENCES `customers(id)` ON DELETE SET NULL
- `amount` REAL NOT NULL
- `profit` REAL NOT NULL
- `order_date` DATE NOT NULL
- `type` TEXT  *(e.g., `recognized`, `booked`, `subscription`, `recurring`)*

### `expenses`
- `id` INTEGER PK
- `cost` REAL NOT NULL
- `date` DATE NOT NULL

### `devices`
- `id` INTEGER PK
- `type` TEXT NOT NULL
- `fault_type` TEXT

### `repurchases`
- `id` INTEGER PK
- `device_type` TEXT NOT NULL
- `repurchase_rate` REAL NOT NULL

### `user_events`
- `id` INTEGER PK
- `event_type` TEXT NOT NULL
- `event_time` DATETIME NOT NULL

### `page_visits`
- `id` INTEGER PK
- `visit_date` DATE NOT NULL
- `page_name` TEXT NOT NULL

### `product_feedback`
- `id` INTEGER PK
- `category` TEXT NOT NULL
- `type` TEXT NOT NULL
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### `feedback_scores`
- `id` INTEGER PK
- `aspect` TEXT NOT NULL
- `score` REAL NOT NULL
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### `feedback`
- `id` INTEGER PK
- `customer_id` INTEGER REFERENCES `customers(id)` ON DELETE SET NULL
- `type` TEXT NOT NULL
- `message` TEXT
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

---

## RUM Side Table
### `user_event_meta`
- `event_id` INTEGER NOT NULL REFERENCES `user_events(id)` ON DELETE CASCADE
- `metric`   TEXT NOT NULL
- `v`        REAL
- `raw`      TEXT  -- optional JSON blob
**Primary Key:** `(event_id, metric)`

**Notes**
- Timing metrics use **milliseconds**; `drilldown_clicks` is a count.

---

## Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_orders_order_date            ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id           ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date                ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_user_events_time             ON user_events(event_time);
CREATE INDEX IF NOT EXISTS idx_page_visits_date             ON page_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_product_feedback_created     ON product_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_top_products_daily_period    ON top_products_daily(period);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_daily_period ON pipeline_stages_daily(period);
CREATE INDEX IF NOT EXISTS idx_eventmeta_metric             ON user_event_meta(metric);
```

---

## Data Conventions & Notes
- **Backlog** in `revenue_trend` is **period-end**; for quarter aggregation take **quarter-end**.
- **ARR** = `12 × MRR`, MRR from end-month `orders` with `type IN ('subscription','recurring')`.
- **Coverage Months** denominator is a **fixed 6-month** average recognized revenue.
- P95 for timing metrics can be computed using SQLite window functions over recent (e.g., 7–30 days) `user_events` + `user_event_meta` joins.
