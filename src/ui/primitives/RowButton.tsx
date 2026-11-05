import * as React from "react";
import { cn } from "@/lib/utils";
import { UI_ROW_BUTTON, UI_ROW_BUTTON_SELECTED } from "@/ui/tokens";

export type RowButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  selected?: boolean;
};

/** Full-width clickable list row. */
export const RowButton = React.forwardRef<HTMLButtonElement, RowButtonProps>(function RowButton(
  { selected, type = "button", children, ...rest },
  ref,
) {
  return (
    <button {...rest} ref={ref} type={type} aria-pressed={selected} className={cn(UI_ROW_BUTTON, selected && UI_ROW_BUTTON_SELECTED)}>
      {children}
    </button>
  );
});
