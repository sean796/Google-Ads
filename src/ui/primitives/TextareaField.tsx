import * as React from "react";
import { cn } from "@/lib/utils";
import { UI_TEXTAREA } from "@/ui/tokens";

export type TextareaFieldProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className" | "style" | "placeholder"
> & {
  /** The label. Shown inside the well; there is no stacked label. */
  placeholder: string;
  /** Visible lines. Fixed so the box never resizes. */
  rows?: number;
};

/** Flat multi-line well with the label as its placeholder. */
export const TextareaField = React.forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField({ placeholder, rows = 4, "aria-label": ariaLabel, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(UI_TEXTAREA)}
        {...rest}
      />
    );
  },
);
