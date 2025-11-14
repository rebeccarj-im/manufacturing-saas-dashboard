// src/components/dashboard/AlertCard.tsx
import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export type Level = "info" | "warning" | "critical";

export interface AlertCardProps {
  level: Level;
  message: string;
  timestamp?: string | Date;
  className?: string;
  onClick?: () => void;
}

const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export default function AlertCard({
  level,
  message,
  timestamp,
  className,
  onClick,
}: AlertCardProps) {
  const styles = {
    critical: { border: "border-l-rose-500", icon: "text-rose-600" },
    warning: { border: "border-l-amber-500", icon: "text-amber-600" },
    info: { border: "border-l-blue-500", icon: "text-blue-600" },
  }[level];

  const ts = timestamp ? new Date(timestamp).toLocaleString() : undefined;

  return (
    <Card
      className={cx("border-l-4 h-full cursor-default", styles.border, className)}
      onClick={onClick}
    >
      
      <CardContent className="flex h-full items-start gap-3 px-5 pt-3 pb-5">
        <AlertTriangle className={cx("h-5 w-5 mt-0.5 shrink-0", styles.icon)} />
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <div className="whitespace-pre-line break-words">{message}</div>
          {ts && <div className="text-xs text-muted-foreground mt-1">{ts}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
