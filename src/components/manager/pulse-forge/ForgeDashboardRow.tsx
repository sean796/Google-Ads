import React from "react";
import { cn } from "@/lib/utils";
import { forgeTableRowStripeClass } from "@/components/manager/pulse-forge/forge-dashboard-styles";

export type ForgeDashboardRowProps = {
  rank: number;
  stripeIndex: number;
  title?: string;
  meta?: string;
  value?: string;
  active?: boolean;
  placeholder?: boolean;
  action?: React.ReactNode;
  onClick?: () => void;
};

export function ForgeDashboardRow({
  rank,
  stripeIndex,
  title,
  meta,
  value,
  active = false,
  placeholder = false,
  action,
  onClick,
}: ForgeDashboardRowProps): React.ReactElement {
  const interactive = !placeholder && Boolean(onClick);

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        forgeTableRowStripeClass(stripeIndex, { active }),
        "grid w-full min-w-0 grid-cols-[2rem_0.5rem_minmax(0,1fr)_4.5rem_5.5rem_4rem] items-center gap-2 px-2 sm:grid-cols-[2rem_0.5rem_minmax(0,1fr)_5rem_6rem_4.5rem] sm:px-3",
        interactive && "cursor-pointer",
      )}
    >
      <span className="text-base tabular-nums text-muted-foreground">{rank}</span>
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          placeholder ? "bg-ui-field-hover" : active ? "bg-primary" : "bg-ui-field-hover",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 break-words text-base font-medium",
          placeholder ? "text-muted-foreground" : "text-white",
        )}
      >
        {placeholder ? "—" : title}
      </span>
      <span className="min-w-0 break-words text-right text-base text-muted-foreground">
        {placeholder ? "—" : meta}
      </span>
      <span className="min-w-0 break-words text-right text-base text-white">
        {placeholder ? "—" : value}
      </span>
      <div className="flex justify-end">{placeholder ? null : action}</div>
    </div>
  );
}
