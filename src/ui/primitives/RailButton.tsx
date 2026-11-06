import * as React from "react";
import { cn } from "@/lib/utils";
import { UI_RAIL_BUTTON, UI_RAIL_BUTTON_SELECTED } from "@/ui/tokens";

type RailButtonIcon = React.ComponentType<{ className?: string }>;

export type RailButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> & {
  icon: RailButtonIcon;
  label: string;
  selected?: boolean;
};

/** Green sidebar rail launcher: icon above label, same box in every state. */
export const RailButton = React.forwardRef<HTMLButtonElement, RailButtonProps>(function RailButton(
  { icon: Icon, label, selected, type = "button", ...rest },
  ref,
) {
  return (
    <button {...rest} ref={ref} type={type} aria-pressed={selected} className={cn(UI_RAIL_BUTTON, selected && UI_RAIL_BUTTON_SELECTED)}>
      <Icon className="h-7 w-7 shrink-0" aria-hidden />
      <span className="whitespace-nowrap leading-none">{label}</span>
    </button>
  );
});
