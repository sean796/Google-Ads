import { cva } from "class-variance-authority";

export const cardVariants = cva("rounded-lg text-card-foreground", {
  variants: {
    variant: {
      default: "border-0 bg-card shadow-tile",
      /** Former neon frame; same surface as default (no lime border). */
      neonFlat: "border-0 bg-card shadow-tile text-card-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
