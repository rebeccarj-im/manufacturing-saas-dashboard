PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- ========= timeframe windows (aligned: 6m / 12m, month boundaries) =========
DELETE FROM timeframe_window;
INSERT OR REPLACE INTO timeframe_window(range, start_date, end_date, granularity)
VALUES
  -- 6 months: from the first day of this month minus 5 months, to the end of this month
  ('6m',
   DATE(STRFTIME('%Y-%m-01','now','start of month','-5 months')),
   DATE(STRFTIME('%Y-%m-01','now','start of month','+1 month','-1 day')),
   'month'),
  -- 12 months: from the first day of this month minus 11 months, to the end of this month
  ('12m',
   DATE(STRFTIME('%Y-%m-01','now','start of month','-11 months')),
   DATE(STRFTIME('%Y-%m-01','now','start of month','+1 month','-1 day')),
   'month');

-- ========= customers (500 rows, spread across the past year) =========
DELETE FROM customers;
WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n+1 FROM seq WHERE n < 500
)
INSERT INTO customers(name, industry, source, created_at)
SELECT
  printf('CUST-%04d', n),
  CASE n%6 WHEN 0 THEN 'Manufacturing' WHEN 1 THEN 'Healthcare' WHEN 2 THEN 'Energy'
           WHEN 3 THEN 'Retail' WHEN 4 THEN 'Tech' ELSE 'Finance' END,
  CASE n%4 WHEN 0 THEN 'inbound' WHEN 1 THEN 'partner' WHEN 2 THEN 'outbound' ELSE 'event' END,
  DATE('now', printf('-%d day', ABS(RANDOM())%365))
FROM seq;

-- ========= orders (cover last 400 days, 2–8 per day; type = recognized) =========
DELETE FROM orders;
WITH RECURSIVE days(n, day) AS (
  SELECT 0, DATE('now','-399 day')
  UNION ALL
  SELECT n+1, DATE(day,'+1 day') FROM days WHERE n < 399
),
daily_cnt AS (
  SELECT day AS order_date, 2 + ABS(RANDOM()) % 7 AS cnt FROM days
),
seq2(order_date, k) AS (
  SELECT order_date, 1 FROM daily_cnt
  UNION ALL
  SELECT daily_cnt.order_date, k+1
  FROM seq2
  JOIN daily_cnt ON daily_cnt.order_date = seq2.order_date
  WHERE k < daily_cnt.cnt
),
cc AS (SELECT COUNT(*) AS c FROM customers),
rows AS (
  SELECT
    s.order_date,
    1 + (ABS(RANDOM()) % cc.c) AS cust_slot,
    ROUND(400 + (ABS(RANDOM()) % 16000), 2) AS amount
  FROM seq2 s
  CROSS JOIN cc
)
INSERT INTO orders(customer_id, amount, profit, order_date, type)
SELECT
  ((cust_slot - 1) % (SELECT COUNT(*) FROM customers)) + 1,
  amount,
  ROUND(amount * (0.33 + (ABS(RANDOM()) % 25)/100.0), 2) AS profit, -- 33%–58% gross margin
  order_date,
  'recognized'
FROM rows;

-- ========= Subscriptions/recurring revenue: add MRR at month-end for the last 12 months (type ∈ subscription/recurring) =========
WITH RECURSIVE mo(n, month_end) AS (
  SELECT 0, DATE(STRFTIME('%Y-%m-01','now','start of month','+1 month','-1 day'))
  UNION ALL
  SELECT n+1, DATE(STRFTIME('%Y-%m-01','now','start of month', printf('-%d months', n+1), '+1 month','-1 day'))
  FROM mo WHERE n < 11
),
pick(n) AS (SELECT 1 UNION ALL SELECT 1 FROM pick LIMIT 120) -- ~120 MRR rows per month
INSERT INTO orders(customer_id, amount, profit, order_date, type)
SELECT
  1 + (ABS(RANDOM()) % (SELECT COUNT(*) FROM customers)) AS customer_id,
  ROUND(300 + (ABS(RANDOM()) % 4701), 2) AS mrr,                                  -- ~£300–£5000
  ROUND((300 + (ABS(RANDOM()) % 4701)) * (0.65 + (ABS(RANDOM())%10)/100.0), 2),   -- assume higher margin for subscriptions
  month_end,
  CASE WHEN ABS(RANDOM()) % 10 < 7 THEN 'subscription' ELSE 'recurring' END
