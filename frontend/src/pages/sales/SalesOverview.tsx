// src/pages/sales/SalesOverview.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Download } from "lucide-react";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";
import { apiGet } from "@/lib/fetcher";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

type KpiKey =
  | "leads"
  | "mql"
  | "sql"
  | "won"
  | "win_rate"
  | "sales_cycle"
  | "avg_deal"
  | "new_customers"
  | "revenue";

type Kpi = { key: KpiKey; label: string; value: number; unit?: string | null };

type OverviewResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  kpis: Kpi[];
  pipelineTrend: Array<{ period: string; leads: number; mql: number; sql: number; won: number }>;
  winrateTrend: Array<{ period: string; win_rate_pct: number; sales_cycle_days: number }>; // win_rate_pct is 0–1
  topProducts: Array<{ name: string; revenue: number }>;
  topCustomers: Array<{ name: string; revenue: number }>;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");
const toPercent = (n?: number, digits = 1) =>
  typeof n === "number" ? `${(Math.abs(n) <= 2 ? n * 100 : n).toFixed(digits)}%` : "—";

const KpiCard: React.FC<{ kpi: Kpi; onClick?: () => void }> = ({ kpi, onClick }) => {
  const text =
    kpi.key === "win_rate"
      ? toPercent(kpi.value, 1)
      : kpi.key === "sales_cycle"
      ? `${nf0.format(kpi.value)} days`
      : kpi.key === "avg_deal" || kpi.key === "revenue"
      ? `£${kpi.value.toLocaleString()}`
      : nf0.format(kpi.value);
  return (
    <Card className={cx("min-h-[110px] cursor-pointer transition", onClick && "hover:shadow-md")} onClick={onClick}>
      <CardHeader className="py-2 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="text-xl font-semibold tracking-tight">{text}</div>
      </CardContent>
    </Card>
  );
};

