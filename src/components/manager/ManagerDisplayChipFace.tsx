import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  MANAGER_DISPLAY_NAME_BAND,
  MANAGER_DISPLAY_NAME_BAND_WARMING,
  MANAGER_DISPLAY_NAME_CHEVRON_SLOT,
  MANAGER_DISPLAY_NAME_LABEL,
  MANAGER_DISPLAY_SQUARE_BASE,
  MANAGER_DISPLAY_SQUARE_POWER,
  MANAGER_DISPLAY_SQUARE_POWER_WARMING,
} from "@/components/manager/manager-header-chip-styles";
import { cn } from "@/lib/utils";

export type ManagerDisplayChipFaceProps = {
  icon?: LucideIcon | null;
  label: string;
  isWarming?: boolean;
  squareClassName?: string;
  warmingSquareClassName?: string;
  nameBandClassName?: string;
};

export function ManagerDisplayChipFace({
  icon: Icon,
  label,
  isWarming = false,
  squareClassName = MANAGER_DISPLAY_SQUARE_POWER,
  warmingSquareClassName = MANAGER_DISPLAY_SQUARE_POWER_WARMING,
  nameBandClassName,
}: ManagerDisplayChipFaceProps) {
  return (
    <span className="flex h-9 w-full min-w-0 shrink-0 items-stretch overflow-visible">
      {Icon ? (
        <span
          className={cn(
            MANAGER_DISPLAY_SQUARE_BASE,
            isWarming ? warmingSquareClassName : squareClassName,
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4 shrink-0 text-black" />
        </span>
      ) : null}
      <span
        className={cn(
          MANAGER_DISPLAY_NAME_BAND,
          "min-w-0 flex-1",
          !Icon && "rounded-none",
          isWarming && MANAGER_DISPLAY_NAME_BAND_WARMING,
          nameBandClassName,
        )}
      >
        <span className={MANAGER_DISPLAY_NAME_LABEL}>{label}</span>
        <span className={MANAGER_DISPLAY_NAME_CHEVRON_SLOT} aria-hidden>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </span>
      </span>
    </span>
  );
}
