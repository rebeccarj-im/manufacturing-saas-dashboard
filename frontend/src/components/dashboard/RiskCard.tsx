import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

export interface RiskCardProps {
  title: string;
  owner?: string;
  due?: string | Date;
  mitigation?: string;
  status?: string;
  className?: string;
  onClick?: () => void;
}

const cx = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(" ");

const ClampText: React.FC<{ text: string; lines?: number; className?: string }> = ({
  text,
  lines = 2,
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const showMore = (text || "").length > lines * 48;
  return (
    <div className={cx("relative", className)}>
      <div className={cx(open ? "line-clamp-none" : `line-clamp-${lines}`, "break-words")} title={text}>
        {text}
      </div>
      {!open && showMore && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/95 to-transparent rounded-b-md" />
      )}
      {showMore && (
        <button
          type="button"
          className="mt-0.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
};

export default function RiskCard({
  title,
  owner,
  due,
  mitigation,
  status,
  className,
  onClick,
}: RiskCardProps) {
  const dueText = due ? new Date(due).toLocaleDateString() : undefined;

  return (
    <Card className={cx("min-h-[96px] cursor-default", className)} onClick={onClick}>
      <CardContent className="flex h-full items-center p-4 text-sm">
        <div className="min-w-0 w-full leading-relaxed">
          <ClampText text={title} lines={2} className="font-medium" />
          {(owner || dueText || status) && (
            <div className="text-xs text-muted-foreground">
              {owner ? `Owner: ${owner}` : null}
              {owner && (dueText || status) ? " · " : ""}
              {dueText ? `Due: ${dueText}` : null}
              {status ? ` · ${status}` : null}
            </div>
          )}
          {mitigation && <ClampText text={mitigation} lines={2} className="mt-0.5" />}
        </div>
      </CardContent>
    </Card>
  );
}
