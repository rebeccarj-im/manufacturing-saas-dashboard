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

type KpiKey = "lead_time" | "inventory_turns" | "cogs_variance" | "cogs_total";
type Kpi = { key: KpiKey; label: string; value: number; unit?: string | null };
type OverviewResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  kpis: Kpi[];
  leadTimeTrend: Array<{ period: string; lead_time_days: number }>;
  inventoryTurnsTrend: Array<{ period: string; turns_per_year: number }>;
  cogsVarianceTrend: Array<{ period: string; variance_pct: number }>;
  cogsBreakdown: Array<{ name: string; value: number; share: number }>;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

const KpiCard: React.FC<{ kpi: Kpi; onClick?: () => void }> = ({ kpi, onClick }) => {
  const text =
    kpi.key === "cogs_variance" ? `${kpi.value.toFixed(1)}%` :
    kpi.key === "lead_time" ? `${nf0.format(kpi.value)} days` :
    kpi.key === "inventory_turns" ? `${nf1.format(kpi.value)} turns` :
    `£${kpi.value.toLocaleString()}`;
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

const SupplyOverview: React.FC = () => {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();

  const initRange = (sp.get("range") as ApiRange) || loadTimeframe()?.range || "12m";
  const initGran  = (sp.get("granularity") as Granularity) || loadTimeframe()?.granularity || "month";
  const [range, setRange] = useState<ApiRange>(initRange);
  const [granularity, setGranularity] = useState<Granularity>(initGran);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [data, setData] = useState<OverviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSp((prev) => { prev.set("range", range); prev.set("granularity", granularity); return prev; }, { replace: true });
    saveTimeframe(range, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<OverviewResp>(`/api/supply/overview?range=${range}&granularity=${granularity}`);
      setData(r);
    } catch (e: any) {
      setErr(e?.message || "Failed to load supply overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range, granularity]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, range, granularity]);

  const leadOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.leadTimeTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 40, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 8 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", name: "Days", nameLocation: "middle", nameGap: 46 },
      series: [{ name: "Lead Time (days)", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.lead_time_days ?? 0) }],
    };
  }, [data]);

  const turnsOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.inventoryTurnsTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 40, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 8 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", name: "Turns", nameLocation: "middle", nameGap: 46 },
      series: [{ name: "Inventory Turns", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.turns_per_year ?? 0) }],
    };
  }, [data]);

  const varOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.cogsVarianceTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 40, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 8 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", name: "%", nameLocation: "middle", nameGap: 46, axisLabel: { formatter: (v: number) => `${v}%` } },
      series: [{ name: "COGS Variance %", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.variance_pct ?? 0) }],
    };
  }, [data]);

  const onExportCsv = () => {
    const pts = data?.leadTimeTrend ?? [];
    const rows: string[][] = [
      ["period", "lead_time_days", "inventory_turns", "cogs_variance_pct"],
      ...pts.map((p, i) => [
        p.period,
        String(p.lead_time_days ?? 0),
        String(data?.inventoryTurnsTrend?.[i]?.turns_per_year ?? 0),
        String(data?.cogsVarianceTrend?.[i]?.variance_pct ?? 0)
      ])
    ];
    const csv = rows
      .map((r) => r.map((s) => (/(,|\n|")/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supply_trends_${range}_${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiOrder: KpiKey[] = ["lead_time","inventory_turns","cogs_variance","cogs_total"];
  const kpiMap = new Map((data?.kpis ?? []).map((k) => [k.key, k]));

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight col-start-1 row-start-1">Supply</h1>
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
            {(["6m","12m"] as ApiRange[]).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={cx("rounded-lg px-3 py-1 text-sm transition", range === r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border p-1">
            {(["month","quarter"] as Granularity[]).map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={cx("rounded-lg px-3 py-1 text-sm capitalize transition", granularity === g ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
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
            <KpiCard key={k} kpi={item} onClick={() => navigate(`/supply/kpis/${k}?range=${range}&granularity=${granularity}`)} />
          ) : <Card key={k} className="min-h-[110px] opacity-50"><CardContent className="p-4">—</CardContent></Card>;
        })}
      </div>

      {/* Trends */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0"><CardTitle className="text-base">Lead Time Trend</CardTitle></CardHeader>
        <CardContent><EChart height={320} renderer="svg" option={leadOption} /></CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-0"><CardTitle className="text-base">Inventory Turns Trend</CardTitle></CardHeader>
        <CardContent><EChart height={320} renderer="svg" option={turnsOption} /></CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-0"><CardTitle className="text-base">COGS Variance Trend</CardTitle></CardHeader>
        <CardContent><EChart height={320} renderer="svg" option={varOption} /></CardContent>
      </Card>

      {/* Breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">COGS Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[480px] w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 pr-2">Component</th>
                  <th className="text-right py-2 pr-2">Cost</th>
                  <th className="text-right py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {(data?.cogsBreakdown ?? []).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-2">{r.name}</td>
                    <td className="py-2 pr-2 text-right">£{r.value.toLocaleString()}</td>
                    <td className="py-2 text-right">{(r.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {!loading && (data?.cogsBreakdown?.length ?? 0) === 0 && (
                  <tr><td className="py-6 text-center text-muted-foreground" colSpan={3}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SupplyOverview;
