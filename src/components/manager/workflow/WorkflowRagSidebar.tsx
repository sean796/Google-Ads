import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { WORKFLOW_SIDEBAR_BG_CLASS, WORKFLOW_SIDEBAR_FIELD_CLASS } from "@/components/manager/workflow/forge-workflow-styles";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { ClientSiteFilterSelect } from "@/components/shared/ClientSiteFilterSelect";
import { clearAgentRunHostedFiles } from "@/lib/agent-runs/agent-run-hosted-files";
import {
  AGENT_RUNS_ALL_SITES_ID,
  isAgentsAllSitesFilter,
  resolveDefaultAgentsSiteFilter,
} from "@/lib/agent-runs/agent-runs-site-filter";
import { listWorkflowAvailableSiteIds } from "@/lib/workflow/workflow-available-sites";
import { clientDeliverableOutputs } from "@/lib/workflow/workflow-rag-client";
import {
  clearWorkflowRuns,
  deleteWorkflowRun,
  fetchWorkflowRuns,
  fetchWorkflowStepOutputs,
  fetchWorkflowRun,
  promoteWorkflowOutputToLibrary,
} from "@/lib/workflow/workflow-api";
import { dedupeWorkflowRagFilesByName } from "@/lib/workflow/workflow-rag-run-files";
import type { WorkflowRun, WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import { WorkflowRagRunRow } from "@/components/manager/workflow/WorkflowRagRunRow";
import {
  buildClientSections,
  resolveOutputFiles,
  type DownloadableFile,
  type RagClientSection,
  type WorkflowRagSidebarProps,
} from "@/components/manager/workflow/workflow-rag-sidebar-files";

export function WorkflowRagSidebar({
  teamId,
  workflowId,
  nodes,
  activeRunId,
}: WorkflowRagSidebarProps): React.ReactElement {
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const { sites: wpSites } = useWordPressSites();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [outputsByRunId, setOutputsByRunId] = useState<Record<number, WorkflowStepOutput[]>>({});
  const [filesByRunId, setFilesByRunId] = useState<Record<number, DownloadableFile[]>>({});
  const [clientSectionsByRunId, setClientSectionsByRunId] = useState<
    Record<number, RagClientSection[]>
  >({});
  const [ragSiteFilter, setRagSiteFilter] = useState<string>("");
  const [loadingRunIds, setLoadingRunIds] = useState<Set<number>>(() => new Set());
  const [promotingKey, setPromotingKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const archiveScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeRunId) return;
    const container = archiveScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeRunId, outputsByRunId, filesByRunId, clientSectionsByRunId]);

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.id - a.id),
    [runs],
  );

  const clientSiteIds = useMemo(() => {
    void wpSites;
    return listWorkflowAvailableSiteIds();
  }, [wpSites]);

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of wpSites) {
      map.set(site.id, site.name?.trim() || site.siteUrl || site.id);
    }
    return map;
  }, [wpSites]);

  const ragFilterOptions = useMemo(
    () => [
      ...clientSiteIds.map((siteId) => ({
        id: siteId,
        label: siteNameById.get(siteId) ?? siteId,
      })),
      { id: AGENT_RUNS_ALL_SITES_ID, label: "All clients" },
    ],
    [clientSiteIds, siteNameById],
  );

  useEffect(() => {
    setRagSiteFilter(resolveDefaultAgentsSiteFilter(activeWordPressSiteId, clientSiteIds));
  }, [activeRunId, activeWordPressSiteId, clientSiteIds]);

  const loadRunOutputs = useCallback(
    async (runId: number) => {
      setLoadingRunIds((prev) => new Set(prev).add(runId));
      const outputs = await fetchWorkflowStepOutputs(teamId, workflowId, runId);

      if (isAgentsAllSitesFilter(ragSiteFilter)) {
        const sections = await buildClientSections(
          teamId,
          outputs,
          nodes,
          clientSiteIds,
          siteNameById,
        );
        setClientSectionsByRunId((prev) => ({ ...prev, [runId]: sections }));
        setOutputsByRunId((prev) => ({ ...prev, [runId]: outputs }));
        setFilesByRunId((prev) => ({
          ...prev,
          [runId]: dedupeWorkflowRagFilesByName(sections.flatMap((section) => section.files)),
        }));
      } else {
        const clientOutputs = clientDeliverableOutputs(outputs, nodes, ragSiteFilter, clientSiteIds);
        setClientSectionsByRunId((prev) => {
          const next = { ...prev };
          delete next[runId];
          return next;
        });
        setOutputsByRunId((prev) => ({ ...prev, [runId]: clientOutputs }));
        const fileLists = await Promise.all(
          clientOutputs.map((output) => resolveOutputFiles(teamId, output)),
        );
        setFilesByRunId((prev) => ({
          ...prev,
          [runId]: dedupeWorkflowRagFilesByName(fileLists.flat()),
        }));
      }

      setLoadingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    },
    [clientSiteIds, nodes, ragSiteFilter, siteNameById, teamId, workflowId],
  );

  useEffect(() => {
    for (const key of expandedKeys) {
      void loadRunOutputs(Number(key));
    }
    if (activeRunId) void loadRunOutputs(activeRunId);
  }, [activeRunId, expandedKeys, loadRunOutputs, ragSiteFilter]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRuns(await fetchWorkflowRuns(teamId, workflowId));
    setRefreshing(false);
  }, [teamId, workflowId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeRunId) return;
    const key = String(activeRunId);
    setExpandedKeys((prev) => new Set(prev).add(key));
    void loadRunOutputs(activeRunId);

    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        const run = await fetchWorkflowRun(teamId, workflowId, activeRunId);
        if (!cancelled) {
          await loadRunOutputs(activeRunId);
        }
        if (
          !run ||
          run.status === "done" ||
          run.status === "failed" ||
          run.status === "cancelled"
        ) {
          if (!cancelled) {
            setRuns(await fetchWorkflowRuns(teamId, workflowId));
            await loadRunOutputs(activeRunId);
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeRunId, loadRunOutputs, teamId, workflowId]);

  const toggleRun = useCallback(
    (runId: number) => {
      const key = String(runId);
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
          if (!outputsByRunId[runId]) {
            void loadRunOutputs(runId);
          }
        }
        return next;
      });
    },
    [loadRunOutputs, outputsByRunId],
  );

  const handlePromote = useCallback(
    (runId: number, output: WorkflowStepOutput) => {
      setPromotingKey(output.variableKey);
      void promoteWorkflowOutputToLibrary(teamId, output.variableKey, {
        runId,
        outputId: output.id,
        label: output.label,
      }).then(() => {
        setPromotingKey(null);
      });
    },
    [teamId],
  );

  const handleDeleteRun = useCallback(
    async (runId: number) => {
      setDeletingRunId(runId);
      setError(null);
      const outputs = outputsByRunId[runId] ?? (await fetchWorkflowStepOutputs(teamId, workflowId, runId));
      const result = await deleteWorkflowRun(teamId, workflowId, runId);
      if (!result.ok) {
        setError(result.error ?? "Could not delete run.");
        setDeletingRunId(null);
        return;
      }
      for (const output of outputs) {
        if (output.agentRunId) clearAgentRunHostedFiles(output.agentRunId);
      }
      setRuns((prev) => prev.filter((run) => run.id !== runId));
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(String(runId));
        return next;
      });
      setOutputsByRunId((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
      setFilesByRunId((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
      setDeletingRunId(null);
    },
    [outputsByRunId, teamId, workflowId],
  );

  const handleClearArchive = useCallback(async () => {
    if (sortedRuns.length === 0) return;
    setClearing(true);
    setError(null);
    for (const run of sortedRuns) {
      const outputs = outputsByRunId[run.id] ?? (await fetchWorkflowStepOutputs(teamId, workflowId, run.id));
      for (const output of outputs) {
        if (output.agentRunId) clearAgentRunHostedFiles(output.agentRunId);
      }
    }
    const result = await clearWorkflowRuns(teamId, workflowId);
    if (!result.ok) {
      setError(result.error ?? "Could not clear run archive.");
      setClearing(false);
      return;
    }
    setRuns([]);
    setExpandedKeys(new Set());
    setOutputsByRunId({});
    setFilesByRunId({});
    setClearing(false);
  }, [outputsByRunId, sortedRuns, teamId, workflowId]);

  return (
    <div className={cn("flex h-full w-full flex-col", WORKFLOW_SIDEBAR_BG_CLASS)}>
      <div className={cn("flex shrink-0 flex-col gap-2 px-3 py-3", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
        <div className="flex items-center gap-2">
          <p className="text-base font-normal text-white">Run archive</p>
          <Button
          variant="quiet"
          type="button"
          disabled={refreshing || clearing || deletingRunId != null}
          onClick={() => void refresh()}
        >
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
          Refresh
        </Button>
        <Button
          variant="quiet"
          type="button"
          disabled={sortedRuns.length === 0 || refreshing || clearing || deletingRunId != null}
          aria-label="Clear run archive"
          title="Clear run archive"
          onClick={() => void handleClearArchive()}
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
        </div>
        <ClientSiteFilterSelect
          value={ragSiteFilter}
          options={ragFilterOptions}
          onChange={setRagSiteFilter}
          className="w-full max-w-none"
          ariaLabel="Filter run archive by client"
        />
      </div>

      {error ? <p className={cn("px-3 py-2 text-base text-ui-danger-hover", WORKFLOW_SIDEBAR_FIELD_CLASS)}>{error}</p> : null}

      <div ref={archiveScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {sortedRuns.length === 0 ? (
          <p className={cn("px-3 py-6 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
            No workflow runs yet. Press Test to create one.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedRuns.map((run, index) => (
              <WorkflowRagRunRow
                key={run.id}
                run={run}
                rowIndex={index}
                expanded={expandedKeys.has(String(run.id))}
                loading={loadingRunIds.has(run.id)}
                outputs={outputsByRunId[run.id] ?? []}
                files={filesByRunId[run.id] ?? []}
                clientSections={
                  isAgentsAllSitesFilter(ragSiteFilter)
                    ? clientSectionsByRunId[run.id]
                    : undefined
                }
                promotingKey={promotingKey}
                deletingRun={deletingRunId === run.id}
                onToggle={() => toggleRun(run.id)}
                onPromote={(output) => handlePromote(run.id, output)}
                onDeleteRun={() => void handleDeleteRun(run.id)}
                scrollTailIntoView={run.id === activeRunId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
