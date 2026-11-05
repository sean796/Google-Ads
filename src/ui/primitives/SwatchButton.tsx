import * as React from "react";
import { cn } from "@/lib/utils";
import { UI_SWATCH_BUTTON, UI_SWATCH_BUTTON_SELECTED } from "@/ui/tokens";

export type SwatchButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  /** Data-driven colors (theme, tag, series). */
  swatch?: React.CSSProperties;
  selected?: boolean;
};

/** Color tile for data-driven colors. */
export const SwatchButton = React.forwardRef<HTMLButtonElement, SwatchButtonProps>(function SwatchButton(
  { swatch, selected, type = "button", children, ...rest },
  ref,
) {
  return (
    <button {...rest} ref={ref} type={type} aria-pressed={selected} style={swatch} className={cn(UI_SWATCH_BUTTON, selected && UI_SWATCH_BUTTON_SELECTED)}>
      {children}
    </button>
  );
});