FROM mo
CROSS JOIN pick;

-- ========= expenses (cover last 400 days) =========
DELETE FROM expenses;
WITH RECURSIVE d2(n, day) AS (
  SELECT 0, DATE('now','-399 day')
  UNION ALL
  SELECT n+1, DATE(day,'+1 day') FROM d2 WHERE n < 399
)
INSERT INTO expenses(cost, date)
SELECT ROUND(150 + (ABS(RANDOM()) % 900), 2), day FROM d2;

-- ========= revenue_trend (monthly YYYY-MM; includes recognized/booked/backlog; backlog is period-end) =========
DELETE FROM revenue_trend;
WITH
months(n, period) AS (  -- last 24 months
  SELECT 0, STRFTIME('%Y-%m', DATE('now','start of month','-23 months'))
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE('now','start of month','-23 months', printf('+%d months', n+1)))
  FROM months WHERE n < 23
),
m_rec AS (
  SELECT
    m.n,
    m.period,
    IFNULL((
      SELECT SUM(amount)
      FROM orders o
      WHERE STRFTIME('%Y-%m', o.order_date) = m.period
    ), 0.0) AS recognized
  FROM months m
),
m_book AS (  -- booked ≈ 10%–30% of that month’s recognized
  SELECT n, period, recognized,
         ROUND(recognized * (0.10 + (ABS(RANDOM())%21)/100.0), 2) AS booked
  FROM m_rec
),
series AS (  -- recursive backlog: prior period end + current booked – a portion of current recognized
  SELECT
    n, period, recognized, booked,
    ROUND(350000 + (ABS(RANDOM())%200000), 2) AS backlog
  FROM m_book WHERE n = 0
  UNION ALL
  SELECT
    b.n, b.period, b.recognized, b.booked,
    ROUND(MAX(0.0, s.backlog + b.booked - b.recognized * 0.85), 2) AS backlog
  FROM m_book b
  JOIN series s ON b.n = s.n + 1
)
INSERT INTO revenue_trend(period, recognized, booked, backlog)
SELECT period, ROUND(recognized,2), booked, backlog
FROM series;

-- ========= pipeline (static + daily tables) =========
DELETE FROM pipeline_stages;
INSERT OR REPLACE INTO pipeline_stages(stage_name,value) VALUES
('Leads', 950),
('MQL',   520),
('SQL',   310),
('Won',   (SELECT COUNT(*) FROM orders WHERE order_date BETWEEN DATE('now','-29 day') AND DATE('now')));

DELETE FROM pipeline_winrate;
-- store 0–1
INSERT OR REPLACE INTO pipeline_winrate(period, win_rate_pct, sales_cycle_days)
VALUES (STRFTIME('%Y-%m','now'), 0.29, 43);

-- Daily funnel: use daily orders count as Won and back-calculate SQL/MQL/Leads via conversion rates
DELETE FROM pipeline_stages_daily;
WITH RECURSIVE dps(n, period) AS (
  SELECT 0, DATE('now','-399 day')
  UNION ALL
  SELECT n+1, DATE(period,'+1 day') FROM dps WHERE n < 399
),
won AS (
  SELECT
    dps.period,
    IFNULL((SELECT COUNT(*) FROM orders o WHERE o.order_date = dps.period), 0) AS won_count
  FROM dps
)
INSERT OR REPLACE INTO pipeline_stages_daily(period, stage_name, value)
-- Won
SELECT period, 'Won', won_count FROM won
UNION ALL
-- SQL (≈ Won / 0.30)
SELECT period, 'SQL', CAST(ROUND(won_count / 0.30 + (ABS(RANDOM()) % 5)) AS INTEGER) FROM won
UNION ALL
-- MQL (≈ SQL / 0.60)
SELECT period, 'MQL', CAST(ROUND((won_count / 0.30) / 0.60 + (ABS(RANDOM()) % 8)) AS INTEGER) FROM won
UNION ALL
-- Leads (≈ MQL / 0.50)
SELECT period, 'Leads', CAST(ROUND(((won_count / 0.30) / 0.60) / 0.50 + (ABS(RANDOM()) % 15)) AS INTEGER) FROM won;

