import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export const PPC_ROW_END_RAIL_ICON_SLOT = "inline-flex h-8 w-8 shrink-0 items-center justify-center";

export const PPC_ROW_END_RAIL_CLASS = cn(
  "flex w-full flex-nowrap items-center justify-end gap-1 sm:gap-2",
);

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
