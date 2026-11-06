import * as React from "react";

import { cn } from "@/lib/utils";

export type FloatingLabelTextareaProps = React.ComponentProps<"textarea"> & {
  label: string;
  labelClassName?: string;
};

/** Stacked label + textarea — same outward API as historical “floating” field. */
const FloatingLabelTextarea = React.forwardRef<HTMLTextAreaElement, FloatingLabelTextareaProps>(
  ({ className, label, labelClassName, id, placeholder, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex w-full flex-col gap-1">
        <label htmlFor={inputId} className={cn("text-base font-semibold leading-snug text-foreground", labelClassName)}>
          {label}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          placeholder={placeholder}
          className={cn(
            "flex min-h-[100px] w-full rounded-md border-0 bg-input px-3 py-2 text-base text-foreground ring-offset-background",
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
FloatingLabelTextarea.displayName = "FloatingLabelTextarea";

export { FloatingLabelTextarea };
