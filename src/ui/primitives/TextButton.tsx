import * as React from "react";
import { cn } from "@/lib/utils";
import { UI_TEXT_BUTTON, UI_TEXT_BUTTON_MUTED, UI_TEXT_BUTTON_PLAIN } from "@/ui/tokens";

type TextButtonIcon = React.ComponentType<{ className?: string }>;

export type TextButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  tone?: "link" | "muted" | "plain";
  icon?: TextButtonIcon;
};

const TONE = { link: UI_TEXT_BUTTON, muted: UI_TEXT_BUTTON_MUTED, plain: UI_TEXT_BUTTON_PLAIN } as const;

/** Inline text action inside copy. */
export const TextButton = React.forwardRef<HTMLButtonElement, TextButtonProps>(function TextButton(
  { tone = "link", icon: Icon, type = "button", children, ...rest },
  ref,
) {
  return (
    <button {...rest} ref={ref} type={type} className={cn(TONE[tone])}>
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {children}
    </button>
  );
});
