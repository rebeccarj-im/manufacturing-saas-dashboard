import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";
import { apiGet } from "@/lib/fetcher";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

type Dim = "page" | "source" | "bucket";
type KpiKey = "visits" | "leads" | "mql" | "sql" | "nps" | "csat" | "conversion";

type DrillResp = {
  timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity };
  metric: KpiKey;
  series: Array<Record<string, number | string>>;
  breakdown: Array<{ name: string; count?: number; value?: number; share?: number }>;
  unit?: string | null;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const toPercent = (n?: number, digits = 1) =>
  (typeof n === "number" ? `${(Math.abs(n) <= 2 ? n * 100 : n).toFixed(digits)}%` : "—");
const ensureArray = <T,>(x: T | T[] | null | undefined): T[] => (Array.isArray(x) ? x : x ? [x as T] : []);

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

const MarketingKpiDrilldown: React.FC = () => {
  const { key = "visits" } = useParams();
  const [sp, setSp] = useSearchParams();

  const saved = loadTimeframe();
  const [range, setRange] = useState<ApiRange>((sp.get("range") as ApiRange) || saved?.range || "12m");
  const [granularity, setGranularity] = useState<Granularity>(
    (sp.get("granularity") as Granularity) || saved?.granularity || "month"
  );

  // Default dimension: visits -> page; nps/csat -> bucket; others -> source
  const defaultDim: Dim = key === "visits" ? "page" : key === "nps" || key === "csat" ? "bucket" : "source";
  const [dim, setDim] = useState<Dim>((sp.get("by") as Dim) || defaultDim);

  const [unit, setUnit] = useState<string | null>(null);
  const [series, setSeries] = useState<Array<Record<string, number | string>>>([]);
  const [breakdown, setBreakdown] = useState<DrillResp["breakdown"]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // URL & preference sync (aligned with Supply)
  useEffect(() => {
    sp.set("range", range);
    sp.set("granularity", granularity);
    sp.set("by", dim);
    setSp(sp, { replace: true });
    saveTimeframe(range, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity, dim]);

  // When the key changes, update the default dimension (prefer 'by' from URL)
  useEffect(() => {
    const by = (sp.get("by") as Dim) || defaultDim;
    setDim(by);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiGet<DrillResp>(
        `/api/marketing/kpis/${key}?range=${range}&granularity=${granularity}&by=${dim}`
      );
      setUnit(resp.unit ?? null);
      setSeries(resp.series || []);
      setBreakdown(resp.breakdown || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [key, range, granularity, dim]);

  const valueKeys = useMemo(() => {
    const first = series[0] || {};
    return Object.keys(first).filter((k) => k !== "period");
  }, [series]);

  const option = useMemo<echarts.EChartsCoreOption>(() => {
    const x = series.map((s) => String((s as any)["period"]));
    const legend = valueKeys.length ? valueKeys.map((k) => k[0].toUpperCase() + k.slice(1)) : ["Value"];

    // Percentage detection & scaling: if unit='%' or KPI is conversion, and max <= 2,
    // treat values as 0–1 ratios and multiply by 100
    const isPct = unit === "%" || key === "conversion";
    const sampleVals: number[] = (valueKeys.length ? valueKeys : ["value"])
      .flatMap((k) => series.map((s) => parseNumber((s as any)[k])))
      .filter((v) => Number.isFinite(v)) as number[];
    const maxVal = sampleVals.length ? Math.max(...sampleVals) : 0;
    const pctFactor = isPct && maxVal <= 2 ? 100 : 1;
    const showDot = x.length <= 1;

    const sers = valueKeys.length
      ? valueKeys.map((k) => ({
          name: k[0].toUpperCase() + k.slice(1),
          type: "line" as const,
          smooth: true,
          showSymbol: showDot,
          data: series.map((s) => {
            const v = parseNumber((s as any)[k]);
            return Number.isFinite(v) ? v * pctFactor : 0;
          }),
        }))
      : [
          {
            name: "Value",
            type: "line" as const,
            smooth: true,
            showSymbol: showDot,
            data: series.map((s) => {
              const v = parseNumber((s as any).value);
              return Number.isFinite(v) ? v * pctFactor : 0;
            }),
          },
        ];

    return {
      grid: { left: 56, right: 16, top: 24, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: legend },
      xAxis: { type: "category", boundaryGap: false, data: x, axisLabel: { hideOverlap: true } },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => (isPct ? `${v}%` : v === 0 ? "0" : nf0.format(v)) },
      },
      series: sers,
    };
  }, [series, valueKeys, unit, key]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight capitalize">Marketing • {key}</h1>
        <div className="flex items-center gap-2">
          {(["page", "source", "bucket"] as Dim[]).map((d) => (
            <Button
              key={d}
              variant={d === dim ? "default" : "outline"}
              size="sm"
              onClick={() => setDim(d)}
              className="capitalize"
            >
              {d}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Trend {unit ? `(${unit})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart
            key={`${key}-${range}-${granularity}-${dim}`} // Stable key to avoid remounts triggered by loading
            height={340}
            renderer="svg"
            option={option}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Breakdown by {dim}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 pr-2">Name</th>
                  <th className="text-right py-2 pr-2">Count / Value</th>
                  <th className="text-right py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {ensureArray(loading ? [] : breakdown).map((r, i) => {
                  const countOrValue =
                    typeof r.count === "number" ? r.count : typeof r.value === "number" ? r.value : NaN;
                  const share = typeof r.share === "number" ? r.share : NaN;
                  return (
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-2">{r.name}</td>
                      <td className="py-2 pr-2 text-right">
                        {Number.isFinite(countOrValue) ? countOrValue.toLocaleString() : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {Number.isFinite(share) ? toPercent(share, 1) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {!loading && ensureArray(breakdown).length === 0 && (
                  <tr>
                    <td className="py-6 text-center text-muted-foreground" colSpan={3}>
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
  );
};

export default MarketingKpiDrilldown;
