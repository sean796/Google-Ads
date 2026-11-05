import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DETAILS_DRAWER_SHELL } from "@/components/integrations/wordpress/bulk-details-drawer-styles";

export type DetailsDrawerProps = {
  /** Matches the id published by `DetailsDockPortal`. */
  id: string;
  className?: string;
  children: ReactNode;
};

/** Details content column inside the right sidebar Details tab. Holds progress logs and batch status only. */
export function DetailsDrawer({ id, className, children }: DetailsDrawerProps) {
  return (
    <div id={id} className={cn(DETAILS_DRAWER_SHELL, "flex min-h-0 w-full flex-col", className)}>
      {children}
    </div>
  );
}