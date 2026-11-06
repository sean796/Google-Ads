import * as React from "react";

import { cn } from "@/lib/utils";

export type FloatingLabelInputProps = React.ComponentProps<"input"> & {
  label: string;
  /** Applied to the label row (e.g. `pl-10` when input has leading icon padding). */
  labelClassName?: string;
};

/**
 * Historical name "FloatingLabelInput"; layout is stacked label + control (no overlay)
 * so passwords, selects-adjacent rows, and all dashboard tabs stay readable everywhere.
 */
const FloatingLabelInput = React.forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ className, label, labelClassName, id, placeholder, type = "text", ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex w-full flex-col gap-1">
        <label htmlFor={inputId} className={cn("text-base font-semibold leading-snug text-foreground", labelClassName)}>
          {label}
        </label>
        <input
          type={type}
          ref={ref}
          id={inputId}
          placeholder={placeholder}
          className={cn(
            "flex h-12 w-full rounded-md border-0 bg-input px-3 py-2 text-base text-foreground ring-offset-background",
            "file:border-0 file:bg-transparent file:text-base file:font-medium file:text-foreground",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
FloatingLabelInput.displayName = "FloatingLabelInput";

export { FloatingLabelInput };
