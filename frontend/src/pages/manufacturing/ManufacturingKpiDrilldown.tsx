import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";
import { apiGet } from "@/lib/fetcher";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

type Dim = "fault_type" | "device_type";
type KpiKey = "uptime" | "mtbf" | "mttr" | "doa" | "defect" | "warranty" | "cost_per_device";
type DrillResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  metric: KpiKey;
  series: Array<Record<string, number | string>>;
  breakdown: Array<{ name: string; count: number; share: number }>;
  unit?: string | null;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const parseNumber = (x: unknown): number => {
  if (x == null) return NaN;
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const s = x.trim().replace(/,/g, "");
    const hasPct = s.endsWith("%");
    const n = Number(hasPct ? s.slice(0, -1) : s);
    return Number.isNaN(n) ? NaN : n;
  }
  return NaN;
};

const ManufacturingKpiDrilldown: React.FC = () => {
  const params = useParams<{ key?: KpiKey }>();
  const key = (params.key ?? "uptime") as KpiKey;

  const [sp, setSp] = useSearchParams();
  const initRange = (sp.get("range") as ApiRange) || loadTimeframe()?.range || "12m";
  const initGran  = (sp.get("granularity") as Granularity) || loadTimeframe()?.granularity || "month";

  const [range, setRange] = useState<ApiRange>(initRange);
  const [granularity, setGranularity] = useState<Granularity>(initGran);
  const [dim, setDim] = useState<Dim>((sp.get("by") as Dim) || "fault_type");

  const [unit, setUnit] = useState<string>("");
  const [series, setSeries] = useState<DrillResp["series"]>([]);
  const [breakdown, setBreakdown] = useState<DrillResp["breakdown"]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setSp((prev) => { prev.set("range", range); prev.set("granularity", granularity); prev.set("by", dim); return prev; }, { replace: true });
    saveTimeframe(range, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity, dim]);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiGet<DrillResp>(`/api/manufacturing/kpis/${key}?range=${range}&granularity=${granularity}&by=${dim}`);
      setUnit(resp.unit || (key==="uptime"||key==="doa"||key==="defect"||key==="warranty" ? "%" : ""));
      setSeries(resp.series || []);
      setBreakdown(resp.breakdown || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [key, range, granularity, dim]);

  const valueKeys = useMemo(() => {
    const first = series[0] || {};
    return Object.keys(first).filter((k) => k !== "period");
  }, [series]);

  const option = useMemo<echarts.EChartsCoreOption>(() => {
    const x = series.map(s => String((s as any).period));
    const legend = valueKeys.length ? valueKeys.map(k => k.toUpperCase()) : ["VALUE"];
    const isPct = unit === "%" || key === "uptime" || key === "doa" || key === "defect" || key === "warranty";

    const sampleVals: number[] = (valueKeys.length ? valueKeys : ["value"])
      .flatMap(k => series.map(s => parseNumber((s as any)[k])))
      .filter(v => Number.isFinite(v)) as number[];
    const maxVal = sampleVals.length ? Math.max(...sampleVals) : 0;
    const pctFactor = isPct && maxVal > 0 && maxVal <= 1.5 ? 100 : 1;
    const showDot = x.length <= 1;

    const sers = valueKeys.length
      ? valueKeys.map(k => ({
          name: k.toUpperCase(),
          type: "line" as const,
          smooth: true,
          showSymbol: showDot,
          data: series.map(s => {
            const v = parseNumber((s as any)[k]);
            return Number.isFinite(v) ? v * pctFactor : 0;
          }),
        }))
      : [{
          name: "VALUE",
          type: "line" as const,
          smooth: true,
          showSymbol: showDot,
          data: series.map(s => {
            const v = parseNumber((s as any).value);
            return Number.isFinite(v) ? v * pctFactor : 0;
          }),
        }];

    return {
      grid: { left: 56, right: 16, top: 28, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: legend },
      xAxis: { type: "category", boundaryGap: false, data: x, axisLabel: { hideOverlap: true } },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => (isPct ? `${v}%` : (v === 0 ? "0" : nf0.format(v))) }
      },
      series: sers,
    };
  }, [series, valueKeys, unit, key]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight capitalize">Manufacturing • {key}</h1>
        <div className="flex items-center gap-2">
          {(["fault_type","device_type"] as Dim[]).map(d => (
            <Button key={d} variant={d===dim ? "default" : "outline"} size="sm" onClick={() => setDim(d)} className="capitalize">
              {d.replace("_"," ")}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Trend {unit ? `(${unit})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Do not pass a dynamic key to EChart anymore to avoid teardown/recreation causing 0-width on the first frame */}
          <EChart height={340} renderer="svg" option={option} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Breakdown by {dim.replace("_"," ")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 pr-2">Name</th>
                  <th className="text-right py-2 pr-2">Count</th>
                  <th className="text-right py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {(loading ? [] : breakdown).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-2">{r.name}</td>
                    <td className="py-2 pr-2 text-right">{nf0.format(r.count)}</td>
                    <td className="py-2 text-right">{(r.share*100).toFixed(1)}%</td>
                  </tr>
                ))}
                {!loading && breakdown.length === 0 && (
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

export default ManufacturingKpiDrilldown;
