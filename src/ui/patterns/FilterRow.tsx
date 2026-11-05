import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { UI_TOOLBAR_END, UI_TOOLBAR_GROUP_DIVIDER, UI_TOOLBAR_ROW } from "@/ui/tokens";

export type FilterRowProps = {
  /** `start` fills from the left (filters). `end` is the right-aligned action cluster. */
  align?: "start" | "end";
  "aria-label"?: string;
  children: ReactNode;
};

/** One toolbar row of related controls with the standard gap. Never wraps. */
export function FilterRow({ align = "start", "aria-label": ariaLabel, children }: FilterRowProps) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(align === "end" ? UI_TOOLBAR_END : UI_TOOLBAR_ROW)}
    >
      {children}
    </div>
  );
}

/** Separates unrelated control groups inside a toolbar. */
export function FilterRowDivider() {
  return <div className={UI_TOOLBAR_GROUP_DIVIDER} aria-hidden />;
}
