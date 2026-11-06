import { cva } from "class-variance-authority";

/** `neoPulseBlack`: neon-flat black well + primary focus ring (global design system). */
export const inputVariants = cva(
  "flex w-full rounded-md border-0 bg-input px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "h-10",
        neoPulseBlack:
          "h-10 border-0 bg-black text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/55 focus-visible:ring-offset-0 focus-visible:ring-offset-background",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
