import React, { useMemo } from "react";

import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { cn } from "@/lib/utils";
import { Button, Checkbox } from "@/ui";

export type TaskBuilderClientSitePickerProps = {
  sites: WordPressSiteOption[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  className?: string;
};

const SITE_CHECKBOX_CLASS =
  "border-white/50 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black data-[state=indeterminate]:border-white data-[state=indeterminate]:bg-white data-[state=indeterminate]:text-black";

export function TaskBuilderClientSitePicker({
  sites,
  selectedIds,
  onChange,
  disabled = false,
  className,
}: TaskBuilderClientSitePickerProps): React.ReactElement {
  const allSelected = sites.length > 0 && sites.every((site) => selectedIds.has(site.id));
  const someSelected = sites.some((site) => selectedIds.has(site.id));
  const masterChecked = allSelected ? true : someSelected ? "indeterminate" : false;

  const toggleSite = (siteId: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(siteId);
    else next.delete(siteId);
    onChange(next);
  };

  const summary = useMemo(() => {
    if (selectedIds.size === 0) return "None selected";
    if (allSelected) return `All ${sites.length} selected`;
    return `${selectedIds.size} selected`;
  }, [allSelected, selectedIds.size, sites.length]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto">
        <div className="flex shrink-0 items-center gap-2 text-base text-white">
          <Checkbox
            checked={masterChecked}
            disabled={disabled || sites.length === 0}
            onCheckedChange={() => {
              if (allSelected) onChange(new Set());
              else onChange(new Set(sites.map((site) => site.id)));
            }}
            aria-label="Select all client sites"
            className={SITE_CHECKBOX_CLASS}
          />
          <span>Select all</span>
        </div>
        <Button
          disabled={disabled || selectedIds.size === 0}
          onClick={() => onChange(new Set())}
        >
          Clear
        </Button>
        <span className="shrink-0 text-base text-white">{summary}</span>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {sites.map((site) => {
          const checked = selectedIds.has(site.id);
          return (
            <label
              key={site.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-none border-0 bg-black p-3 text-base",
                checked ? "text-white" : "text-muted-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => {
                  if (value === "indeterminate") return;
                  toggleSite(site.id, value === true);
                }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                className="border-white/50 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
                aria-label={`Select ${site.name}`}
              />
              <span className="min-w-0 flex-1 break-words">{site.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
