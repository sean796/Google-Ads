import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/vendor/dialog";
import { cn } from "@/lib/utils";
import { UI_DIALOG, UI_DIALOG_BODY } from "@/ui/tokens";

const DIALOG_SIZE = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

export type DialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** One short line under the title. Omit when the title says it all. */
  description?: ReactNode;
  size?: keyof typeof DIALOG_SIZE;
  /** Fields and content. Stacked with the standard gap. */
  children: ReactNode;
  /** Buttons for the single action row (`Button`, `ActionButton`). */
  actions?: ReactNode;
};

/** Flat dialog: title, body, one right-aligned action row. */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  actions,
}: DialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(UI_DIALOG, DIALOG_SIZE[size])}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description ? <DialogDescription className="text-base">{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={UI_DIALOG_BODY}>{children}</div>
        {actions ? <div className="flex items-center justify-end gap-1.5">{actions}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
