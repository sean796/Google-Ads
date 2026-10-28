import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { PulseForgeBreadcrumbs } from "@/components/manager/pulse-forge/PulseForgeBreadcrumbs";
import { FORGE_RECIPE_PAGE_CLASS } from "@/components/manager/pulse-forge/forge-recipe-styles";
import { WorkflowCard } from "@/components/manager/workflow/WorkflowCard";
import {
  groupWorkflowsByStatus,
  workflowMatchesClientFilter,
  WORKFLOW_HEADER_BAND_CLASS,
  WORKFLOW_HEADER_RUN_BTN,
  WORKFLOW_HEADER_SELECT_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import { deleteWorkflow, fetchWorkflows } from "@/lib/workflow/workflow-api";
import type { PulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-hash";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";

export type WorkflowListProps = {
  teamId: number;
  sites: WordPressSiteOption[];
  route: PulseForgeRoute;
  onOpenWorkflow: (workflowId: number) => void;
  onNewWorkflow: () => void;
  onLoadErrorChange?: (error: string | null) => void;
  defaultSiteId?: string | null;
};

export function WorkflowList({
  teamId,
  sites,
  route,
  onOpenWorkflow,
  onNewWorkflow,
  onLoadErrorChange,
  defaultSiteId = null,
}: WorkflowListProps): React.ReactElement {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [clientFilterId, setClientFilterId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    onLoadErrorChange?.(null);
    const result = await fetchWorkflows(teamId);
    setWorkflows(result.workflows);
    if (result.error) onLoadErrorChange?.(result.error);
    setLoading(false);
  }, [onLoadErrorChange, teamId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredWorkflows = useMemo(
    () => workflows.filter((workflow) => workflowMatchesClientFilter(workflow, clientFilterId)),
    [clientFilterId, workflows],
  );

  const sections = useMemo(() => groupWorkflowsByStatus(filteredWorkflows), [filteredWorkflows]);

  const handleDelete = async (workflowId: number) => {
    await deleteWorkflow(teamId, workflowId);
    if (selectedId === workflowId) setSelectedId(null);
    void refresh();
  };

  if (loading) {
    return (
      <div className={`flex h-full items-center justify-center ${FORGE_RECIPE_PAGE_CLASS}`}>
        <p className="text-base text-muted-foreground">Loading workflows…</p>
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${FORGE_RECIPE_PAGE_CLASS}`}>
      <div className={WORKFLOW_HEADER_BAND_CLASS}>
        <PulseForgeBreadcrumbs
          route={route}
          hideLeaf
          className="shrink-0"
        />
        <select
          value={clientFilterId}
          onChange={(event) => setClientFilterId(event.target.value)}
          aria-label="Client"
          className={WORKFLOW_HEADER_SELECT_CLASS}
        >
          <option value="">All clients</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(WORKFLOW_HEADER_RUN_BTN, "ml-auto gap-1.5")}
          onClick={onNewWorkflow}
        >
          New workflow
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
        {filteredWorkflows.length === 0 ? (
          <p className="px-2 py-8 text-lg text-muted-foreground">
            {workflows.length === 0 ? "No workflows yet." : "No workflows match this client."}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map((section) => (
              <section key={section.status} className="flex flex-col gap-3">
                {sections.length > 1 ? (
                  <p className="text-base font-normal text-muted-foreground">{section.label}</p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {section.workflows.map((workflow) => (
                    <WorkflowCard
                      key={workflow.id}
                      workflow={workflow}
                      sites={sites}
                      selected={selectedId === workflow.id}
                      onSelect={() => {
                        setSelectedId(workflow.id);
                        onOpenWorkflow(workflow.id);
                      }}
                      onDelete={() => void handleDelete(workflow.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
