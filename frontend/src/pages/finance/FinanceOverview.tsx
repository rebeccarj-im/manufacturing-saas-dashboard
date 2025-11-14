import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Download, Info } from "lucide-react";
import EChart from "@/components/chart/echart";
import { apiGet } from "@/lib/fetcher";
import type * as echarts from "echarts";
import { loadTimeframe, saveTimeframe, type ApiRange, type Granularity } from "@/lib/timeframe";

type ExecKpiKey = "revenue"|"gm"|"backlog"|"arr"|"payback"|"book_to_bill"|"coverage_months";
type ExecKpi = { key: ExecKpiKey; label: string; value: number; unit?: string | null; delta?: number | null; direction?: "up"|"down"|"flat" | null; };
type RevenuePoint = { period: string; recognized: number; booked?: number; backlog?: number };
type OverviewResp = { timeframe: { range: ApiRange; start_date: string; end_date: string; granularity: Granularity }; kpis: ExecKpi[]; revenueTrend: RevenuePoint[]; };

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");
const toPercent = (n?: number, digits = 1) => (typeof n === "number" ? `${(Math.abs(n) <= 2 ? n * 100 : n).toFixed(digits)}%` : "—");

const TOOLTIP: Partial<Record<ExecKpiKey, string>> = {
  revenue:"Recognized revenue in the selected window.",
  backlog:"Undelivered orders at period end; quarter view uses the quarter-end value.",
  gm:"Gross margin (ratio 0–1): Σ profit / Σ revenue.",
  arr:"Annual Recurring Revenue: end-month MRR × 12.",
  book_to_bill:"Σ(booked) / Σ(recognized) over the selected window.",
  coverage_months:"Ending backlog ÷ average recognized revenue of the last 6 months (fixed denominator).",
  payback:"CAC payback period in months (MVP static).",
};

