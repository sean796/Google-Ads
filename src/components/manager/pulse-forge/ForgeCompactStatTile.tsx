import React from "react";
import { cn } from "@/lib/utils";

export const FORGE_COMPACT_STAT_TILE_CLASS =
  "inline-flex h-9 shrink-0 items-center rounded-none border-0 bg-black px-3 text-base text-white";

export type ForgeCompactStatTileProps = {
  children: React.ReactNode;
  /** Primary fill for live status (e.g. running count). */
  active?: boolean;
  className?: string;
};

export function ForgeCompactStatTile({
  children,
  active = false,
  className,
}: ForgeCompactStatTileProps): React.ReactElement {
  return (
    <span
      className={cn(FORGE_COMPACT_STAT_TILE_CLASS, active && "bg-primary text-black", className)}
    >
      {children}
    </span>
  );
}
