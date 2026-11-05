import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  UI_BTN_DANGER,
  UI_BTN_QUIET,
  UI_BTN_ICON_DANGER,
  UI_BTN_ICON_QUIET,
  UI_BTN_PRESSED,
  UI_BTN_ICON_RUN,
  UI_BTN_ICON_TOOL,
  UI_BTN_RUN,
  UI_BTN_TOOL,
  UI_BTN_UPLOAD_READY,
  UI_SLOT_RESERVE,
} from "@/ui/tokens";

type ButtonIcon = React.ComponentType<{ className?: string }>;

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-normal",
  {
    variants: {
      variant: { tool: "", run: "", danger: "", ready: "", quiet: "" },
      size: { text: "", icon: "" },
    },
    compoundVariants: [
      { variant: "tool", size: "text", class: UI_BTN_TOOL },
      { variant: "tool", size: "icon", class: UI_BTN_ICON_TOOL },
      { variant: "run", size: "text", class: UI_BTN_RUN },
      { variant: "run", size: "icon", class: UI_BTN_ICON_RUN },
      { variant: "danger", size: "text", class: UI_BTN_DANGER },
      { variant: "danger", size: "icon", class: UI_BTN_ICON_DANGER },
      { variant: "quiet", size: "text", class: UI_BTN_QUIET },
      { variant: "quiet", size: "icon", class: UI_BTN_ICON_QUIET },
      { variant: "ready", size: "text", class: UI_BTN_UPLOAD_READY },
    ],
    defaultVariants: { variant: "tool", size: "text" },
  },
);

type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  icon?: ButtonIcon;
  /** Keep the box but hide and disable the control (zero CLS for conditional buttons). */
  reserved?: boolean;
  /** Toggle state (filters, tabs). Same box pressed or not. */
  pressed?: boolean;
};

export type ButtonProps =
  | (ButtonBaseProps & {
      size?: "text";
      /** `ready` is a run-colored control that may wrap a long file label (uploaded state). */
      variant?: "tool" | "run" | "danger" | "ready" | "quiet";
    })
  | (ButtonBaseProps & {
      size: "icon";
      variant?: "tool" | "run" | "danger" | "quiet";
      icon: ButtonIcon;
      "aria-label": string;
    });

/** Toolbar button: tool (grey well), run (primary), danger (destructive), quiet. Text or icon-only. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon: Icon, reserved = false, pressed, type = "button", children, disabled, tabIndex, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled || reserved}
      aria-hidden={reserved || undefined}
      aria-pressed={pressed}
      tabIndex={reserved ? -1 : tabIndex}
      className={cn(buttonVariants({ variant, size }), pressed && UI_BTN_PRESSED, reserved && UI_SLOT_RESERVE)}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {children}
    </button>
  );
});