const KpiCard: React.FC<{ kpi?: ExecKpi; onClick?: () => void }> = ({ kpi, onClick }) => {
  const val = kpi?.value ?? 0;
  const unit = kpi?.unit ?? (["revenue","arr","backlog"].includes(kpi?.key ?? "") ? "£" : undefined);
  const text =
    kpi?.key==="gm" ? toPercent(val, 1)
    : kpi?.key==="book_to_bill" ? (typeof val === "number" ? val.toFixed(2) : "—")
    : kpi?.key==="coverage_months" ? nf1.format(val)
    : kpi?.key==="payback" ? `${nf1.format(val)} ${kpi?.unit || "mo"}`
    : `${unit ?? "£"}${val.toLocaleString()}`;
  const deltaPct = typeof kpi?.delta === "number" ? kpi.delta * 100 : null;
  const deltaColor = typeof deltaPct === "number" ? (deltaPct >= 0 ? "text-emerald-600" : "text-rose-600") : "text-muted-foreground";
  const deltaSign = typeof deltaPct === "number" ? (deltaPct > 0 ? "+" : "") : "";
  return (
    <Card className={cx("min-h-[110px] cursor-pointer transition", onClick && "hover:shadow-md")} onClick={onClick}>
      <CardHeader className="py-2 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {kpi?.label || "—"}
          {!!kpi?.key && TOOLTIP[kpi.key] && (
            <span className="group relative cursor-default">
              <Info className="w-3.5 h-3.5" />
              <span className="pointer-events-none absolute -left-2 top-5 z-10 hidden w-56 rounded-md border bg-background p-2 text-xs shadow group-hover:block">{TOOLTIP[kpi.key]}</span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="text-xl font-semibold tracking-tight">{text}</div>
        {typeof deltaPct === "number" && (
          <div className={cx("mt-0.5 text-[11px] leading-4", deltaColor)}>
            {deltaSign}{deltaPct.toFixed(1)}%<span className="text-muted-foreground"> vs prev.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const FinanceOverview: React.FC = () => {
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
    setSp((prev)=>{ prev.set("range",range); prev.set("granularity",granularity); return prev; }, { replace:true });
    saveTimeframe(range, granularity);
  }, [range, granularity, setSp]);

  const load = async () => {
    setLoading(true); setErr(null);
    try { setData(await apiGet<OverviewResp>(`/api/finance/overview?range=${range}&granularity=${granularity}`)); }
    catch (e:any) { setErr(e?.message || "Failed to load finance overview"); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(); },[range,granularity]);
  useEffect(()=>{ if (!autoRefresh) return; const t=setInterval(load,60_000); return ()=>clearInterval(t); },[autoRefresh,range,granularity]);

  const trendOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = data?.revenueTrend ?? [];
    return {
      grid:{left:56,right:16,top:24,bottom:32,containLabel:true},
      tooltip:{trigger:"axis"},
      legend:{top:0},
      xAxis:{type:"category", boundaryGap:false, data:pts.map(p=>p.period), axisLabel:{hideOverlap:true}},
      yAxis:{type:"value", axisLabel:{formatter:(v:number)=>(v===0?"0":nf0.format(v))}},
      series:[
        {name:"Recognized", type:"line", smooth:true, showSymbol:false, areaStyle:{}, data:pts.map(p=>p.recognized??0)},
        {name:"Booked",     type:"line", smooth:true, showSymbol:false, data:pts.map(p=>p.booked??0)},
        {name:"Backlog",    type:"line", smooth:true, showSymbol:false, data:pts.map(p=>p.backlog??0)},
      ],
    };
  },[data]);

  const onExportCsv = () => {
    const pts = data?.revenueTrend ?? [];
    const rows: string[][] = [["period","recognized","booked","backlog"], ...pts.map(p=>[p.period,String(p.recognized??0),String(p.booked??0),String(p.backlog??0)])];
    const csv = rows.map(r=>r.map(s=>/(,|\n|")/.test(s)?`"${s.replace(/"/g,'""')}"`:s).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    const a=document.createElement("a"); a.href=url; a.download=`finance_overview_${range}_${granularity}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const kpiOrder: ExecKpiKey[] = ["revenue","gm","backlog","arr","payback","book_to_bill","coverage_months"];
  const kpiMap = new Map((data?.kpis ?? []).map(k=>[k.key, k as ExecKpi]));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_auto] gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight col-start-1 row-start-1">Finance</h1>
        <div className="col-start-2 row-start-1 justify-self-end flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={onExportCsv}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground">Auto refresh (60s)</Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </div>
        <div className="col-start-1 row-start-2 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border p-1">
            {(["6m","12m"] as ApiRange[]).map(r=>(
              <button key={r} onClick={()=>setRange(r)} className={cx("rounded-lg px-3 py-1 text-sm transition", range===r?"bg-primary text-primary-foreground":"hover:bg-muted")}>{r.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border p-1">
            {(["month","quarter"] as Granularity[]).map(g=>(
              <button key={g} onClick={()=>setGranularity(g)} className={cx("rounded-lg px-3 py-1 text-sm capitalize transition", granularity===g?"bg-primary text-primary-foreground":"hover:bg-muted")}>{g}</button>
            ))}
          </div>
        </div>
        <div className="col-start-2 row-start-2 justify-self-end text-xs text-muted-foreground">
          Window: {data?.timeframe?.start_date ?? "—"} → {data?.timeframe?.end_date ?? "—"}
        </div>
      </div>

      {!!err && <Card className="border-rose-300 bg-rose-50/50 dark:bg-rose-950/10"><CardContent className="p-4 text-rose-600 text-sm">{err}</CardContent></Card>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
        {kpiOrder.map(k=>(
          <KpiCard key={k} kpi={kpiMap.get(k)} onClick={()=>navigate(`/finance/kpis/${k}?range=${range}&granularity=${granularity}`)} />
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-0"><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
        <CardContent>
          <EChart
            key={`fin-${range}-${granularity}`} // Stable key: does not change with the data timestamp.
            height={320}
            renderer="svg"
            option={trendOption}
          />
        </CardContent>
      </Card>
    </div>
  );
};
export default FinanceOverview;
