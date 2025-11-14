// src/pages/ExecutiveDashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Info, RefreshCw, Download } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";
import AlertCard, { type Level as AlertLevel } from "@/components/dashboard/AlertCard";
import RiskCard from "@/components/dashboard/RiskCard";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

/* ===== Types ===== */
type ExecKpiKey =
  | "revenue"
  | "backlog"
  | "uptime"
  | "nrr"
  | "gm"
  | "payback"
  | "book_to_bill"
  | "coverage_months"
  | "arr"
  | "forecast";

type ExecKpi = {
  key: ExecKpiKey;
  label: string;
  value: number;
  unit?: string;
  delta?: number; // fraction vs previous period, e.g. 0.082
  direction?: "up" | "down" | "flat";
};

type ApiResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  executiveKpis: ExecKpi[];
  revenueTrend: Array<{ period: string; recognized: number; booked?: number; backlog?: number }>;
  alerts: Array<{
    id: number;
    type: string;
    title: string;
    description: string;
    severity: "high" | "medium" | "low";
    created_at: string;
  }>;
  risks: Array<{ id: number; title: string; owner: string; due: string; mitigation: string; status: string }>;
};

interface UiData {
  last_updated: string;
  timeframe: ApiResp["timeframe"];
  kpis: Record<"revenue" | "backlog" | "uptime" | "nrr" | "gm" | "payback", ExecKpi | undefined>;
  highlights: Record<"book_to_bill" | "coverage_months" | "arr" | "forecast", ExecKpi | undefined>;
  trend: Array<{ date: string; recognized: number; booked?: number; backlog?: number }>;
  alerts: Array<{ id: string; level: AlertLevel; message: string; created_at: string; type?: string }>;
  risks: ApiResp["risks"];
  currency: string;
}

/* ===== Helpers ===== */
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

const TOOLTIP: Partial<Record<ExecKpiKey, string>> = {
  revenue: "Recognized revenue for the selected window.",
  backlog: "Undelivered orders at period end; quarter view uses the quarter-end value.",
  uptime: "Service/device availability (ratio 0–1), weighted over the selected period.",
  nrr: "Net Revenue Retention (ratio; may be >1): (opening MRR - churn + expansion) / opening MRR.",
  gm: "Gross margin (0–1): Σ profit / Σ revenue.",
  payback: "CAC payback period in months. For MVP, provided directly by the backend.",
  book_to_bill: "Bookings-to-billings ratio for the period.",
  coverage_months: "Ending backlog ÷ average recognized revenue over the last 6 months.",
  arr: "Annual Recurring Revenue: MRR × 12.",
  forecast: "Forecasted revenue for the next period (pipeline × win rate or model).",
};

