import * as React from "react";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { inputVariants } from "./input-variants";

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, ...props }, ref) => {
    return (
      <input
        type={type}
        data-neo-pulse-black={variant === "neoPulseBlack" ? "" : undefined}
        className={cn(inputVariants({ variant }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
