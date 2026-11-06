import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Download, RefreshCw, Share2, Trash2 } from "lucide-react";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { WORKFLOW_SIDEBAR_BG_CLASS, WORKFLOW_SIDEBAR_FIELD_CLASS, WORKFLOW_SIDEBAR_ROW_CLASS } from "@/components/manager/workflow/forge-workflow-styles";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { ClientSiteFilterSelect } from "@/components/shared/ClientSiteFilterSelect";
import { fetchAgentRunArtifacts } from "@/lib/agent-runs-api";
import { getAgentRunHostedFiles } from "@/lib/agent-runs/agent-run-hosted-files";
import { clearAgentRunHostedFiles } from "@/lib/agent-runs/agent-run-hosted-files";
import {
  AGENT_RUNS_ALL_SITES_ID,
  isAgentsAllSitesFilter,
  resolveDefaultAgentsSiteFilter,
} from "@/lib/agent-runs/agent-runs-site-filter";
import { listWorkflowAvailableSiteIds } from "@/lib/workflow/workflow-available-sites";
import {
  clientDeliverableOutputs,
  groupWorkflowOutputsByClient,
} from "@/lib/workflow/workflow-rag-client";
import {
  clearWorkflowRuns,
  deleteWorkflowRun,
  fetchWorkflowRuns,
  fetchWorkflowStepOutputs,
  fetchWorkflowRun,
  promoteWorkflowOutputToLibrary,
} from "@/lib/workflow/workflow-api";
import { durableWorkflowOutputFileRefs, resolveStepOutputFileRefs } from "@/lib/workflow/workflow-step-file-refs";
import {
  dedupeWorkflowRagFilesByName,
  downloadableCsvFromStepOutput,
  type WorkflowRagDownloadableFile,
} from "@/lib/workflow/workflow-rag-run-files";
import type { WorkflowNode, WorkflowRun, WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/ui";

type RagClientSection = {
  siteId: string;
  label: string;
  outputs: WorkflowStepOutput[];
  files: DownloadableFile[];
};

async function buildClientSections(
  teamId: number,
  outputs: WorkflowStepOutput[],
  nodes: WorkflowNode[],
  clientSiteIds: string[],
  siteNameById: Map<string, string>,
): Promise<RagClientSection[]> {
  const grouped = groupWorkflowOutputsByClient(outputs, clientSiteIds);
  const sections: RagClientSection[] = [];
  for (const siteId of clientSiteIds) {
    const clientOutputs = clientDeliverableOutputs(outputs, nodes, siteId, clientSiteIds);
    const groupedOutputs = grouped.get(siteId) ?? clientOutputs;
    const mergedOutputs = clientOutputs.length > 0 ? clientOutputs : groupedOutputs;
    const fileLists = await Promise.all(mergedOutputs.map((output) => resolveOutputFiles(teamId, output)));
    sections.push({
      siteId,
      label: siteNameById.get(siteId) ?? siteId,
      outputs: mergedOutputs,
      files: dedupeWorkflowRagFilesByName(fileLists.flat()),
    });
  }
  return sections.filter((section) => section.outputs.length > 0 || section.files.length > 0);
}

type DownloadableFile = WorkflowRagDownloadableFile;

function formatRunWhen(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatDistanceToNow(parsed, { addSuffix: true }).replace(/^about /, "");
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function runStatusLabel(status: WorkflowRun["status"]): string {
  return status.replace(/_/g, " ");
}

async function fileHrefSize(href: string): Promise<number | null> {
  if (!href.startsWith("blob:") && !href.startsWith("data:")) return null;
  try {
    const blob = await fetch(href).then((response) => response.blob());
    return blob.size;
  } catch {
    return null;
  }
}

async function resolveOutputFiles(
  teamId: number,
  output: WorkflowStepOutput,
): Promise<DownloadableFile[]> {
  const outputKey = output.variableKey;
  const label = output.label || output.variableKey;
  const agentRunId = output.agentRunId;

  const durableRefs = durableWorkflowOutputFileRefs(output.fileRefs);
  if (durableRefs.length > 0) {
    return Promise.all(
      durableRefs.map(async (file) => ({
        name: file.name,
        href: file.url!,
        outputKey,
        sizeBytes: await fileHrefSize(file.url!),
      })),
    );
  }

  const fromCsv = downloadableCsvFromStepOutput(output);
  if (fromCsv) {
    return [
      {
        ...fromCsv,
        sizeBytes: (await fileHrefSize(fromCsv.href)) ?? fromCsv.sizeBytes,
      },
    ];
  }

  if (agentRunId) {
    const deliverables = await resolveStepOutputFileRefs(teamId, agentRunId);
    if (deliverables.length > 0) {
      return Promise.all(
        deliverables.map(async (file) => ({
          name: file.name,
          href: file.url,
          outputKey,
          sizeBytes: await fileHrefSize(file.url),
        })),
      );
    }
  }

  const seedRefs = (output.fileRefs ?? []).filter((file) => file.url);
  if (seedRefs.length > 0) {
    return Promise.all(
      seedRefs.map(async (file) => ({
        name: file.name,
        href: file.url!,
        outputKey,
        sizeBytes: await fileHrefSize(file.url!),
      })),
    );
  }

  if (!agentRunId) return [];

  const hosted = getAgentRunHostedFiles(agentRunId);
  if (hosted.length > 0) {
    return Promise.all(
      hosted
        .filter((file) => file.mimeType === "text/csv" || file.name.toLowerCase().endsWith(".csv"))
        .map(async (file) => ({
          name: file.name,
          href: file.href,
          outputKey,
          sizeBytes: await fileHrefSize(file.href),
        })),
    );
  }

  const artifacts = await fetchAgentRunArtifacts(teamId, agentRunId);
  return Promise.all(
    artifacts
      .filter((file) => file.url && /^https?:\/\//i.test(file.url))
      .filter(
        (file) =>
          file.stepKey === "grid_export" ||
          file.stepKey === "grid_csv_input" ||
          file.stepKey === "grid_summary_md" ||
          file.stepKey === "entity_wiki_picks" ||
          file.stepKey === "entity_hydrated_rows" ||
          file.stepKey === "gsc_reporting" ||
          file.mime === "text/csv" ||
          file.mime === "text/markdown" ||
          file.name.toLowerCase().endsWith(".csv") ||
          file.name.toLowerCase().endsWith(".md"),
      )
      .map(async (file) => ({
        name: file.name || label,
        href: file.url,
        outputKey,
        sizeBytes: await fileHrefSize(file.url),
      })),
  );
}

type WorkflowRagRunRowProps = {
  run: WorkflowRun;
  rowIndex: number;
  expanded: boolean;
  loading: boolean;
  outputs: WorkflowStepOutput[];
  files: DownloadableFile[];
  clientSections?: RagClientSection[];
  promotingKey: string | null;
  deletingRun: boolean;
  onToggle: () => void;
  onPromote: (output: WorkflowStepOutput) => void;
  onDeleteRun: () => void;
  scrollTailIntoView?: boolean;
};

function renderFileRow(
  file: DownloadableFile,
  outputs: WorkflowStepOutput[],
  onPromote: (output: WorkflowStepOutput) => void,
  promotingKey: string | null,
  indentClass = "pl-8",
) {
  const output = outputs.find((item) => item.variableKey === file.outputKey);
  return (
    <div
      key={`${file.name}-${file.href}`}
      className={cn(
        "flex h-8 items-center gap-2 px-3 text-base text-white",
        indentClass,
        WORKFLOW_SIDEBAR_ROW_CLASS,
      )}
    >
      <span className="min-w-0 flex-1 break-words font-normal text-white">{file.name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
      <a
        href={file.href}
        download={file.name}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-ui-field-hover hover:text-white"
        aria-label={`Download ${file.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <Download className="h-4 w-4" aria-hidden />
      </a>
      {output ? (
        <>
          <Button
            size="icon" icon={Copy}
            variant="quiet"
            aria-label={`Copy ${file.outputKey}`}
            onClick={(event) => {
              event.stopPropagation();
              void navigator.clipboard.writeText(`{{${file.outputKey}}}`);
            }}
          ></Button>
          <Button
            size="icon" icon={Share2}
            variant="quiet"
            aria-label={`Promote ${file.name}`}
            disabled={promotingKey === output.variableKey}
            onClick={(event) => {
              event.stopPropagation();
              onPromote(output);
            }}
          ></Button>
        </>
      ) : null}
    </div>
  );
}

function WorkflowRagRunRow({
  run,
  expanded,
  loading,
  outputs,
  files,
  clientSections,
  promotingKey,
  deletingRun,
  onToggle,
  onPromote,
  onDeleteRun,
  scrollTailIntoView,
}: WorkflowRagRunRowProps): React.ReactElement {
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded || loading || !scrollTailIntoView) return;
    tailRef.current?.scrollIntoView({ block: "nearest" });
  }, [expanded, loading, scrollTailIntoView, files.length, outputs.length, clientSections?.length]);
  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    onToggle();
  };

  const fileCount = files.length;

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-3 px-3 text-base text-white",
          WORKFLOW_SIDEBAR_ROW_CLASS,
          expanded && "text-primary",
        )}
        onClick={handleRowClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="min-w-0 break-words font-normal">Run #{run.id}</span>
        <span className="shrink-0 capitalize text-muted-foreground">{runStatusLabel(run.status)}</span>
        <span className="shrink-0 text-muted-foreground">
          {fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "No files"}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground">{formatRunWhen(run.createdAt)}</span>
        <Button
          size="icon" icon={Trash2}
          variant="quiet"
          aria-label={`Delete run ${run.id}`}
          disabled={deletingRun}
          onClick={(event) => {
            event.stopPropagation();
            onDeleteRun();
          }}
        ></Button>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </div>

      {expanded ? (
        <div className="flex flex-col">
          {loading ? (
            <p className={cn("px-3 py-2 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
              Loading…
            </p>
          ) : null}
          {!loading && files.length === 0 && !(clientSections?.some((section) => section.files.length > 0)) ? (
            <p className={cn("px-3 py-2 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
              No files for this run.
            </p>
          ) : null}
          {!loading && clientSections && clientSections.length > 0
            ? clientSections.map((section) => (
                <div key={section.siteId} className="flex flex-col">
                  <p className={cn("px-3 py-2 text-base font-semibold text-white", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
                    {section.label}
                  </p>
                  {section.files.length === 0 ? (
                    <p className={cn("px-3 py-1 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
                      No files
                    </p>
                  ) : (
                    section.files.map((file) =>
                      renderFileRow(file, section.outputs, onPromote, promotingKey, "pl-10"),
                    )
                  )}
                </div>
              ))
            : null}
          {!loading && !clientSections?.length
            ? files.map((file) => renderFileRow(file, outputs, onPromote, promotingKey))
            : null}
          <div ref={tailRef} className="h-0 shrink-0" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

export type WorkflowRagSidebarProps = {
  teamId: number;
  workflowId: number;
  nodes: WorkflowNode[];
  activeRunId: number | null;
};

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
