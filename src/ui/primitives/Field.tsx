import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { UI_FIELD } from "@/ui/tokens";

const FIELD_SIZE = {
  /** Fills the remaining row width. */
  grow: "w-full min-w-0 flex-1 px-2",
  /** Fills the row, never narrower than 10rem (keyword, location, title). */
  keyword: "w-full min-w-[10rem] flex-1 px-2",
  /** Website URL: fills up to a readable width, monospace. */
  url: "min-w-0 max-w-md flex-1 px-2 font-mono",
  /** Narrow numeric well for 1 to 3 digits. */
  short: "w-[3.25rem] shrink-0 px-2 text-center font-mono tabular-nums",
  /** Numeric well with room for a spinner. */
  count: "w-[4.5rem] shrink-0 px-2 text-center tabular-nums",
} as const;

export type FieldProps = Omit<InputProps, "className" | "style" | "size" | "variant" | "placeholder"> & {
  /** The label. Shown inside the well; there is no stacked label. */
  placeholder: string;
  size?: keyof typeof FIELD_SIZE;
};

/** Flat grey well with the label as its placeholder. */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(function Field(
  { placeholder, size = "grow", "aria-label": ariaLabel, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className={cn(UI_FIELD, FIELD_SIZE[size])}
      {...rest}
    />
  );
});
