import React, { useMemo, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { CheckField, RowButton, Popover, PopoverContent, PopoverTrigger } from "@/ui";

import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { WorkflowInspectorGroup } from "@/components/manager/workflow/WorkflowInspectorLayout";
import { workflowClientScope } from "@/lib/workflow/workflow-client-config";
import type { WorkflowClientConfig } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";

export type WorkflowClientInspectorFieldsProps = {
  config: WorkflowClientConfig;
  sites: WordPressSiteOption[];
  onChange: (config: WorkflowClientConfig) => void;
  /** Lifted open state so select/deselect re-renders cannot reset the menu. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WorkflowClientInspectorFields({
  config,
  sites,
  onChange,
  open,
  onOpenChange,
}: WorkflowClientInspectorFieldsProps): React.ReactElement {
  const ignoreCloseRef = useRef(false);
  const legacyAll = workflowClientScope(config) === "all";
  const siteIds = useMemo(() => config.siteIds ?? [], [config.siteIds]);
  const allSiteIds = useMemo(() => sites.map((site) => site.id), [sites]);

  const selectedIds = useMemo(() => {
    if (legacyAll) return allSiteIds;
    return siteIds;
  }, [allSiteIds, legacyAll, siteIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = sites.length > 0 && sites.every((site) => selectedSet.has(site.id));
  const someSelected = sites.some((site) => selectedSet.has(site.id));
  const masterChecked = allSelected ? true : someSelected ? "indeterminate" : false;

  const triggerLabel = useMemo(() => {
    if (allSelected) return "All clients";
    if (selectedIds.length === 0) return "Clients";
    return selectedIds
      .map((id) => sites.find((site) => site.id === id)?.name ?? id)
      .join(", ");
  }, [allSelected, selectedIds, sites]);

  const withMenuLocked = (action: () => void) => {
    ignoreCloseRef.current = true;
    action();
    onOpenChange(true);
    window.setTimeout(() => {
      ignoreCloseRef.current = false;
    }, 0);
  };

  const setAll = (checked: boolean) => {
    withMenuLocked(() => {
      onChange({
        ...config,
        clientScope: "selected",
        siteIds: checked ? allSiteIds : [],
      });
    });
  };

  const toggleSite = (siteId: string) => {
    withMenuLocked(() => {
      const current = legacyAll ? allSiteIds : siteIds;
      const next = current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId];
      onChange({ ...config, clientScope: "selected", siteIds: next });
    });
  };

  return (
    <WorkflowInspectorGroup title="Clients">
      <Popover
        open={open}
        modal={false}
        onOpenChange={(next) => {
          if (!next && ignoreCloseRef.current) {
            onOpenChange(true);
            return;
          }
          onOpenChange(next);
        }}
      >
        <PopoverTrigger asChild>
          <RowButton
            selected={!(triggerLabel === "Clients")}
            type="button"
            aria-label="Clients"
            aria-expanded={open}
          >
            <span className="min-w-0 flex-1 whitespace-nowrap">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </RowButton>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (ignoreCloseRef.current) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (ignoreCloseRef.current) event.preventDefault();
          }}
          className="w-[var(--radix-popover-trigger-width)] rounded-none border-0 bg-black p-1 text-foreground shadow-lg"
        >
          <div
            className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
            onPointerDown={() => {
              ignoreCloseRef.current = true;
            }}
            onPointerUp={() => {
              window.setTimeout(() => {
                ignoreCloseRef.current = false;
              }, 0);
            }}
          >
            <div className="px-2 py-1.5" onPointerDown={(event) => event.preventDefault()}>
              <CheckField label="All clients" checked={masterChecked} onCheckedChange={setAll} />
            </div>
            {sites.map((site) => {
              const checked = selectedSet.has(site.id);
              return (
                <div key={site.id} className="px-2 py-1.5" onPointerDown={(event) => event.preventDefault()}>
                  <CheckField label={site.name} checked={checked} onCheckedChange={() => toggleSite(site.id)} />
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </WorkflowInspectorGroup>
  );
}
