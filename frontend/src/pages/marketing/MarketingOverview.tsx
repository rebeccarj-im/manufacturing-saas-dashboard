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

type KpiKey = "visits" | "leads" | "mql" | "sql" | "nps" | "csat" | "conversion";

type OverviewResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  kpis: Array<{ key: KpiKey; label: string; value: number; unit?: string | null }>;
  visitsTrend: Array<{ period: string; visits: number }>;
  funnelTrend: Array<{ period: string; leads: number; mql: number; sql: number }>;
  breakdown: Array<{ name: string; count: number; share: number }>;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

const KpiCard: React.FC<{ kpi?: OverviewResp["kpis"][number]; onClick?: () => void }> = ({ kpi, onClick }) => {
  if (!kpi) return <Card className="min-h-[110px]"><CardContent className="h-full" /></Card>;
  const text =
    kpi.key === "conversion" ? `${nf2.format(kpi.value)}%`
      : kpi.key === "nps" || kpi.key === "csat" ? nf2.format(kpi.value)
      : nf0.format(kpi.value);
  return (
    <Card className={cx("min-h-[110px] cursor-pointer transition", onClick && "hover:shadow-md")} onClick={onClick}>
      <CardHeader className="py-2 pb-1">
        <CardTitle className="text-xs text-muted-foreground">{kpi.label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="text-xl font-semibold tracking-tight">{text}</div>
      </CardContent>
    </Card>
  );
};

const MarketingOverview: React.FC = () => {
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

  // URL & preference sync (aligned with Supply)
  useEffect(() => {
    setSp((prev) => { prev.set("range", range); prev.set("granularity", granularity); return prev; }, { replace: true });
    saveTimeframe(range, granularity);
  }, [range, granularity, setSp]);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const resp = await apiGet<OverviewResp>(`/api/marketing/overview?range=${range}&granularity=${granularity}`);
      setData(resp);
    } catch (e: any) {
      setErr(e?.message || "Failed to load marketing overview");
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

  // Chart configs: fixed height and stable keys; do not depend on loading/data timestamps to prevent remount jitter
  const trafficOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.visitsTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 24, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => (v === 0 ? "0" : nf0.format(v)) } },
      series: [
        { name: "Visits", type: "line", smooth: true, showSymbol: false, areaStyle: {}, data: pts.map(p => p.visits ?? 0) },
      ],
    };
  }, [data]);

  const funnelOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.funnelTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 24, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => (v === 0 ? "0" : nf0.format(v)) } },
      series: [
        { name: "Leads", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.leads ?? 0) },
        { name: "MQL",   type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.mql ?? 0) },
        { name: "SQL",   type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.sql ?? 0) },
      ],
    };
  }, [data]);

  const onExportCsv = () => {
    const pts = data?.funnelTrend ?? [];
    const rows: string[][] = [
      ["period", "leads", "mql", "sql"],
      ...pts.map((p) => [p.period, String(p.leads ?? 0), String(p.mql ?? 0), String(p.sql ?? 0)])
    ];
    const csv = rows
      .map((r) => r.map((s) => (/(,|\n|")/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketing_funnel_${range}_${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiOrder: KpiKey[] = ["visits","leads","mql","sql","nps","csat","conversion"];
  const kpiMap = new Map((data?.kpis ?? []).map(k => [k.key, k]));

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight col-start-1 row-start-1">Marketing</h1>
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
            {(["6m","12m"] as ApiRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cx("rounded-lg px-3 py-1 text-sm transition", range===r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border p-1">
            {(["month","quarter"] as Granularity[]).map(g => (
              <button key={g} onClick={() => setGranularity(g)}
                className={cx("rounded-lg px-3 py-1 text-sm capitalize transition", granularity===g ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="col-start-2 row-start-2 justify-self-end text-xs text-muted-foreground">
          Window: {data?.timeframe?.start_date ?? "—"} → {data?.timeframe?.end_date ?? "—"}
        </div>
      </div>

      {!!err && <Card className="border-rose-300 bg-rose-50/50 dark:bg-rose-950/10"><CardContent className="p-4 text-rose-600 text-sm">{err}</CardContent></Card>}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
        {kpiOrder.map(k => (
          <KpiCard key={k} kpi={kpiMap.get(k)} onClick={() => navigate(`/marketing/kpis/${k}?range=${range}&granularity=${granularity}`)} />
        ))}
      </div>

      {/* Charts: overflow-hidden + stable keys */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0"><CardTitle className="text-base">Traffic (Visits)</CardTitle></CardHeader>
        <CardContent>
          <EChart key={`mkt-vis-${range}-${granularity}`} height={320} renderer="svg" option={trafficOption} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-0"><CardTitle className="text-base">Funnel (Leads / MQL / SQL)</CardTitle></CardHeader>
        <CardContent>
          <EChart key={`mkt-fun-${range}-${granularity}`} height={320} renderer="svg" option={funnelOption} />
        </CardContent>
      </Card>

      {/* Breakdown table (no-height skeleton to avoid jumps) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Source Mix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 pr-2">Source</th>
                  <th className="text-right py-2 pr-2">Count</th>
                  <th className="text-right py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {(data?.breakdown ?? []).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-2">{r.name}</td>
                    <td className="py-2 pr-2 text-right">{nf0.format(r.count)}</td>
                    <td className="py-2 text-right">{(r.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {(data?.breakdown?.length ?? 0) === 0 && (
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

export default MarketingOverview;
