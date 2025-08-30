import * as React from "react";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

type Variant = "h1" | "h2" | "h3" | "h4" | "p" | "muted";

export const Typography: React.FC<{
  variant?: Variant;
  className?: string;
  children?: React.ReactNode;
}> = ({ variant = "p", className, children }) => {
  const Tag = (variant === "muted" ? "p" : variant) as any;
  const map: Record<Variant, string> = {
    h1: "text-3xl font-semibold tracking-tight",
    h2: "text-2xl font-semibold tracking-tight",
    h3: "text-xl font-semibold tracking-tight",
    h4: "text-lg font-semibold tracking-tight",
    p: "text-sm",
    muted: "text-sm text-muted-foreground",
  };
  return <Tag className={cn(map[variant], className)}>{children}</Tag>;
};
