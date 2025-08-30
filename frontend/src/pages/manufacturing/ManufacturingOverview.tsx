import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";
import { apiGet } from "@/lib/fetcher";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

type KpiKey = "uptime" | "mtbf" | "mttr" | "doa" | "defect" | "warranty" | "cost_per_device";
type OverviewResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  kpis: Array<{ key: KpiKey; label: string; value: number; unit?: string | null }>;
  qualityTrend: Array<{ period: string; doa: number; defect: number; warranty: number }>;
  reliabilityTrend: Array<{ period: string; mtbf: number; mttr: number }>;
  costTrend: Array<{ period: string; cost_per_device: number }>;
  breakdown: Array<{ name: string; count: number; share: number }>;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

const formatPercent = (n: number, digits = 2) => `${n.toFixed(digits)}%`;
const formatCurrency = (n: number, unit = "¥") => `${unit}${n.toLocaleString()}`;

const KpiCard: React.FC<{ k: OverviewResp["kpis"][number]; onClick?: () => void }> = ({ k, onClick }) => {
  const text =
    k.key === "uptime" || k.key === "doa" || k.key === "defect" || k.key === "warranty"
      ? formatPercent(k.value, k.key === "uptime" ? 3 : 2)
      : k.key === "cost_per_device"
      ? formatCurrency(k.value, k.unit || "¥")
      : `${nf1.format(k.value)} ${k.unit || ""}`;
  return (
    <Card className={onClick ? "cursor-pointer hover:shadow-md transition" : ""} onClick={onClick}>
      <CardHeader className="py-2 pb-1">
        <CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="text-xl font-semibold tracking-tight">{text}</div>
      </CardContent>
    </Card>
  );
};

const ManufacturingOverview: React.FC = () => {
  const saved = loadTimeframe();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();

  const [range, setRange] = useState<ApiRange>((sp.get("range") as ApiRange) || saved?.range || "12m");
  const [granularity, setGranularity] = useState<Granularity>((sp.get("granularity") as Granularity) || saved?.granularity || "month");

  const [data, setData] = useState<OverviewResp | null>(null);
  const [loading, setLoading] = useState(false);

  const syncQs = (r: ApiRange, g: Granularity) => {
    setSp((prev) => { prev.set("range", r); prev.set("granularity", g); return prev; }, { replace: true });
    saveTimeframe(r, g);
  };

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiGet<OverviewResp>(`/api/manufacturing/overview?range=${range}&granularity=${granularity}`);
      setData(resp);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { syncQs(range, granularity); /* eslint-disable-next-line */ }, [range, granularity]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range, granularity]);

  const qualityOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.qualityTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 28, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", name: "%", axisLabel: { formatter: (v: number) => `${v}%` } },
      series: [
        { name: "DOA", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.doa ?? 0) },
        { name: "Defect", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.defect ?? 0) },
        { name: "Warranty", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.warranty ?? 0) },
      ],
    };
  }, [data]);

  const reliabilityOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.reliabilityTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 28, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", name: "hours" },
      series: [
        { name: "MTBF", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.mtbf ?? 0) },
        { name: "MTTR", type: "line", smooth: true, showSymbol: false, data: pts.map(p => p.mttr ?? 0) },
      ],
    };
  }, [data]);

  const costOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.costTrend ?? [];
    return {
      grid: { left: 56, right: 16, top: 28, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: pts.map(p => p.period), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", name: "¥", axisLabel: { formatter: (v: number) => (v === 0 ? "0" : nf0.format(v)) } },
      series: [{ name: "Service Cost / Device", type: "line", smooth: true, showSymbol: false, areaStyle: {}, data: pts.map(p => p.cost_per_device ?? 0) }],
    };
  }, [data]);

  const gotoDrill = (k: KpiKey) => {
    const q = `?range=${range}&granularity=${granularity}`;
    navigate(`/manufacturing/kpis/${k}${q}`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Manufacturing</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      {loading && !data ? (
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 7 }).map((_, i) => (<div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />))}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-2">
            {(data?.kpis ?? []).map(k => <KpiCard key={k.key} k={k} onClick={() => gotoDrill(k.key)} />)}
          </div>

          {/* Trends */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-0"><CardTitle className="text-base">Quality Trend</CardTitle></CardHeader>
            <CardContent><EChart height={320} renderer="svg" option={qualityOption} /></CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-0"><CardTitle className="text-base">Reliability Trend</CardTitle></CardHeader>
            <CardContent><EChart height={320} renderer="svg" option={reliabilityOption} /></CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-0"><CardTitle className="text-base">Service Cost per Device</CardTitle></CardHeader>
            <CardContent><EChart height={320} renderer="svg" option={costOption} /></CardContent>
          </Card>

          {/* Breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Breakdown by Fault Type</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-[520px] w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left py-2 pr-2">Fault Type</th>
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
        </>
      )}
    </div>
  );
};

export default ManufacturingOverview;