-- ========= retention (all stored as 0–1 ratios; NRR may be > 1) =========
DELETE FROM retention_nrr;
WITH RECURSIVE m(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m WHERE n < 11
)
INSERT OR REPLACE INTO retention_nrr(period, nrr, gross_churn, expansion)
SELECT period,
       1.02 + (ABS(RANDOM())%11)/100.0  AS nrr,          -- 1.02–1.12
       0.03 + (ABS(RANDOM())%5)/100.0   AS gross_churn,  -- 3%–7%
       0.02 + (ABS(RANDOM())%5)/100.0   AS expansion     -- 2%–6%
FROM m;

DELETE FROM retention_at_risk;
INSERT INTO retention_at_risk(customer, mrr, risk, reason) VALUES
('CUST-0001', 12000, 0.40, 'Usage down 30%'),
('CUST-0010',  7500, 0.55, 'Open sev-2 ticket'),
('CUST-0123',  9800, 0.35, 'Payment delays');

-- ========= alerts & risks =========
DELETE FROM alerts;
INSERT INTO alerts(type, title, description, severity) VALUES
('business','Revenue down vs prev. period','Revenue trend weaker than previous window','medium'),
('ops','Uptime dipped','Uptime below 99.5% in last week','medium'),
('supply','Lead time spike risk','Key component LT > 45 days','high'),
('marketing','Conversion dip','Visit→Lead dropped below target','medium');

DELETE FROM risks;
INSERT INTO risks(title, owner, due, mitigation, status) VALUES
('Single-supplier capacitor','COO', DATE('now','+30 day'), 'Qualify alt. vendor; buffer stock 6 weeks','open'),
('Data pipeline late arrivals','Head of Data', DATE('now','+14 day'), 'Add retry & lag monitors','in-progress');

-- ========= executive KPIs (per spec; ratios stored as 0–1; delta is fractional change) =========
DELETE FROM executive_kpis;

