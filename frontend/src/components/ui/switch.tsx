import * as React from "react";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    const [internal, setInternal] = React.useState(!!checked);

    React.useEffect(() => setInternal(!!checked), [checked]);

    const toggle = () => {
      if (disabled) return;
      const next = !internal;
      setInternal(next);
      onCheckedChange?.(next);
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={internal}
        ref={ref}
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          internal ? "bg-primary" : "bg-muted",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 translate-x-0.5 transform rounded-full bg-background shadow transition",
            internal && "translate-x-[1.125rem]"
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";