const SalesOverview: React.FC = () => {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();

  const initRange = (sp.get("range") as ApiRange) || loadTimeframe()?.range || "12m";
  const initGran = (sp.get("granularity") as Granularity) || loadTimeframe()?.granularity || "month";
  const [range, setRange] = useState<ApiRange>(initRange);
  const [granularity, setGranularity] = useState<Granularity>(initGran);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [data, setData] = useState<OverviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSp((prev) => {
      prev.set("range", range);
      prev.set("granularity", granularity);
      return prev;
    }, { replace: true });
    saveTimeframe(range, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<OverviewResp>(`/api/sales/overview?range=${range}&granularity=${granularity}`);
      setData(r);
    } catch (e: any) {
      setErr(e?.message || "Failed to load sales overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, range, granularity]);

  const pipelineOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.pipelineTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 24, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: pts.map((p) => p.period),
        axisLabel: { hideOverlap: true }
      },
      yAxis: { type: "value" },
      series: [
        { name: "Leads", type: "line", smooth: true, showSymbol: false, data: pts.map((p) => p.leads) },
        { name: "MQL", type: "line", smooth: true, showSymbol: false, data: pts.map((p) => p.mql) },
        { name: "SQL", type: "line", smooth: true, showSymbol: false, data: pts.map((p) => p.sql) },
        { name: "Won", type: "line", smooth: true, showSymbol: false, data: pts.map((p) => p.won) }
      ]
    };
  }, [data]);

  // — Revised dual-axis chart: centered axis titles, ample grid margins, pretty ticks, auto ×100 — //
  const winrateOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.winrateTrend ?? [];

    const rawRates = pts.map((p) => p.win_rate_pct ?? 0);
    const maxRawRate = rawRates.length ? Math.max(...rawRates) : 0;
    const pctFactor = maxRawRate <= 2 ? 100 : 1; // Percentage: 0–1 

    const rateVals = rawRates.map((v) => v * pctFactor);
    const daysVals = pts.map((p) => p.sales_cycle_days ?? 0);

    const nice = (m: number, step = 10) => (m <= 0 ? step : Math.ceil(m / step) * step);
    const leftMaxNice = nice(Math.max(0, ...rateVals), 5); // Percentage: 5% per tick.
    const rightMaxNice = nice(Math.max(0, ...daysVals), 10); // Days: 10 per tick.

    const showDot = pts.length <= 1;

    return {
      grid: { left: 56, right: 64, top: 52, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 8 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: pts.map((p) => p.period),
        axisLabel: { hideOverlap: true }
      },
      yAxis: [
        {
          type: "value",
          name: "Win %",
          position: "left",
          min: 0,
          max: leftMaxNice,
          splitNumber: 5,
          nameLocation: "middle",
          nameGap: 40,
          axisLabel: { formatter: (v: number) => `${v}%` }
        },
        {
          type: "value",
          name: "Days",
          position: "right",
          min: 0,
          max: rightMaxNice,
          splitNumber: 5,
          nameLocation: "middle",
          nameGap: 40
        }
      ],
      series: [
        { name: "Win %", type: "line", smooth: true, showSymbol: showDot, yAxisIndex: 0, data: rateVals },
        { name: "Sales Cycle (days)", type: "line", smooth: true, showSymbol: showDot, yAxisIndex: 1, data: daysVals }
      ]
    };
  }, [data]);

  const onExportCsv = () => {
    const pts = data?.pipelineTrend ?? [];
    const rows: string[][] = [
      ["period", "leads", "mql", "sql", "won"],
      ...pts.map((p) => [p.period, String(p.leads), String(p.mql), String(p.sql), String(p.won)])
    ];
    const csv = rows
      .map((r) => r.map((s) => (/(,|\n|")/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales_pipeline_${range}_${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiOrder: KpiKey[] = [
    "leads",
    "mql",
    "sql",
    "won",
    "win_rate",
    "sales_cycle",
    "avg_deal",
    "new_customers",
    "revenue"
  ];
  const kpiMap = new Map((data?.kpis ?? []).map((k) => [k.key, k]));

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight col-start-1 row-start-1">Sales</h1>
        <div className="col-start-2 row-start-1 justify-self-end flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={load}>
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
          <div className="flex items-center gap-1 rounded-xl border p-1">
            {(["6m", "12m"] as ApiRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cx(
                  "rounded-lg px-3 py-1 text-sm transition",
                  range === r ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border p-1">
            {(["month", "quarter"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cx(
                  "rounded-lg px-3 py-1 text-sm capitalize transition",
                  granularity === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="col-start-2 row-start-2 justify-self-end text-xs text-muted-foreground">
          Window: {data?.timeframe?.start_date ?? "—"} → {data?.timeframe?.end_date ?? "—"}
        </div>
      </div>

      {!!err && (
        <Card className="border-rose-300 bg-rose-50/50 dark:bg-rose-950/10">
          <CardContent className="p-4 text-rose-600 text-sm">{err}</CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
        {kpiOrder.map((k) => {
          const item = kpiMap.get(k);
          return item ? (
            <KpiCard
              key={k}
              kpi={item}
              onClick={() => navigate(`/sales/kpis/${k}?range=${range}&granularity=${granularity}`)}
            />
          ) : (
            <Card key={k} className="min-h-[110px] opacity-50">
              <CardContent className="p-4">—</CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline Trend */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Pipeline Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart
            key={`sales-pipe-${range}-${granularity}`} // stable key
            height={320}
            renderer="svg"
            option={pipelineOption}
          />
        </CardContent>
      </Card>

      {/* Win Rate & Sales Cycle */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Win Rate & Sales Cycle</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart
            key={`sales-wr-${range}-${granularity}`} // stable key
            height={320}
            renderer="svg"
            option={winrateOption}
          />
        </CardContent>
      </Card>

      {/* Top lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-[420px] w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 pr-2">Product</th>
                    <th className="text-right py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topProducts ?? []).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 text-right">£{r.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!loading && (data?.topProducts?.length ?? 0) === 0 && (
                    <tr>
                      <td className="py-6 text-center text-muted-foreground" colSpan={2}>
                        No data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-[420px] w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 pr-2">Customer</th>
                    <th className="text-right py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.topCustomers ?? []).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 text-right">£{r.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!loading && (data?.topCustomers?.length ?? 0) === 0 && (
                    <tr>
                      <td className="py-6 text-center text-muted-foreground" colSpan={2}>
                        No data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesOverview;
