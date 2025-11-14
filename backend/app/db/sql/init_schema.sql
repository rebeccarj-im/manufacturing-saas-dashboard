PRAGMA foreign_keys = ON;

-- ===================== DROP (idempotent) =====================
DROP TABLE IF EXISTS timeframe_window;
DROP TABLE IF EXISTS executive_kpis;
DROP TABLE IF EXISTS revenue_trend;
DROP TABLE IF EXISTS pipeline_stages;
DROP TABLE IF EXISTS pipeline_stages_daily;
DROP TABLE IF EXISTS pipeline_winrate;
DROP TABLE IF EXISTS retention_nrr;
DROP TABLE IF EXISTS retention_at_risk;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS risks;

DROP TABLE IF EXISTS ops_uptime;
DROP TABLE IF EXISTS ops_reliability;
DROP TABLE IF EXISTS ops_quality;
DROP TABLE IF EXISTS ops_service_cost;

DROP TABLE IF EXISTS supply_cogs_breakdown;
DROP TABLE IF EXISTS supply_cogs_variance;
DROP TABLE IF EXISTS supply_lead_time;
DROP TABLE IF EXISTS supply_inventory_turns;

DROP TABLE IF EXISTS telemetry_utilization;
DROP TABLE IF EXISTS telemetry_consumption;
DROP TABLE IF EXISTS telemetry_active_devices;

DROP TABLE IF EXISTS top_products_daily;
DROP TABLE IF EXISTS top_products;

DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS feedback_scores;
DROP TABLE IF EXISTS product_feedback;
DROP TABLE IF EXISTS page_visits;
DROP TABLE IF EXISTS user_events;
DROP TABLE IF EXISTS repurchases;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS deals;
DROP TABLE IF EXISTS customers;

-- ===================== Executive =====================
CREATE TABLE timeframe_window (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  range         TEXT NOT NULL UNIQUE,          -- e.g., 6m / 12m
  start_date    DATE NOT NULL,                 -- Aligned to month boundaries; inclusive of first and last day
  end_date      DATE NOT NULL,
  granularity   TEXT NOT NULL DEFAULT 'month'  -- month | quarter
);

CREATE TABLE executive_kpis (
  key           TEXT PRIMARY KEY,              -- revenue / backlog / uptime / nrr / gm / payback / book_to_bill / coverage_months / arr / forecast
  label         TEXT NOT NULL,
  value         REAL,                          -- Currency as numeric; rates as 0–1 (NRR may be > 1)
  unit          TEXT,                          -- Currency defaults to £; rates usually have no unit
  delta         REAL,                          -- Fractional change vs. prior equal-length window (e.g., +8.2% stored as 0.082)
  direction     TEXT CHECK (direction IN ('up','down','flat')) DEFAULT 'flat'
);

CREATE TABLE revenue_trend (
  period        TEXT PRIMARY KEY,              -- YYYY-MM (monthly storage)
  recognized    REAL NOT NULL DEFAULT 0,
  booked        REAL NOT NULL DEFAULT 0,
  backlog       REAL NOT NULL DEFAULT 0        -- Period-end value; for quarterly views use the quarter-end
);

CREATE TABLE pipeline_stages (
  stage_name    TEXT PRIMARY KEY,              -- Leads / MQL / SQL / Won
  value         INTEGER NOT NULL DEFAULT 0
);

-- Daily funnel (can be aggregated over a window)
CREATE TABLE pipeline_stages_daily (
  period        DATE NOT NULL,
  stage_name    TEXT NOT NULL CHECK(stage_name IN ('Leads','MQL','SQL','Won')),
  value         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (period, stage_name)
);

CREATE TABLE pipeline_winrate (
  period            TEXT PRIMARY KEY,          -- e.g., 2025-08
  win_rate_pct      REAL NOT NULL,             -- Store 0–1 (backend may accept 0–100 input)
  sales_cycle_days  INTEGER NOT NULL
);

CREATE TABLE retention_nrr (
  period        TEXT PRIMARY KEY,              -- e.g., 2025-08
  nrr           REAL NOT NULL,                 -- Ratio, may be > 1
  gross_churn   REAL NOT NULL,                 -- 0–1
  expansion     REAL NOT NULL                  -- 0–1
);

CREATE TABLE retention_at_risk (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer      TEXT NOT NULL,
  mrr           REAL NOT NULL,
  risk          REAL NOT NULL,                 -- Probability 0–1
  reason        TEXT
);