const formatCurrency = (n?: number, unit = "£") =>
  typeof n === "number" ? `${unit}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";

// Robust percent formatter: treat values whose absolute value ≤ 2 as ratios (×100); otherwise assume already 0–100
const toPercent = (n?: number, digits = 1) =>
  typeof n === "number" ? `${(Math.abs(n) <= 2 ? n * 100 : n).toFixed(digits)}%` : "—";

const KPI_FMT: Record<ExecKpiKey, (k: ExecKpi, cur: string) => string> = {
  revenue: (k, cur) => formatCurrency(k.value, k.unit || cur),
  backlog: (k, cur) => formatCurrency(k.value, k.unit || cur),
  arr: (k, cur) => formatCurrency(k.value, k.unit || cur),
  forecast: (k, cur) => formatCurrency(k.value, k.unit || cur),
  gm: (k) => toPercent(k.value, 1),
  nrr: (k) => toPercent(k.value, 1),
  uptime: (k) => toPercent(k.value, 2),
  book_to_bill: (k) => (typeof k.value === "number" ? k.value.toFixed(2) : "—"),
  coverage_months: (k) => (typeof k.value === "number" ? `${nf1.format(k.value)}` : "—"),
  payback: (k) => (typeof k.value === "number" ? `${nf1.format(k.value)} ${k.unit || "mo"}` : "—"),
};

const levelMap = { high: "critical", medium: "warning", low: "info" } as const;

const mapApiToUi = (r: ApiResp): UiData => {
  const pick = (keys: ExecKpiKey[]) =>
    Object.fromEntries(keys.map((k) => [k, r.executiveKpis.find((x) => x.key === k)])) as any;

  const trend = r.revenueTrend.map((p) => ({
    date: p.period,
    recognized: p.recognized,
    booked: p.booked,
    backlog: p.backlog,
  }));

  const alerts = (r.alerts || []).map((a) => ({
    id: String(a.id),
    level: levelMap[a.severity],
    message: `${a.title} — ${a.description}`,
    created_at: a.created_at || new Date().toISOString(),
    type: a.type,
  }));

  const currency = r.executiveKpis.find((k) => k.key === "revenue")?.unit || "£";

  return {
    last_updated: new Date().toISOString(),
    timeframe: r.timeframe,
    kpis: pick(["revenue", "backlog", "uptime", "nrr", "gm", "payback"]),
    highlights: pick(["book_to_bill", "coverage_months", "arr", "forecast"]),
    trend,
    alerts,
    risks: r.risks || [],
    currency,
  };
};

/* ===== Small components ===== */
const KpiCard: React.FC<{ kpi?: ExecKpi; currency: string; onClick?: () => void }> = ({
  kpi,
  currency,
  onClick,
}) => {
  const deltaPct = typeof kpi?.delta === "number" ? kpi!.delta * 100 : null;
  const deltaColor =
    typeof deltaPct === "number" ? (deltaPct >= 0 ? "text-emerald-600" : "text-rose-600") : "text-muted-foreground";
  const deltaSign = typeof deltaPct === "number" ? (deltaPct > 0 ? "+" : "") : "";
  return (
    <Card className={cx("min-h-[110px] cursor-pointer transition", onClick && "hover:shadow-md")} onClick={onClick}>
      <CardHeader className="py-2 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {kpi?.label || "—"}
          {kpi?.key && TOOLTIP[kpi.key] && (
            <span className="group relative cursor-default">
              <Info className="w-3.5 h-3.5" />
              <span className="pointer-events-none absolute -left-2 top-5 z-10 hidden w-56 rounded-md border bg-background p-2 text-xs shadow group-hover:block">
                {TOOLTIP[kpi.key]}
              </span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="text-xl font-semibold tracking-tight">
          {kpi?.key ? KPI_FMT[kpi.key](kpi, currency) : "—"}
        </div>
        {typeof deltaPct === "number" && (
          <div className={cx("mt-0.5 text-[11px] leading-4", deltaColor)}>
            {deltaSign}
            {deltaPct.toFixed(1)}%
            <span className="text-muted-foreground"> vs prev.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const RangeSelector: React.FC<{ value: ApiRange; onChange: (v: ApiRange) => void }> = ({ value, onChange }) => {
  const options: { label: string; value: ApiRange }[] = [
    { label: "6M", value: "6m" },
    { label: "12M", value: "12m" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-xl border p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-3 py-1 text-sm transition",
            value === o.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

const GranularityToggle: React.FC<{ value: Granularity; onChange: (v: Granularity) => void }> = ({
  value,
  onChange,
}) => (
  <div className="flex items-center gap-1 rounded-xl border p-1">
    {(["month", "quarter"] as Granularity[]).map((g) => (
      <button
        key={g}
        onClick={() => onChange(g)}
        className={cx(
          "rounded-lg px-3 py-1 text-sm capitalize transition",
          value === g ? "bg-primary text-primary-foreground" : "hover:bg-muted",
        )}
      >
        {g}
      </button>
    ))}
  </div>
);

const LoadingGrid: React.FC = () => (
  <div className="grid grid-cols-4 gap-4">
    {Array.from({ length: 10 }).map((_, i) => (
      <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
    ))}
  </div>
);

const ErrorView: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <Card className="border-rose-300 bg-rose-50/50 dark:bg-rose-950/10">
    <CardContent className="flex items-center gap-3 p-4 text-rose-600">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div className="text-sm">
        <div className="font-medium">Something went wrong</div>
        <div className="text-rose-700/80">{message}</div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="ml-auto" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      )}
    </CardContent>
  </Card>
);

/* ===== Main ===== */
const ExecutiveDashboard: React.FC = () => {
  const navigate = useNavigate();
  const saved = loadTimeframe();
  const [range, setRange] = useState<ApiRange>(saved?.range ?? "12m");
  const [granularity, setGranularity] = useState<Granularity>(saved?.granularity ?? "month");

  const [data, setData] = useState<UiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoTimerRef = useRef<number | null>(null);
  const alertsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    saveTimeframe(range, granularity);
  }, [range, granularity]);

  const track = (event_type: string, meta?: Record<string, any>) => {
    try {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type, event_time: new Date().toISOString(), meta }),
      }).catch(() => {});
    } catch {}
  };

  const load = async (opts?: { signal?: AbortSignal }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ApiResp>(`/api/executive-dashboard?range=${range}&granularity=${granularity}`, {
        signal: opts?.signal,
      });
      setData(mapApiToUi(res));
    } catch (e: any) {
      const msg = String(e?.message || "");
      if ((e?.status === 0 && /aborted/i.test(msg)) || /AbortError/i.test(e?.name || "")) return;
      setError(e?.message ?? "Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const loadAlertsOnly = async () => {
    try {
      const r = await apiGet<ApiResp>(`/api/executive-dashboard?range=${range}&granularity=${granularity}`);
      const mapped = mapApiToUi(r);
      setData((prev) => (prev ? { ...prev, alerts: mapped.alerts } : mapped));
    } catch {}
  };

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    track("switch_range_or_granularity", { range, granularity });
    return () => ctrl.abort();
  }, [range, granularity]);

  useEffect(() => {
    if (autoRefresh) {
      autoTimerRef.current = window.setInterval(() => load(), 60_000);
    } else if (autoTimerRef.current) {
      window.clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    return () => {
      if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
    };
  }, [autoRefresh]);

  useEffect(() => {
    alertsTimerRef.current = window.setInterval(() => loadAlertsOnly(), 30_000);
    return () => {
      if (alertsTimerRef.current) window.clearInterval(alertsTimerRef.current);
    };
  }, [range, granularity]);

  const revenueOption = useMemo((): echarts.EChartsCoreOption => {
    const points = data?.trend ?? [];
    return {
      grid: { left: 56, right: 16, top: 24, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: points.map((p) => p.date), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => (v === 0 ? "0" : nf0.format(v)) } },
      series: [
        { name: "Recognized", type: "line", smooth: true, showSymbol: false, areaStyle: {}, data: points.map((p) => p.recognized ?? 0) },
        { name: "Booked", type: "line", smooth: true, showSymbol: false, data: points.map((p) => p.booked ?? 0) },
        { name: "Backlog", type: "line", smooth: true, showSymbol: false, data: points.map((p) => p.backlog ?? 0) },
      ],
    };
  }, [data]);

  const onExportCsv = () => {
    track("export_csv", { range, granularity });
    const rows: string[][] = [
      ["period", "recognized", "booked", "backlog"],
      ...((data?.trend ?? []).map((p) => [p.date, String(p.recognized ?? 0), String(p.booked ?? 0), String(p.backlog ?? 0)])),
    ];
    const csv = rows.map((r) => r.map((s) => (/(,|\n|")/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue_${range}_${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lastUpdatedText = useMemo(() => {
    if (!data?.last_updated) return "—";
    try {
      return new Date(data.last_updated).toLocaleString();
    } catch {
      return data.last_updated;
    }
  }, [data?.last_updated]);

  const gotoDrill = (k: ExecKpiKey) => {
    track("drilldown", { key: k, range, granularity });
    const q = `?range=${range}&granularity=${granularity}`;
    if (k === "uptime") return navigate(`/operations/uptime${q}`); // belongs to Operations
    if (k === "book_to_bill") return navigate(`/sales/kpis/pipeline${q}`);
    if (k === "forecast") return navigate(`/sales/kpis/revenue${q}`);
    if (k === "coverage_months") return navigate(`/supply/kpis/inventory_turns${q}`);
    if (k === "backlog") return navigate(`/supply${q}`);
    return navigate(`/finance/kpis/${k}${q}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_auto] gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight col-start-1 row-start-1">Executive Dashboard</h1>
        <div className="col-start-2 row-start-1 justify-self-end flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onExportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground">
              Auto refresh (60s)
            </Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </div>
        <div className="col-start-1 row-start-2 flex items-center gap-2">
          <RangeSelector value={range} onChange={setRange} />
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
        <div className="col-start-2 row-start-2 justify-self-end text-xs text-muted-foreground">Last updated: {lastUpdatedText}</div>
      </div>

      {loading && !data ? (
        <LoadingGrid />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={() => load()} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
            {(["revenue", "backlog", "uptime", "nrr", "gm", "payback"] as ExecKpiKey[]).map((key) => (
              <KpiCard
                key={key}
                kpi={data?.kpis[key as keyof UiData["kpis"]]}
                currency={data?.currency || "£"}
                onClick={() => gotoDrill(key)}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(["book_to_bill", "coverage_months", "arr", "forecast"] as ExecKpiKey[]).map((key) => (
              <KpiCard
                key={key}
                kpi={data?.highlights[key as keyof UiData["highlights"]]}
                currency={data?.currency || "£"}
                onClick={() => gotoDrill(key)}
              />
            ))}
          </div>
        </>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart
            key={`revenue-${range}-${granularity}-${data?.last_updated ?? ""}`}
            height={320}
            renderer="svg"
            option={revenueOption}
          />
        </CardContent>
      </Card>

      {!!data?.alerts?.length && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-lg font-semibold">Alerts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            {data!.alerts!.map((a) => {
              const q = `?range=${range}&granularity=${granularity}`;
              const isSupply = a.type === "supply";
              const isManufacturing = a.type === "ops" || a.type === "manufacturing";
              const isMarketing = a.type === "marketing";
              const clickable = isSupply || isManufacturing || isMarketing;
              const handleClick = () => {
                if (!clickable) return;
                track("alert_click", { id: a.id, type: a.type });
                if (isSupply) navigate(`/supply${q}`);
                else if (isManufacturing) navigate(`/manufacturing${q}`);
                else if (isMarketing) navigate(`/marketing${q}`);
              };
              return (
                <div
                  key={a.id}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={handleClick}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") handleClick();
                        }
                      : undefined
                  }
                  className={clickable ? "cursor-pointer select-none" : undefined}
                  title={
                    isSupply ? "Go to Supply" : isManufacturing ? "Go to Manufacturing" : isMarketing ? "Go to Marketing" : undefined
                  }
                >
                  <AlertCard level={a.level} message={a.message} timestamp={a.created_at} className="h-[96px] sm:h-[112px] overflow-hidden" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!!data?.risks?.length && (
        <div className="grid grid-cols-1 gap-3">
          <h2 className="text-lg font-semibold">Risks</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-max items-stretch">
            {data!.risks!.map((r) => (
              <RiskCard
                key={r.id}
                title={r.title}
                owner={r.owner}
                due={r.due}
                mitigation={r.mitigation}
                status={r.status}
                className="h-full min-h-[128px] pt-1.5 md:pt-2"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveDashboard;
