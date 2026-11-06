import { Circle, Pause, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { googleAdsEntityStatusKey } from "@/components/ppc/google/google-ads-entity-status";

type GoogleAdsEntityStatusIconProps = {
  status?: string;
  className?: string;
};

export function GoogleAdsEntityStatusIcon({ status, className }: GoogleAdsEntityStatusIconProps) {
  const kind = googleAdsEntityStatusKey(status);

  if (kind === "enabled") {
    return (
      <Circle
        className={cn("h-3.5 w-3.5 shrink-0 fill-primary text-primary", className)}
        aria-label="Enabled"
      />
    );
  }
  if (kind === "paused") {
    return (
      <Pause className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} aria-label="Paused" />
    );
  }
  if (kind === "removed") {
    return <X className={cn("h-3.5 w-3.5 shrink-0 text-destructive", className)} aria-label="Removed" />;
  }
  return <span className={cn("inline-block h-3.5 w-3.5 shrink-0", className)} aria-hidden />;
}
