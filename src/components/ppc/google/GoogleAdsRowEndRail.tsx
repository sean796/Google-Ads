import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

import {
  PPC_ROW_END_RAIL_CLASS,
  PPC_ROW_END_RAIL_ICON_SLOT,
} from "@/components/ppc/google/google-ads-row-constants";

export type GoogleAdsRowEndRailProps = {
  leading?: ReactNode;
  generate?: ReactNode;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteLabel?: string;
  chevron?: ReactNode;
};

function IconSlot({ children }: { children?: ReactNode }) {
  return <span className={PPC_ROW_END_RAIL_ICON_SLOT}>{children}</span>;
}

export function GoogleAdsRowEndRail({
  leading,
  generate,
  onDelete,
  deleteDisabled = false,
  deleteLabel,
  chevron,
}: GoogleAdsRowEndRailProps) {
  return (
    <div className={PPC_ROW_END_RAIL_CLASS}>
      <IconSlot>{leading}</IconSlot>
      <IconSlot>{generate}</IconSlot>
      <IconSlot>
        {onDelete ? (
          <Button
            size="icon" icon={Trash2}
            variant="quiet"
            aria-label={deleteLabel ?? "Delete"}
            disabled={deleteDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          ></Button>
        ) : null}
      </IconSlot>
      <IconSlot>{chevron}</IconSlot>
    </div>
  );
}