-- revenue (sum last 12 months; delta vs. prior 12 months)
WITH cur AS (
  SELECT IFNULL(SUM(recognized),0.0) AS v
  FROM revenue_trend
  WHERE period >= STRFTIME('%Y-%m', DATE('now','start of month','-11 months'))
),
prev AS (
  SELECT IFNULL(SUM(recognized),0.0) AS v
  FROM revenue_trend
  WHERE period BETWEEN STRFTIME('%Y-%m', DATE('now','start of month','-23 months'))
                  AND     STRFTIME('%Y-%m', DATE('now','start of month','-12 months'))
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'revenue','Recognized Revenue',
       ROUND((SELECT v FROM cur),2), '£',
       CASE WHEN (SELECT v FROM prev) > 0 THEN ((SELECT v FROM cur)-(SELECT v FROM prev))/(SELECT v FROM prev) END,
       CASE
         WHEN (SELECT v FROM prev) = 0 THEN 'flat'
         WHEN ((SELECT v FROM cur)-(SELECT v FROM prev)) > 0 THEN 'up'
         WHEN ((SELECT v FROM cur)-(SELECT v FROM prev)) < 0 THEN 'down'
         ELSE 'flat'
       END;

-- backlog (use period-end value; delta vs. period-end 12 months earlier)
WITH cur AS (
  SELECT backlog AS v FROM revenue_trend ORDER BY period DESC LIMIT 1
),
prev AS (
  SELECT backlog AS v FROM revenue_trend ORDER BY period DESC LIMIT 1 OFFSET 12
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'backlog','Backlog',
       (SELECT v FROM cur), '£',
       CASE WHEN (SELECT v FROM prev) > 0 THEN ((SELECT v FROM cur)-(SELECT v FROM prev))/(SELECT v FROM prev) END,
       CASE
         WHEN (SELECT v FROM prev) IS NULL THEN 'flat'
         WHEN ((SELECT v FROM cur)-(SELECT v FROM prev)) > 0 THEN 'up'
         WHEN ((SELECT v FROM cur)-(SELECT v FROM prev)) < 0 THEN 'down'
         ELSE 'flat'
       END;

-- gm (Σ profit / Σ amount, stored as 0–1)
WITH gm AS (
  SELECT SUM(amount) AS rev_sum, SUM(profit) AS pf
  FROM orders
  WHERE order_date >= DATE('now','start of month','-11 months')
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'gm','Gross Margin', CASE WHEN rev_sum>0 THEN pf/rev_sum ELSE 0 END, NULL, NULL, 'flat' FROM gm;

-- uptime (average over last 12 months, stored as 0–1)
WITH up AS (
  SELECT AVG(uptime) AS u FROM ops_uptime
  WHERE period >= STRFTIME('%Y-%m', DATE('now','start of month','-11 months'))
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'uptime','Uptime', ROUND(u,3), NULL, NULL, 'flat' FROM up;

-- nrr (most recent month-end NRR value; ratio may be > 1)
WITH n AS (
  SELECT nrr FROM retention_nrr
  WHERE period <= STRFTIME('%Y-%m','now')
  ORDER BY period DESC LIMIT 1
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'nrr','NRR', IFNULL((SELECT nrr FROM n), 1.00), NULL, NULL, 'flat';

-- book_to_bill (last 12 months)
WITH bb AS (
  SELECT SUM(booked) AS b, SUM(recognized) AS r
  FROM revenue_trend
  WHERE period >= STRFTIME('%Y-%m', DATE('now','start of month','-11 months'))
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'book_to_bill','Book-to-Bill',
       CASE WHEN r>0 THEN ROUND(b/r, 2) ELSE 1.00 END, NULL, NULL, 'flat'
FROM bb;

-- coverage_months (last month’s backlog / average recognized over the last 6 months)
WITH last_b AS (
  SELECT backlog FROM revenue_trend ORDER BY period DESC LIMIT 1
),
avg6 AS (
  SELECT AVG(recognized) AS avg_r
  FROM (SELECT recognized FROM revenue_trend ORDER BY period DESC LIMIT 6)
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'coverage_months','Coverage Months',
       ROUND(CASE WHEN (SELECT avg_r FROM avg6) > 0
             THEN (SELECT backlog FROM last_b) / (SELECT avg_r FROM avg6)
             ELSE 0 END, 1),
       NULL, NULL, 'flat';

-- payback (fallback constant, unit: months)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
VALUES ('payback','Payback (mo)', 9.0, 'mo', NULL,'flat');

-- ARR (12 × MRR, where MRR = sum of subscription/recurring at the current month-end)
WITH month_end AS (
  SELECT DATE(STRFTIME('%Y-%m-01','now','start of month','+1 month','-1 day')) AS me
),
mrr AS (
  SELECT IFNULL(SUM(amount),0.0) AS v
  FROM orders o
  WHERE o.order_date = (SELECT me FROM month_end)
    AND o.type IN ('subscription','recurring')
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'arr','ARR', ROUND(12.0 * v, 2), '£', NULL, 'flat' FROM mrr;

-- forecast (fallback: average of last 3 months × 1.02)
WITH last3 AS (
  SELECT AVG(recognized) AS avg3
  FROM (SELECT recognized FROM revenue_trend ORDER BY period DESC LIMIT 3)
)
INSERT OR REPLACE INTO executive_kpis(key,label,value,unit,delta,direction)
SELECT 'forecast','Forecast', ROUND(IFNULL(avg3,0) * 1.02, 2), '£', NULL, 'flat' FROM last3;

-- ========= NPS sample data: last 180 days, ~15 rows per day =========
DELETE FROM feedback_scores WHERE aspect='nps';
WITH RECURSIVE d(n, dt) AS (
  SELECT 0, DATE('now','-179 day')
  UNION ALL
  SELECT n+1, DATE(dt,'+1 day') FROM d WHERE n < 179
),
c(n) AS (
  SELECT 1
  UNION ALL
  SELECT n+1 FROM c WHERE n < 15
)
INSERT INTO feedback_scores(aspect, score, created_at)
SELECT
  'nps',
  CASE
    WHEN (ABS(RANDOM()) % 100) < 18 THEN ABS(RANDOM()) % 7           -- 18%: scores 0–6
    WHEN (ABS(RANDOM()) % 100) < 43 THEN 7 + (ABS(RANDOM()) % 2)     -- 25%: scores 7–8
    ELSE 9 + (ABS(RANDOM()) % 2)                                     -- 57%: scores 9–10
  END,
  DATETIME(d.dt, printf('+%d hours', ABS(RANDOM()) % 24))
FROM d
CROSS JOIN c;

-- ========= Top Products (daily decomposition + summary table) =========
DELETE FROM top_products_daily;
WITH prod(name, weight) AS (
  VALUES
    ('Gamma Widget', 1.30),
    ('Quantum XL',   1.20),
    ('Alpha Widget', 1.10),
    ('Beta Widget',  1.00),
    ('Omega Pro',    0.95),
    ('Epsilon Gadget',0.90),
    ('Orion Basic',  0.85),
    ('Zephyr Mini',  0.80),
    ('Nova Plus',    0.75),
    ('Delta Gadget', 0.70)
),
tot_w(sumw) AS ( SELECT SUM(weight) FROM prod ),
days_tp(n, period) AS (
  SELECT 0, DATE('now','-399 day')
  UNION ALL
  SELECT n+1, DATE(period,'+1 day') FROM days_tp WHERE n < 399
),
day_rev AS (
  SELECT d.period,
         IFNULL((SELECT SUM(amount) FROM orders o WHERE o.order_date = d.period), 0) AS recognized
  FROM days_tp d
)
INSERT OR REPLACE INTO top_products_daily(period, name, revenue)
SELECT
  dr.period,
  p.name,
  ROUND(dr.recognized * p.weight / tw.sumw, 2) AS revenue
FROM day_rev dr
CROSS JOIN prod p
CROSS JOIN tot_w tw;

DELETE FROM top_products;
INSERT INTO top_products(name, revenue)
SELECT name, ROUND(SUM(revenue),2) AS revenue
FROM top_products_daily
GROUP BY name
ORDER BY revenue DESC
LIMIT 10;

-- ========= Operations (12 monthly rows; all stored as 0–1 ratios) =========
DELETE FROM ops_uptime;
WITH RECURSIVE m2(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m2 WHERE n < 11
)
INSERT OR REPLACE INTO ops_uptime(period, uptime)
SELECT period, 0.991 + (ABS(RANDOM())%9)/1000.0 FROM m2;     -- 99.1%–99.9%

DELETE FROM ops_reliability;
WITH RECURSIVE m3(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m3 WHERE n < 11
)
INSERT OR REPLACE INTO ops_reliability(period, mtbf_hours, mttr_hours)
SELECT period, 420 + (ABS(RANDOM())%180), 3 + (ABS(RANDOM())%4) FROM m3;

DELETE FROM ops_quality;
WITH RECURSIVE m4(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m4 WHERE n < 11
)
INSERT OR REPLACE INTO ops_quality(period, doa_pct, defect_pct, warranty_pct)
SELECT period,
       0.006 + (ABS(RANDOM())%10)/1000.0,   -- DOA 0.6%–1.5%
       0.009 + (ABS(RANDOM())%16)/1000.0,   -- Defect 0.9%–2.5%
       0.004 + (ABS(RANDOM())%9)/1000.0     -- Warranty 0.4%–1.3%
FROM m4;

DELETE FROM ops_service_cost;
WITH RECURSIVE m5(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m5 WHERE n < 11
)
INSERT OR REPLACE INTO ops_service_cost(period, cost_per_device)
SELECT period, 18 + (ABS(RANDOM())%10) FROM m5;

-- ========= Supply (12 monthly rows; variance between -2% and +2% stored as a -0.02..0.02 ratio) =========
DELETE FROM supply_cogs_breakdown;
INSERT INTO supply_cogs_breakdown(component, cost) VALUES
('Controller PCB', 42.5),
('Motor/Actuator', 58.0),
('Frame/Chassis', 31.0),
('Sensors',       26.0),
('Packaging',      4.2);

DELETE FROM supply_cogs_variance;
WITH RECURSIVE m6(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m6 WHERE n < 11
)
INSERT OR REPLACE INTO supply_cogs_variance(period, variance_pct)
SELECT period, (-2 + (ABS(RANDOM())%5)) / 100.0 FROM m6;  -- -0.02 to +0.02

DELETE FROM supply_lead_time;
WITH RECURSIVE m7(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m7 WHERE n < 11
)
INSERT OR REPLACE INTO supply_lead_time(period, lead_time_days)
SELECT period, 28 + (ABS(RANDOM())%20) FROM m7;

DELETE FROM supply_inventory_turns;
WITH RECURSIVE m8(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM m8 WHERE n < 11
)
INSERT OR REPLACE INTO supply_inventory_turns(period, turns_per_year)
SELECT period, 6 + (ABS(RANDOM())%4) FROM m8;

-- ========= Telemetry (12 monthly rows) =========
DELETE FROM telemetry_utilization;
WITH RECURSIVE tm1(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM tm1 WHERE n < 11
)
INSERT OR REPLACE INTO telemetry_utilization(period, avg_hours_per_device)
SELECT period, 5 + (ABS(RANDOM())%5) FROM tm1;

DELETE FROM telemetry_consumption;
WITH RECURSIVE tm2(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM tm2 WHERE n < 11
)
INSERT OR REPLACE INTO telemetry_consumption(period, grams_per_cycle)
SELECT period, 12 + (ABS(RANDOM())%4) FROM tm2;

DELETE FROM telemetry_active_devices;
WITH RECURSIVE tm3(n, period) AS (
  SELECT 0, STRFTIME('%Y-%m','now')
  UNION ALL
  SELECT n+1, STRFTIME('%Y-%m', DATE(period,'start of month','-1 month')) FROM tm3 WHERE n < 11
)
INSERT OR REPLACE INTO telemetry_active_devices(period, active_devices)
SELECT period, 1200 + (ABS(RANDOM())%200) FROM tm3;

-- ========= Devices / Repurchases =========
DELETE FROM devices;
INSERT INTO devices(type, fault_type) VALUES
('Washer-Pro','bearing'),('Washer-Pro','sensor'),('Washer-Mini','pump'),
('Dryer-X','heater'),('Dryer-X','control');

DELETE FROM repurchases;
INSERT INTO repurchases(device_type, repurchase_rate) VALUES
('Washer-Pro', 0.14), ('Washer-Mini', 0.11), ('Dryer-X', 0.09);

-- ========= Events / Visits / Feedback =========
DELETE FROM user_events;
INSERT INTO user_events(event_type, event_time) VALUES
('login', DATETIME('now','-1 day')),
('view_dashboard', DATETIME('now','-1 day','+5 minutes')),
('export_csv', DATETIME('now','-2 day')),
('login', DATETIME('now','-3 day'));

DELETE FROM page_visits;
WITH RECURSIVE d3(n, day) AS (
  SELECT 0, DATE('now','-29 day')
  UNION ALL
  SELECT n+1, DATE(day,'+1 day') FROM d3 WHERE n < 29
)
INSERT INTO page_visits(visit_date, page_name)
SELECT day, CASE ABS(RANDOM())%5
             WHEN 0 THEN 'dashboard'
             WHEN 1 THEN 'finance'
             WHEN 2 THEN 'sales'
             WHEN 3 THEN 'manufacturing'
             ELSE 'marketing'
           END
FROM d3;

DELETE FROM product_feedback;
INSERT INTO product_feedback(category, type) VALUES
('Quality','defect'),('Support','feature'),('UX','usability'),('Performance','speed');

-- Keep example scores for non-NPS aspects
DELETE FROM feedback_scores WHERE aspect IN ('csat','psat');
INSERT INTO feedback_scores(aspect, score) VALUES
('csat', 4.2), ('psat', 4.0);

-- Sample feedback
DELETE FROM feedback;
INSERT INTO feedback(customer_id, type, message) VALUES
(1, 'issue', 'Intermittent sensor error on line #2'),
(2, 'feature', 'Bulk export for monthly close'),
(3, 'praise', 'Uptime has improved this quarter');

-- ========= Meetings / Schedule (sample data for calendar) =========
DELETE FROM meetings;
-- Today's meetings
INSERT INTO meetings(title, description, start_time, end_time, location, attendees, category) VALUES
('Daily Standup', 'Team sync on daily progress and blockers', 
 DATETIME('now', 'start of day', '+9 hours'), 
 DATETIME('now', 'start of day', '+9 hours', '+30 minutes'),
 'Conference Room A', 'John Doe, Jane Smith, Bob Wilson', 'meeting'),
('Client Presentation', 'Q4 product roadmap presentation for key client',
 DATETIME('now', 'start of day', '+14 hours'),
 DATETIME('now', 'start of day', '+15 hours', '+30 minutes'),
 'Main Conference Room', 'Sarah Johnson, Mike Chen, Client Team', 'meeting'),
('Code Review', 'Review pull requests for new feature branch',
 DATETIME('now', 'start of day', '+16 hours'),
 DATETIME('now', 'start of day', '+17 hours'),
 'Remote', 'Dev Team', 'meeting'),
('Gym Session', 'Personal workout at the gym',
 DATETIME('now', 'start of day', '+7 hours'),
 DATETIME('now', 'start of day', '+8 hours'),
 'Fitness Center', NULL, 'personal'),
('Doctor Appointment', 'Annual health checkup',
 DATETIME('now', 'start of day', '+11 hours'),
 DATETIME('now', 'start of day', '+11 hours', '+30 minutes'),
 'Medical Center', NULL, 'personal');

-- Tomorrow's meetings
INSERT INTO meetings(title, description, start_time, end_time, location, attendees, category) VALUES
('Sprint Planning', 'Plan tasks for next sprint cycle',
 DATETIME('now', '+1 day', 'start of day', '+10 hours'),
 DATETIME('now', '+1 day', 'start of day', '+12 hours'),
 'Conference Room B', 'Product Team, Engineering Team', 'meeting'),
('1-on-1 with Manager', 'Weekly one-on-one meeting',
 DATETIME('now', '+1 day', 'start of day', '+14 hours'),
 DATETIME('now', '+1 day', 'start of day', '+14 hours', '+45 minutes'),
 'Manager Office', 'Manager Name', 'meeting'),
('Team Lunch', 'Monthly team building lunch',
 DATETIME('now', '+1 day', 'start of day', '+12 hours', '+30 minutes'),
 DATETIME('now', '+1 day', 'start of day', '+13 hours', '+30 minutes'),
 'Restaurant Downtown', 'All Team Members', 'meeting'),
('Personal Time', 'Time for personal tasks and errands',
 DATETIME('now', '+1 day', 'start of day', '+15 hours'),
 DATETIME('now', '+1 day', 'start of day', '+16 hours'),
 NULL, NULL, 'personal');

-- This week's meetings (scattered across the week)
INSERT INTO meetings(title, description, start_time, end_time, location, attendees, category) VALUES
('Product Demo', 'Demo new features to stakeholders',
 DATETIME('now', '+2 days', 'start of day', '+10 hours'),
 DATETIME('now', '+2 days', 'start of day', '+11 hours'),
 'Conference Room A', 'Stakeholders, Product Team', 'meeting'),
('Architecture Review', 'Review system architecture changes',
 DATETIME('now', '+3 days', 'start of day', '+14 hours'),
 DATETIME('now', '+3 days', 'start of day', '+16 hours'),
 'Engineering Room', 'Tech Leads, Architects', 'meeting'),
('Customer Feedback Session', 'Gather feedback from beta users',
 DATETIME('now', '+4 days', 'start of day', '+9 hours', '+30 minutes'),
 DATETIME('now', '+4 days', 'start of day', '+11 hours'),
 'Remote', 'Beta Users, Product Team', 'meeting'),
('Release Planning', 'Plan next product release',
 DATETIME('now', '+5 days', 'start of day', '+13 hours'),
 DATETIME('now', '+5 days', 'start of day', '+15 hours'),
 'Main Conference Room', 'Product, Engineering, QA', 'meeting'),
('Family Dinner', 'Weekly family dinner',
 DATETIME('now', '+3 days', 'start of day', '+18 hours'),
 DATETIME('now', '+3 days', 'start of day', '+20 hours'),
 'Home', NULL, 'personal');

-- Next week's meetings
INSERT INTO meetings(title, description, start_time, end_time, location, attendees, category) VALUES
('Quarterly Review', 'Q4 business review and planning',
 DATETIME('now', '+7 days', 'start of day', '+9 hours'),
 DATETIME('now', '+7 days', 'start of day', '+12 hours'),
 'Executive Conference Room', 'Executive Team, Department Heads', 'meeting'),
('Training Session', 'New tool training for engineering team',
 DATETIME('now', '+8 days', 'start of day', '+14 hours'),
 DATETIME('now', '+8 days', 'start of day', '+17 hours'),
 'Training Room', 'Engineering Team', 'meeting'),
('All Hands Meeting', 'Company-wide monthly all hands',
 DATETIME('now', '+9 days', 'start of day', '+15 hours'),
 DATETIME('now', '+9 days', 'start of day', '+16 hours'),
 'Main Auditorium', 'All Employees', 'meeting');

-- Some past meetings (last week)
INSERT INTO meetings(title, description, start_time, end_time, location, attendees, category) VALUES
('Retrospective', 'Sprint retrospective meeting',
 DATETIME('now', '-3 days', 'start of day', '+15 hours'),
 DATETIME('now', '-3 days', 'start of day', '+16 hours', '+30 minutes'),
 'Conference Room A', 'Scrum Team', 'meeting'),
('Design Review', 'Review UI/UX designs for new feature',
 DATETIME('now', '-5 days', 'start of day', '+10 hours'),
 DATETIME('now', '-5 days', 'start of day', '+11 hours', '+30 minutes'),
 'Design Studio', 'Design Team, Product Team', 'meeting');

-- ========= Messages (sample data) =========
DELETE FROM messages;
-- Unread messages (recent)
INSERT INTO messages(title, content, sender, priority, read, archived, created_at) VALUES
('Q4 Revenue Target Achieved', 'Congratulations! We have successfully reached our Q4 revenue target of $2.5M. This represents a 15% growth compared to Q3.', 'Sarah Johnson', 'high', 0, 0, DATETIME('now', '-2 hours')),
('Action Required: Budget Review', 'Please review and approve the Q1 budget proposal by end of week. The document is available in the shared drive.', 'Finance Team', 'urgent', 0, 0, DATETIME('now', '-5 hours')),
('New Feature Launch: Calendar Integration', 'The calendar integration feature has been successfully deployed to production. All users can now sync their meetings.', 'Product Team', 'normal', 0, 0, DATETIME('now', '-1 day')),
('Team Meeting Reminder', 'Reminder: All-hands meeting scheduled for tomorrow at 2 PM. Please prepare your quarterly updates.', 'HR Department', 'normal', 0, 0, DATETIME('now', '-1 day', '+2 hours')),
('System Maintenance Scheduled', 'Scheduled maintenance window: This Saturday 2 AM - 4 AM EST. Some services may be temporarily unavailable.', 'DevOps Team', 'normal', 0, 0, DATETIME('now', '-2 days'));

-- Read messages (older)
INSERT INTO messages(title, content, sender, priority, read, archived, created_at) VALUES
('Welcome to the Dashboard', 'Welcome to the Manufacturing SaaS Dashboard! Explore the various modules and features available.', 'System', 'low', 1, 0, DATETIME('now', '-7 days')),
('Monthly Report Available', 'Your monthly performance report for November is now available. Check the Reports section to view details.', 'Analytics Team', 'normal', 1, 0, DATETIME('now', '-5 days')),
('Security Update Completed', 'All security patches have been successfully applied. Your system is now up to date.', 'Security Team', 'high', 1, 0, DATETIME('now', '-4 days'));

COMMIT;