CREATE TABLE alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,                 -- e.g., 'ops' | 'supply' | 'marketing'
  title         TEXT NOT NULL,
  description   TEXT,
  severity      TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE risks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  owner         TEXT,
  due           DATE,
  mitigation    TEXT,
  status        TEXT DEFAULT 'open'
);

-- ===================== Operations =====================
CREATE TABLE ops_uptime (
  period        TEXT PRIMARY KEY,              -- YYYY-MM
  uptime        REAL NOT NULL                  -- 0–1
);

CREATE TABLE ops_reliability (
  period        TEXT PRIMARY KEY,
  mtbf_hours    REAL NOT NULL,
  mttr_hours    REAL NOT NULL
);

CREATE TABLE ops_quality (
  period        TEXT PRIMARY KEY,
  doa_pct       REAL NOT NULL,                 -- 0–1
  defect_pct    REAL NOT NULL,                 -- 0–1
  warranty_pct  REAL NOT NULL                  -- 0–1
);

CREATE TABLE ops_service_cost (
  period        TEXT PRIMARY KEY,
  cost_per_device REAL NOT NULL
);

-- ===================== Supply =====================
CREATE TABLE supply_cogs_breakdown (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  component     TEXT NOT NULL,
  cost          REAL NOT NULL
);

CREATE TABLE supply_cogs_variance (
  period        TEXT PRIMARY KEY,
  variance_pct  REAL NOT NULL                  -- 0–1; may be negative (positive/negative cost variance)
);

CREATE TABLE supply_lead_time (
  period        TEXT PRIMARY KEY,
  lead_time_days REAL NOT NULL
);

CREATE TABLE supply_inventory_turns (
  period        TEXT PRIMARY KEY,
  turns_per_year REAL NOT NULL
);

-- ===================== Telemetry =====================
CREATE TABLE telemetry_utilization (
  period        TEXT PRIMARY KEY,
  avg_hours_per_device REAL NOT NULL
);

CREATE TABLE telemetry_consumption (
  period        TEXT PRIMARY KEY,
  grams_per_cycle REAL NOT NULL
);

CREATE TABLE telemetry_active_devices (
  period        TEXT PRIMARY KEY,
  active_devices INTEGER NOT NULL
);

-- ===================== Products (for Top Products chart) =====================
CREATE TABLE top_products_daily (
  period        DATE NOT NULL,                 -- YYYY-MM-DD
  name          TEXT NOT NULL,
  revenue       REAL NOT NULL,
  PRIMARY KEY (period, name)
);

CREATE TABLE top_products (
  name          TEXT PRIMARY KEY,
  revenue       REAL NOT NULL
);

-- ===================== Customers & Feedback =====================
CREATE TABLE customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  industry      TEXT,
  source        TEXT,
  created_at    DATE NOT NULL DEFAULT (DATE('now'))
);

CREATE TABLE deals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL
);

CREATE TABLE orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount        REAL NOT NULL,
  profit        REAL NOT NULL,
  order_date    DATE NOT NULL,
  type          TEXT,                           -- e.g., recognized | subscription | recurring
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE expenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cost          REAL NOT NULL,
  date          DATE NOT NULL
);

CREATE TABLE devices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,
  fault_type    TEXT
);

CREATE TABLE repurchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_type   TEXT NOT NULL,
  repurchase_rate REAL NOT NULL               -- 0–1
);

CREATE TABLE user_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL,
  event_time    DATETIME NOT NULL
);

CREATE TABLE page_visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_date    DATE NOT NULL,
  page_name     TEXT NOT NULL
);

CREATE TABLE product_feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,
  type          TEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback_scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  aspect        TEXT NOT NULL,
  score         REAL NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  message       TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ===================== Calendar & Meetings =====================
CREATE TABLE IF NOT EXISTS meetings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  start_time  DATETIME NOT NULL,
  end_time    DATETIME NOT NULL,
  location    TEXT,
  attendees   TEXT,
  category    TEXT DEFAULT 'meeting',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_time > start_time)
);

-- ===================== Indexes =====================
CREATE INDEX IF NOT EXISTS idx_orders_order_date            ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id           ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date                ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_user_events_time             ON user_events(event_time);
CREATE INDEX IF NOT EXISTS idx_page_visits_date             ON page_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_product_feedback_created     ON product_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_top_products_daily_period    ON top_products_daily(period);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_daily_period ON pipeline_stages_daily(period);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time          ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_end_time            ON meetings(end_time);
