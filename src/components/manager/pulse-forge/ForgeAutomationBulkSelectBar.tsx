import React from "react";
import { Trash2 } from "lucide-react";

import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  getPropertyListRowBlackIconButtonClass,
  getPropertyListRowIconButtonHoverGlowClass,
} from "@/components/integrations/wordpress/cyberpunk-theme";
import { cn } from "@/lib/utils";
import { Button, Checkbox } from "@/ui";

const CHECKBOX_CLASS =
  "border-white/50 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black data-[state=indeterminate]:border-white data-[state=indeterminate]:bg-white data-[state=indeterminate]:text-black pointer-events-none";

export type ForgeAutomationBulkSelectBarProps = {
  selectedCount: number;
  allFilteredSelected: boolean;
  someSelected: boolean;
  disabled?: boolean;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  className?: string;
};

export function ForgeAutomationBulkSelectBar({
  selectedCount,
  allFilteredSelected,
  someSelected,
  disabled = false,
  onSelectAllFiltered,
  onClearSelection,
  onDeleteSelected,
  className,
}: ForgeAutomationBulkSelectBarProps): React.ReactElement {
  const masterChecked = allFilteredSelected ? true : someSelected ? "indeterminate" : false;

  return (
    <div className={cn("flex shrink-0 items-center gap-3", className)}>
      <Button
        disabled={disabled}
        aria-label="Select all filtered automations"
        onClick={() => {
          if (allFilteredSelected) onClearSelection();
          else onSelectAllFiltered();
        }}
      >
        <Checkbox
          checked={masterChecked}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden
          className={CHECKBOX_CLASS}
        />
        Select all
      </Button>
      <Button
        disabled={disabled || selectedCount === 0}
        onClick={onClearSelection}
      >
        Clear
      </Button>
      <Button
        size="icon" icon={Trash2}
        variant="quiet"
        disabled={disabled || selectedCount === 0}
        onClick={onDeleteSelected}
        aria-label={`Delete ${selectedCount} selected automation${selectedCount === 1 ? "" : "s"}`}
      ></Button>
    </div>
  );
}
