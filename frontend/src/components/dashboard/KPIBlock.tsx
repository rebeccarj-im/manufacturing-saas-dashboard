import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type Props = {
  label: string;
  value?: number;
  unit?: string;           // Currency symbol: £ / $ etc.
  delta?: number;          // Fraction: 0.082 => +8.2%
  onClick?: () => void;    // Navigate on click
  tooltip?: string;        // Short description; falls back to native title
  formatter?: (value?: number, unit?: string) => string; // Custom display formatter
  compact?: boolean;       // Compact mode
};

const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

const KPIBlock: React.FC<Props> = ({
  label,
  value,
  unit,
  delta,
  onClick,
  tooltip,
  formatter,
  compact = false,
}) => {
  const isNum = typeof value === "number";
  const display = formatter
    ? formatter(value, unit)
    : isNum
      ? (unit ? `${unit}` : "") + (value ?? 0).toLocaleString()
      : "—";

  const pct = typeof delta === "number" ? delta * 100 : null;
  const deltaColor =
    typeof pct === "number" ? (pct >= 0 ? "text-emerald-600" : "text-rose-600") : "text-muted-foreground";
  const deltaSign = typeof pct === "number" && pct > 0 ? "+" : "";

  return (
    <Card
      className={`transition ${onClick ? "cursor-pointer hover:shadow-md" : ""} ${compact ? "min-h-[96px]" : "min-h-[110px]"}`}
      onClick={onClick}
    >
      <CardHeader className={`py-2 ${compact ? "pb-0" : "pb-1"}`}>
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {label}
          {tooltip && (
            <span className="group relative cursor-default" title={tooltip}>
              <Info className="w-3.5 h-3.5" />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={`${compact ? "pt-1 pb-3" : "pt-0 pb-3"}`}>
        <div className={`${compact ? "text-lg" : "text-xl"} font-semibold tracking-tight`}>{display}</div>
        {typeof pct === "number" && (
          <div className={`mt-0.5 text-[11px] leading-4 ${deltaColor}`}>
            {deltaSign}{nf1.format(pct)}%
            <span className="text-muted-foreground"> vs prev.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default KPIBlock;
