import React from "react";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { cn } from "@/lib/utils";
import { SelectField } from "@/ui";

export type WorkflowListFiltersProps = {
  sites: WordPressSiteOption[];
  clientId: string;
  onClientChange: (clientId: string) => void;
  className?: string;
};

export function WorkflowListFilters({
  sites,
  clientId,
  onClientChange,
  className,
}: WorkflowListFiltersProps): React.ReactElement {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2 px-4 pt-4 pb-2", className)}>
      <SelectField
        placeholder="Client"
        value={clientId || "__all__"}
        onValueChange={(v) => onClientChange(v === "__all__" ? "" : v)}
        options={[{ value: "__all__", label: "All clients" }, ...sites.map((site) => ({ value: site.id, label: site.name }))]}
      />
    </div>
  );
}
