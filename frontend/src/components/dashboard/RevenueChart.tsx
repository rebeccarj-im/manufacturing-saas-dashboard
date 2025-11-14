import React, { useMemo } from "react";
import EChart from "@/components/chart/echart";
import type * as echarts from "echarts";

export type RevenuePoint = { date: string; recognized: number; booked?: number; backlog?: number };

type Props = {
  data: RevenuePoint[];
  height?: number;
};

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const RevenueChart: React.FC<Props> = ({ data, height = 320 }) => {
  const option = useMemo<echarts.EChartsOption>(() => {
    return {
      grid: { left: 56, right: 16, top: 24, bottom: 32, containLabel: true },
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", boundaryGap: false, data: data.map(d => d.date), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => (v === 0 ? "0" : nf0.format(v)) } },
      series: [
        {
          name: "Recognized",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.15 },  
          data: data.map(d => d.recognized ?? 0),
        },
        {
          name: "Booked",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          data: data.map(d => d.booked ?? 0),
        },
        {
          name: "Backlog",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          data: data.map(d => d.backlog ?? 0),
        },
      ],
    };
  }, [data]);

  return <EChart height={height} renderer="svg" option={option} />;
};

export default RevenueChart;
