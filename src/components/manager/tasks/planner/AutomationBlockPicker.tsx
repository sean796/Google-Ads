import React from "react";
import { cn } from "@/lib/utils";
import { TaskFormInlineRow } from "@/components/manager/tasks/TaskFormLayout";
import type { AutomationBlockCatalogItem } from "@/lib/automation-blocks-api";
import { Button } from "@/ui";

export type AutomationBlockPickerProps = {
  label?: string;
  blocks: AutomationBlockCatalogItem[];
  selectedKeyword: string;
  disabled?: boolean;
  filterKind?: string;
  onSelect: (keyword: string) => void;
};

export function AutomationBlockPicker({
  label,
  blocks,
  selectedKeyword,
  disabled = false,
  filterKind,
  onSelect,
}: AutomationBlockPickerProps): React.ReactElement {
  const filtered = filterKind
    ? blocks.filter((b) => (b.kind ?? "") === filterKind || b.keyword.startsWith(filterKind))
    : blocks;

  const grid = (
    <div className="grid grid-cols-2 gap-1 lg:grid-cols-3 xl:grid-cols-4">
      {filtered.map((block) => {
        const selected = block.keyword === selectedKeyword;
        return (
          <Button
            pressed={Boolean(selected)}
            key={block.keyword}
            disabled={disabled}
            onClick={() => onSelect(block.keyword)}
          >
            {block.name}
          </Button>
        );
      })}
    </div>
  );

  if (!label) return grid;

  return <TaskFormInlineRow label={label}>{grid}</TaskFormInlineRow>;
}
