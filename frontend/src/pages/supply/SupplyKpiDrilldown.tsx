import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";
import { apiGet } from "@/lib/fetcher";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

type KpiKey = "lead_time" | "inventory_turns" | "cogs_variance" | "cogs_total";
type DrillResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  metric: KpiKey;
  series: Array<Record<string, number | string>>;
  breakdown: Array<{ name: string; value: number; share: number }>;
  unit?: string | null;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const SupplyKpiDrilldown: React.FC = () => {
  const { key = "lead_time" } = useParams();
  const [sp, setSp] = useSearchParams();

  const initRange = (sp.get("range") as ApiRange) || loadTimeframe()?.range || "12m";
  const initGran  = (sp.get("granularity") as Granularity) || loadTimeframe()?.granularity || "month";
  const [range, setRange] = useState<ApiRange>(initRange);
  const [granularity, setGranularity] = useState<Granularity>(initGran);

  const [unit, setUnit] = useState<string>("");
  const [series, setSeries] = useState<DrillResp["series"]>([]);
  const [breakdown, setBreakdown] = useState<DrillResp["breakdown"]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    sp.set("range", range);
    sp.set("granularity", granularity);
    setSp(sp, { replace: true });
    saveTimeframe(range, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity]);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiGet<DrillResp>(`/api/supply/kpis/${key}?range=${range}&granularity=${granularity}`);
      setUnit(resp.unit || "");
      setSeries(resp.series || []);
      setBreakdown(resp.breakdown || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [key, range, granularity]);

  const valueKeys = useMemo(() => {
    const first = series[0] || {};
    return Object.keys(first).filter((k) => k !== "period");
  }, [series]);

  const option = useMemo((): echarts.EChartsCoreOption => {
    const x = series.map(s => String((s as any).period));
    const legend = valueKeys.length ? valueKeys.map(k => k[0].toUpperCase() + k.slice(1)) : ["Value"];
    const sers = valueKeys.length
      ? valueKeys.map(k => ({
          name: k[0].toUpperCase() + k.slice(1),
          type: "line" as const,
          smooth: true,
          showSymbol: x.length <= 1,
          data: series.map(s => Number((s as any)[k] || 0))
        }))
      : [{
          name: "Value",
          type: "line" as const,
          smooth: true,
          showSymbol: x.length <= 1,
          data: series.map(s => Number((s as any).value || 0))
        }];

    // // — Y-axis unit & title centered along the axis to avoid crowding the chart title.
    const yName =
      unit === "%" ? "%" :
      unit === "days" ? "Days" :
      unit === "turns" ? "Turns" : "";

    return {
      grid: { left: 56, right: 16, top: 40, bottom: 36, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 8, data: legend },
      xAxis: { type: "category", boundaryGap: false, data: x, axisLabel: { hideOverlap: true } },
      yAxis: {
        type: "value",
        name: yName,
        nameLocation: "middle",
        nameGap: 46,
        axisLabel: {
          formatter: (v: number) => {
            if (unit === "%") return `${v}%`;
            if (unit === "days") return `${v}`;
            if (unit === "turns") return `${v}`;
            return v === 0 ? "0" : nf0.format(v);
          }
        }
      },
      series: sers,
    };
  }, [series, valueKeys, unit]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight capitalize">Supply • {key}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0"><CardTitle className="text-base">Trend</CardTitle></CardHeader>
        <CardContent>
          {/* Remove the dynamic key to avoid recreating the instance */}
          <EChart height={340} renderer="svg" option={option} />
        </CardContent>
      </Card>

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
                {(loading ? [] : (breakdown || [])).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-2">{r.name}</td>
                    <td className="py-2 pr-2 text-right">£{r.value.toLocaleString()}</td>
                    <td className="py-2 text-right">{(r.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {!loading && (!breakdown || breakdown.length === 0) && (
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

export default SupplyKpiDrilldown;
