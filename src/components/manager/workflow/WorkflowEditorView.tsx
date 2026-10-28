import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compileWorkflowTasks } from "@/lib/workflow/workflow-compile";
import {
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowStepOutputs,
  publishWorkflow,
  startWorkflowRun,
  updateWorkflow,
} from "@/lib/workflow/workflow-api";
import { findAgentRunForWorkflowRun } from "@/lib/workflow/workflow-test-agent-run";
import {
  newWorkflowDraftScopeKey,
  shouldApplyFetchedWorkflow,
  shouldInitializeNewWorkflowDraft,
  shouldShowWorkflowLoadSpinner,
} from "@/lib/workflow/workflow-editor-load-guard";
import { emptyWorkflowDraft, ensureWorkflowClientNode } from "@/lib/workflow/workflow-migrate-from-planner";
import {
  applyWorkflowLoadMigrations,
  compileAndPersistWorkflowNodes,
  persistWorkflowDefinition,
} from "@/lib/workflow/workflow-persist";
import { defaultNodeLabel, mergeWorkflowNodeUpdate } from "@/lib/workflow/workflow-graph-utils";
import {
  createWorkflowActionAgentNode,
  createWorkflowNode,
  deleteNode,
  duplicateNode,
  insertNodeAfter,
} from "@/lib/workflow/workflow-graph-mutations";
import { workflowActionAgentPresetById } from "@/lib/workflow/workflow-action-agent-presets";
import { syncAgentNodesForWorkflowClient } from "@/lib/workflow/workflow-client-agent-sync";
import {
  applyScheduleStampToUpstream,
  syncAdjacentScheduleFromClient,
} from "@/lib/workflow/workflow-schedule-upstream";
import { validateWorkflowForRun, workflowHasActionAgent } from "@/lib/workflow/workflow-run-validation";
import { mergeRecipeIntoWorkflow } from "@/lib/workflow/workflow-recipe-merge";

import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";
import { WorkflowWorkspaceHeader } from "@/components/manager/workflow/WorkflowWorkspaceHeader";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { isWorkflowClientKind, isWorkflowScheduleKind, isWorkflowTriggerKind } from "@/lib/workflow/workflow-types";
import type { WorkflowClientConfig } from "@/lib/workflow/workflow-types";
import { WorkflowRightRail } from "@/components/manager/workflow/WorkflowRightRail";
import { WorkflowStepColumn } from "@/components/manager/workflow/WorkflowStepColumn";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import type { PulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-hash";
import { setPulseForgeHash } from "@/lib/pulse-forge/pulse-forge-hash";
import { resolveWorkflowStepForgeRoute } from "@/lib/workflow/workflow-step-navigation";
import {
  contentGapStepTestRows,
  formatWorkflowStepTestSummary,
  googleDriveStepTestRowsFromOutput,
  mergeContentGapStepTestRows,
  testCsvRowsWorkflowStep,
  testGoogleDriveWorkflowStep,
  type WorkflowStepTestResult,
} from "@/lib/workflow/workflow-step-test";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import { getStoredSites } from "@/components/integrations/storage";
import { resolveContentGapCheckExecutionPayload } from "@/lib/content-gap/apply-editorial-package-content-gap-target";
import { resolveContentGapCount } from "@/lib/content-gap/resolve-content-gap-count";
import type { WorkflowActionConfig } from "@/lib/workflow/workflow-types";
import { thenConfig } from "@/lib/workflow/workflow-then-utils";
import { workflowClientSiteIds } from "@/components/manager/workflow/forge-workflow-styles";
import { AGENT_RUNS_ALL_SITES_ID } from "@/lib/agent-runs/agent-runs-site-filter";

async function testContentGapAgentNode(
  workflow: WorkflowDefinition,
  nodeId: string,
): Promise<WorkflowStepTestResult> {
  const node = workflow.nodes.find((item) => item.id === nodeId);
  if (node?.kind !== "action_agent") {
    return {
      nodeId,
      ok: false,
      summary: "Content gap check step not found.",
      rows: mergeContentGapStepTestRows([{ label: "Content", value: "Content gap check step not found." }]),
    };
  }
  const config = node.config as WorkflowActionConfig;
  if (config.executionKind !== "content_gap_check") {
    return {
      nodeId,
      ok: false,
      summary: "Step is not a content gap check.",
      rows: mergeContentGapStepTestRows([{ label: "Content", value: "Step is not a content gap check." }]),
    };
  }

  const clientNode = workflow.nodes.find((item) => item.kind === "workflow_client");
  const siteId = (clientNode?.config as WorkflowClientConfig)?.siteIds?.[0]?.trim() ?? "";
  if (!siteId) {
    return {
      nodeId,
      ok: false,
      summary: "Add a client site to the workflow before testing.",
      rows: mergeContentGapStepTestRows([
        { label: "Content", value: "Add a client site to the workflow before testing." },
      ]),
    };
  }
  const site = getStoredSites().find((item) => item.id === siteId);
  if (!site) {
    return {
      nodeId,
      ok: false,
      summary: "WordPress site not found. Open Integrations and reconnect the site.",
      rows: mergeContentGapStepTestRows([
        { label: "Content", value: "WordPress site not found. Open Integrations and reconnect the site." },
      ]),
    };
  }

  const gap = await resolveContentGapCount(
    site,
    resolveContentGapCheckExecutionPayload(config.executionPayload, site),
  );
  return {
    nodeId,
    ok: true,
    summary: gap.contextText,
    rows: contentGapStepTestRows(gap),
  };
}

export type WorkflowEditorViewProps = {
  teamId: number;
  workflowId: number | null;
  sites: WordPressSiteOption[];
  defaultSiteId?: string | null;
  route: PulseForgeRoute;
  onCreated: (workflowId: number) => void;
  onCancel: () => void;
  onNameChange?: (name: string) => void;
  onSaveErrorChange?: (error: string | null) => void;
};

export function WorkflowEditorView({
  teamId,
  workflowId,
  sites,
  defaultSiteId,
  route,
  onCreated,
  onNameChange,
  onSaveErrorChange,
}: WorkflowEditorViewProps): React.ReactElement {
  const {
    openSidebar,
    seedOptimisticWorkflowAgent,
    patchOptimisticWorkflowAgentProgress,
    dispatchWorkflowRun,
    refreshRuns,
    setAgentsSiteFilter,
  } = useAgentRunsContext();
  const { setActiveWordPressSiteId } = useActiveWordPressSite();
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [focusRagOnRunId, setFocusRagOnRunId] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(workflowId));
  const [testingRun, setTestingRun] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inspectorNote, setInspectorNote] = useState<string | null>(null);
  const [testingStepId, setTestingStepId] = useState<string | null>(null);
  const [stepTestResult, setStepTestResult] = useState<WorkflowStepTestResult | null>(null);
  const [clientsMenuOpen, setClientsMenuOpen] = useState(false);
  const persistSeqRef = useRef(0);
  const loadSeqRef = useRef(0);
  const gridAutoPersistRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const namePersistTimerRef = useRef<number | null>(null);
  const newDraftScopeRef = useRef<string | null>(null);
  const defaultSiteIdRef = useRef(defaultSiteId);
  const onNameChangeRef = useRef(onNameChange);
  const workflowRef = useRef(workflow);
  defaultSiteIdRef.current = defaultSiteId;
  onNameChangeRef.current = onNameChange;
  workflowRef.current = workflow;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  useEffect(() => {
    if (workflowId) return;
    const scopeKey = newWorkflowDraftScopeKey(teamId);
    if (
      !shouldInitializeNewWorkflowDraft({
        draftScopeKey: newDraftScopeRef.current,
        nextScopeKey: scopeKey,
      })
    ) {
      return;
    }
    newDraftScopeRef.current = scopeKey;
    clearDirty();
    setSaveError(null);
    const next = buildLocalDraft(teamId, defaultSiteIdRef.current ?? null);
    setWorkflow(next);
    onNameChangeRef.current?.(next.name);
    setLoading(false);
  }, [clearDirty, teamId, workflowId]);

  useEffect(() => {
    if (!workflowId) return;
    newDraftScopeRef.current = null;
    const seq = ++loadSeqRef.current;
    if (
      shouldShowWorkflowLoadSpinner({
        loadedWorkflowId: workflowRef.current?.id,
        nextWorkflowId: workflowId,
      })
    ) {
      setLoading(true);
    }
    setSaveError(null);
    let cancelled = false;
    void (async () => {
      const existing = await fetchWorkflow(teamId, workflowId);
      if (cancelled) return;
      if (
        !shouldApplyFetchedWorkflow({
          responseSeq: seq,
          latestLoadSeq: loadSeqRef.current,
          isDirty: dirtyRef.current,
        })
      ) {
        setLoading(false);
        return;
      }
      const withClient = existing ? ensureWorkflowClientNode(existing, defaultSiteIdRef.current ?? null) : existing;
      const { workflow: migrated, structuralMigration: gridMigrated } = withClient
        ? applyWorkflowLoadMigrations(withClient)
        : { workflow: withClient, structuralMigration: false };
      const synced = migrated
        ? {
            ...migrated,
            nodes: syncAgentNodesForWorkflowClient({
              nodes: migrated.nodes,
              edges: migrated.edges,
            }),
          }
        : migrated;
      setWorkflow(synced);
      if (synced?.name) onNameChangeRef.current?.(synced.name);
      clearDirty();
      setLoading(false);
      if (
        synced &&
        workflowId &&
        gridMigrated &&
        gridAutoPersistRef.current !== workflowId &&
        !dirtyRef.current
      ) {
        gridAutoPersistRef.current = workflowId;
        void persistWorkflowDefinition(teamId, synced, { compile: false }).then((result) => {
          if (result.workflow && shouldApplyFetchedWorkflow({
            responseSeq: seq,
            latestLoadSeq: loadSeqRef.current,
            isDirty: dirtyRef.current,
          })) {
            setWorkflow(result.workflow);
          }
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearDirty, teamId, workflowId]);

  useEffect(() => {
    if (!defaultSiteId) return;
    setWorkflow((current) => {
      if (!current) return current;
      return ensureWorkflowClientNode(current, defaultSiteId);
    });
  }, [defaultSiteId]);

  const workflowTestSiteIds = useMemo(() => {
    if (!workflow) return [];
    return workflowClientSiteIds(
      workflow,
      sites.map((site) => site.id),
    );
  }, [sites, workflow]);

  const workflowClientSiteId = workflowTestSiteIds[0] ?? "";

  const workflowTestAgentsFilter =
    workflowTestSiteIds.length > 1 ? AGENT_RUNS_ALL_SITES_ID : workflowTestSiteIds[0] || undefined;

  useEffect(() => {
    onSaveErrorChange?.(saveError);
  }, [onSaveErrorChange, saveError]);

  useEffect(() => {
    return () => {
      if (namePersistTimerRef.current != null) {
        window.clearTimeout(namePersistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (clientsMenuOpen) return;
    if (workflowTestSiteIds.length !== 1) return;
    const siteId = workflowTestSiteIds[0];
    if (!siteId) return;
    setActiveWordPressSiteId(siteId);
    setAgentsSiteFilter(siteId);
  }, [clientsMenuOpen, workflowTestSiteIds, setActiveWordPressSiteId, setAgentsSiteFilter]);

  const selectedNode = useMemo(
    () => workflow?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, workflow?.nodes],
  );

  const persist = useCallback(
    async (next: WorkflowDefinition, options?: { compile?: boolean }) => {
      const seq = ++persistSeqRef.current;
      setSaving(true);
      setSaveError(null);
      const result = await persistWorkflowDefinition(teamId, next, options);
      if (seq !== persistSeqRef.current) {
        setSaving(false);
        return;
      }
      if (result.workflow) {
        setWorkflow((current) => {
          if (!current) return result.workflow!;
          const localAgentCount = current.nodes.filter((node) => node.kind === "action_agent").length;
          const serverAgentCount = result.workflow!.nodes.filter((node) => node.kind === "action_agent").length;
          if (localAgentCount > serverAgentCount) {
            return {
              ...result.workflow!,
              nodes: current.nodes,
              edges: current.edges,
              ragVariables: current.ragVariables,
            };
          }
          return result.workflow!;
        });
        onNameChange?.(result.workflow.name);
      }
      if (result.created && result.workflow) {
        clearDirty();
        onCreated(result.workflow.id);
        setSaving(false);
        return;
      }
      if (!result.ok) {
        setSaveError(result.error ?? "Could not save workflow");
        if (result.workflow) clearDirty();
        setSaving(false);
        return;
      }
      clearDirty();
      setSaving(false);
    },
    [clearDirty, onCreated, onNameChange, teamId],
  );

  const handleNameChange = useCallback(
    (name: string) => {
      markDirty();
      setWorkflow((current) => {
        if (!current) return current;
        const next = { ...current, name };
        onNameChange?.(name);
        return next;
      });
      if (namePersistTimerRef.current != null) {
        window.clearTimeout(namePersistTimerRef.current);
      }
      namePersistTimerRef.current = window.setTimeout(() => {
        const current = workflowRef.current;
        if (current) void persist(current);
      }, 400);
    },
    [markDirty, onNameChange, persist],
  );

  const applyGraphUpdate = useCallback(
    (
      nodes: WorkflowNode[],
      edges: WorkflowEdge[],
      ragVariables?: WorkflowRagVariable[],
      options?: { selectNodeId?: string | null; note?: string | null; compile?: boolean },
    ) => {
      markDirty();
      setWorkflow((current) => {
        if (!current) return current;
        const nextRag = ragVariables ?? syncRagVariables(nodes, current.ragVariables);
        const next = { ...current, nodes, edges, ragVariables: nextRag };
        void persist(next, { compile: options?.compile });
        return next;
      });
      if (options?.selectNodeId) setSelectedNodeId(options.selectNodeId);
      if (options?.note !== undefined) setInspectorNote(options.note);
    },
    [markDirty, persist],
  );

  const handleNodeChange = useCallback(
    (node: WorkflowNode) => {
      markDirty();
      setWorkflow((current) => {
        if (!current) return current;
        const isClientChange = isWorkflowClientKind(node.kind);

        const nodes = current.nodes.map((item) =>
          item.id === node.id ? mergeWorkflowNodeUpdate(item, node) : item,
        );

        const siteIds = isClientChange
          ? ((node.config as WorkflowClientConfig).siteIds ?? [])
          : null;

        const ragVariables = syncRagVariables(nodes, current.ragVariables);
        let next = {
          ...current,
          nodes,
          ragVariables,
          ...(siteIds != null ? { wordpressSiteId: siteIds[0] ?? null } : {}),
        };
        if (isWorkflowScheduleKind(node.kind)) {
          next = applyScheduleStampToUpstream(next);
        } else if (isClientChange) {
          next = syncAdjacentScheduleFromClient(next);
        }
        void persist(next);
        return next;
      });
    },
    [markDirty, persist],
  );

  const handleClientsMenuOpenChange = useCallback(
    (open: boolean) => {
      setClientsMenuOpen(open);
      if (open) return;

      const current = workflowRef.current;
      if (!current) return;
      const client = current.nodes.find((item) => isWorkflowClientKind(item.kind));
      const siteId =
        ((client?.config as WorkflowClientConfig | undefined)?.siteIds ?? [])[0]?.trim() ?? "";
      if (!siteId) return;

      setActiveWordPressSiteId(siteId);
      setAgentsSiteFilter(siteId);

      setWorkflow((prev) => {
        if (!prev) return prev;
        const nodes = syncAgentNodesForWorkflowClient({
          nodes: prev.nodes,
          edges: prev.edges,
        });
        const next = {
          ...prev,
          nodes,
          ragVariables: syncRagVariables(nodes, prev.ragVariables),
        };
        void persist(next);
        return next;
      });
    },
    [persist, setActiveWordPressSiteId, setAgentsSiteFilter],
  );

  useEffect(() => {
    if (!clientsMenuOpen) return;
    if (selectedNode && isWorkflowClientKind(selectedNode.kind)) return;
    handleClientsMenuOpenChange(false);
  }, [clientsMenuOpen, handleClientsMenuOpenChange, selectedNode]);

  const handleAddStep = useCallback(
    (kind: WorkflowNodeKind, afterNodeId: string | null) => {
      if (!workflow) return;
      if (isWorkflowTriggerKind(kind) && workflow.nodes.some((node) => isWorkflowTriggerKind(node.kind))) {
        setInspectorNote("This workflow already has a trigger step.");
        return;
      }
      const node = createWorkflowNode(kind, defaultNodeLabel(kind));
      const graph = insertNodeAfter(workflow, afterNodeId, node);
      applyGraphUpdate(graph.nodes, graph.edges, syncRagVariables(graph.nodes, workflow.ragVariables), {
        selectNodeId: node.id,
        note: null,
        compile: false,
      });
    },
    [applyGraphUpdate, workflow],
  );

  const handleAddActionAgentPreset = useCallback(
    (presetId: string, afterNodeId: string | null) => {
      if (!workflow) return;
      const preset = workflowActionAgentPresetById(presetId);
      if (!preset) return;
      const node = createWorkflowActionAgentNode({
        executionKind: preset.executionKind,
        label: preset.label,
        executionPayload: preset.buildPayload?.(),
      });
      const graph = insertNodeAfter(workflow, afterNodeId, node);
      applyGraphUpdate(graph.nodes, graph.edges, syncRagVariables(graph.nodes, workflow.ragVariables), {
        selectNodeId: node.id,
        note: null,
        compile: false,
      });
    },
    [applyGraphUpdate, workflow],
  );

  const handleAddRecipe = useCallback(
    (recipe: AutomationRecipeCatalogItem, afterNodeId: string | null) => {
      if (!workflow) return;
      try {
        const merged = mergeRecipeIntoWorkflow(workflow, recipe, afterNodeId);
        if (!merged.nodes.some((node) => node.kind === "action_agent")) {
          setSaveError("Could not add agent to workflow.");
          return;
        }
        applyGraphUpdate(merged.nodes, merged.edges, merged.ragVariables, {
          selectNodeId: merged.insertedNodeIds[0] ?? null,
          note: merged.triggerConflict ?? null,
          compile: false,
        });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not add agent to workflow.");
      }
    },
    [applyGraphUpdate, workflow],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!workflow) return;
      const graph = deleteNode(workflow, nodeId);
      if (!graph) return;
      applyGraphUpdate(graph.nodes, graph.edges, undefined, {
        selectNodeId: null,
        note: null,
        compile: false,
      });
    },
    [applyGraphUpdate, workflow],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (!workflow) return;
      const graph = duplicateNode(workflow, nodeId);
      if (!graph) return;
      applyGraphUpdate(graph.nodes, graph.edges, undefined, {
        selectNodeId: graph.newNodeId,
        note: null,
        compile: false,
      });
    },
    [applyGraphUpdate, workflow],
  );

  const handleSave = useCallback(() => {
    setWorkflow((current) => {
      if (current) void persist(current);
      return current;
    });
  }, [persist]);

  const handlePublish = useCallback(async () => {
    if (!workflow?.id) return;
    setSaving(true);
    const compiled = await compileWorkflowTasks(teamId, workflow);
    await updateWorkflow(teamId, compiled.id, {
      nodes: compiled.nodes,
      edges: compiled.edges,
      ragVariables: compiled.ragVariables,
    });
    const result = await publishWorkflow(teamId, compiled.id);
    if (result.workflow) setWorkflow(result.workflow);
    setSaving(false);
  }, [teamId, workflow]);

  const handleOpenStepDeepLink = useCallback(
    (node: WorkflowNode) => {
      if (!workflow?.id) return;
      const nextRoute = resolveWorkflowStepForgeRoute(node, workflow.id);
      if (nextRoute) setPulseForgeHash(nextRoute);
    },
    [workflow?.id],
  );

  const persistWorkflowForRun = useCallback(
    async (source: WorkflowDefinition): Promise<WorkflowDefinition | null> => {
      const result = await persistWorkflowDefinition(teamId, source);
      if (result.workflow) {
        setWorkflow(result.workflow);
        onNameChange?.(result.workflow.name);
      }
      if (result.created && result.workflow) {
        clearDirty();
        onCreated(result.workflow.id);
      }
      if (!result.ok || !result.workflow) {
        setSaveError(result.error ?? "Could not save workflow before test run.");
        return null;
      }
      clearDirty();
      return result.workflow;
    },
    [clearDirty, onCreated, onNameChange, teamId],
  );

  const handleTestRun = useCallback(async () => {
    if (!workflow) return;
    setSaveError(null);
    setInspectorNote(null);
    setTestingRun(true);
    const agentTitle =
      workflow.nodes.find((node) => node.kind === "action_agent")?.label?.trim() || "Full AISEO";
    if (workflowTestAgentsFilter) {
      setAgentsSiteFilter(workflowTestAgentsFilter);
    }
    seedOptimisticWorkflowAgent(
      agentTitle,
      workflowTestSiteIds.length > 0 ? workflowTestSiteIds : workflowClientSiteId || undefined,
    );
    patchOptimisticWorkflowAgentProgress("Saving workflow…");

    try {
      const ready = await persistWorkflowForRun(workflow);
      if (!ready?.id) {
        const message = "Could not save workflow before test run.";
        patchOptimisticWorkflowAgentProgress(message);
        setSaveError(message);
        return;
      }

      const validation = validateWorkflowForRun(ready);
      if (!validation.ok) {
        patchOptimisticWorkflowAgentProgress(validation.error);
        setSaveError(validation.error);
        return;
      }

      const result = await startWorkflowRun(teamId, ready.id, { simulated: true });
      if (!result.ok || !result.run?.id) {
        const message = result.error ?? "Could not start workflow test run.";
        patchOptimisticWorkflowAgentProgress(message);
        setSaveError(message);
        return;
      }

      const workflowRunId = result.run.id;
      setFocusRagOnRunId(workflowRunId);
      setActiveRunId(workflowRunId);

      const testDispatchOptions = {
        openAgentSidebar: true,
        clientSiteId: workflowTestAgentsFilter,
        skipSetupSteps: true,
      };

      patchOptimisticWorkflowAgentProgress("Page audit…");
      const dispatch = await dispatchWorkflowRun(ready.id, workflowRunId, testDispatchOptions);
      if (!dispatch.ok) {
        const message = dispatch.error ?? "Workflow test failed.";
        patchOptimisticWorkflowAgentProgress(message);
        setSaveError(message);
        return;
      }

      const agentRunId = await findAgentRunForWorkflowRun(teamId, ready.id, workflowRunId);
      if (agentRunId) {
        openSidebar(agentRunId);
      } else if (workflowHasActionAgent(ready)) {
        const run = await fetchWorkflowRun(teamId, ready.id, workflowRunId);
        const message =
          run?.errorMessage?.trim()
          || dispatch.error
          || "Workflow test started no agent run. Check the DFS LLM article audit step.";
        setSaveError(message);
        return;
      }

      await refreshRuns();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Workflow test failed.";
      patchOptimisticWorkflowAgentProgress(message);
      setSaveError(message);
    } finally {
      setTestingRun(false);
    }
  }, [
    dispatchWorkflowRun,
    openSidebar,
    seedOptimisticWorkflowAgent,
    patchOptimisticWorkflowAgentProgress,
    persistWorkflowForRun,
    refreshRuns,
    setAgentsSiteFilter,
    teamId,
    workflow,
    workflowClientSiteId,
    workflowTestAgentsFilter,
    workflowTestSiteIds,
  ]);

  const handleTestStep = useCallback(
    async (nodeId: string) => {
      if (!workflow) return;
      setTestingStepId(nodeId);
      setSaveError(null);
      setInspectorNote(null);
      setStepTestResult(null);

      try {
        const node = workflow.nodes.find((item) => item.id === nodeId);
        if (node?.kind === "action_agent") {
          const config = node.config as WorkflowActionConfig;
          if (config.executionKind === "content_gap_check") {
            setStepTestResult(await testContentGapAgentNode(workflow, nodeId));
            return;
          }
          if (workflowTestAgentsFilter) {
            setAgentsSiteFilter(workflowTestAgentsFilter);
          }
          seedOptimisticWorkflowAgent(
            node.label?.trim() || "Full AISEO",
            workflowTestSiteIds.length > 0 ? workflowTestSiteIds : workflowClientSiteId || undefined,
          );
        }

        if (node?.kind === "csv_rows") {
          const csvResult = testCsvRowsWorkflowStep(node);
          setStepTestResult(csvResult);
          if (!csvResult.ok) setSaveError(csvResult.summary);
          return;
        }

        if (node?.kind === "then_google_drive") {
          const sites = getStoredSites();
          const site = sites.find((item) => item.id === workflowClientSiteId) ?? null;
          const driveResult = await testGoogleDriveWorkflowStep({
            workflow,
            nodeId,
            site,
          });
          setStepTestResult(driveResult);
          if (driveResult.ok && driveResult.googleDriveTargetFolderId) {
            const folderLabel =
              driveResult.rows?.find((row) => row.label === "Folder")?.value?.trim() ?? "";
            setWorkflow((current) => {
              if (!current) return current;
              return {
                ...current,
                nodes: current.nodes.map((item) => {
                  if (item.id !== nodeId) return item;
                  const config = thenConfig(item);
                  return {
                    ...item,
                    config: {
                      ...config,
                      executionPayload: {
                        ...(config.executionPayload ?? {}),
                        saveToGoogleDrive: true,
                        googleDriveTargetFolderId: driveResult.googleDriveTargetFolderId,
                        googleDriveFolderLabel:
                          folderLabel || config.executionPayload?.googleDriveFolderLabel,
                      },
                    },
                  };
                }),
              };
            });
          }
          if (!driveResult.ok) {
            setSaveError(driveResult.summary);
          }
          return;
        }

        const ready = await persistWorkflowForRun(workflow);
        if (!ready?.id) {
          const message = "Could not save workflow before step test.";
          setSaveError(message);
          setStepTestResult({
            nodeId,
            ok: false,
            summary: message,
            rows: [{ label: "Result", value: message }],
          });
          return;
        }

        const result = await startWorkflowRun(teamId, ready.id, { simulated: true });
        if (!result.ok || !result.run?.id) {
          const message = result.error ?? "Could not start step test run.";
          setSaveError(message);
          setStepTestResult({
            nodeId,
            ok: false,
            summary: message,
            rows: [{ label: "Result", value: message }],
          });
          return;
        }

        const workflowRunId = result.run.id;
        const dispatch = await dispatchWorkflowRun(ready.id, workflowRunId, {
          openAgentSidebar: node?.kind === "action_agent",
          stopAfterNodeId: nodeId,
          clientSiteId: workflowTestAgentsFilter,
        });

        await refreshRuns();
        const outputs = await fetchWorkflowStepOutputs(teamId, ready.id, workflowRunId);
        const stepOutput = outputs.find((output) => output.nodeId === nodeId);
        const agentRun = stepOutput?.agentRunId
          ? await fetchAgentRun(teamId, stepOutput.agentRunId)
          : null;

        const summary = dispatch.ok
          ? formatWorkflowStepTestSummary(stepOutput, agentRun?.result ?? null)
          : dispatch.error ?? "Step test failed.";
        const driveRows =
          node?.kind === "then_google_drive"
            ? googleDriveStepTestRowsFromOutput(stepOutput, summary)
            : [{ label: "Result", value: summary }];
        const driveLink =
          driveRows.find((row) => row.label === "Link")?.value?.trim() ||
          driveRows.find((row) => row.label === "Upload")?.value?.trim() ||
          "";
        let stepOk = dispatch.ok;
        if (node?.kind === "then_google_drive") {
          if (!dispatch.ok) {
            stepOk = false;
          } else if (!driveLink) {
            stepOk = false;
          }
        }
        const resultSummary =
          node?.kind === "then_google_drive" && dispatch.ok && !driveLink
            ? "Step test finished without a Google Drive link."
            : summary;
        setStepTestResult({
          nodeId,
          ok: stepOk,
          summary: resultSummary,
          rows: driveRows.length > 0 ? driveRows : [{ label: "Result", value: resultSummary }],
        });
        if (!stepOk) {
          const message = dispatch.ok ? resultSummary : dispatch.error ?? "Step test failed.";
          setSaveError(message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Step test failed.";
        setStepTestResult({
          nodeId,
          ok: false,
          summary: message,
          rows: [{ label: "Result", value: message }],
        });
        setSaveError(message);
      } finally {
        setTestingStepId(null);
      }
    },
    [
      dispatchWorkflowRun,
      persistWorkflowForRun,
      refreshRuns,
      seedOptimisticWorkflowAgent,
      setAgentsSiteFilter,
      teamId,
      workflow,
      workflowClientSiteId,
      workflowTestAgentsFilter,
      workflowTestSiteIds,
    ],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-base text-muted-foreground">Loading workflow…</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center bg-black px-6">
        <p className="text-base text-red-400">Workflow not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <WorkflowWorkspaceHeader
        route={route}
        workflowName={workflow.name}
        name={workflow.name}
        saving={saving}
        testingRun={testingRun}
        onNameChange={handleNameChange}
        onSave={handleSave}
        onPublish={() => void handlePublish()}
        onTestRun={() => void handleTestRun()}
        publishDisabled={workflow.id <= 0}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <WorkflowStepColumn
          teamId={teamId}
          workflow={workflow}
          sites={sites}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onOpenStepDeepLink={handleOpenStepDeepLink}
          onAddStep={handleAddStep}
          onAddActionAgentPreset={handleAddActionAgentPreset}
          onAddRecipe={handleAddRecipe}
          onDeleteNode={handleDeleteNode}
          onDuplicateNode={handleDuplicateNode}
        />
        <WorkflowRightRail
          teamId={teamId}
          workflowId={workflow.id}
          sites={sites}
          nodes={workflow.nodes}
          edges={workflow.edges}
          selectedNode={selectedNode}
          ragVariables={workflow.ragVariables}
          activeRunId={activeRunId}
          focusRagOnRunId={focusRagOnRunId}
          inspectorNote={inspectorNote}
          saveError={saveError}
          stepTestResult={stepTestResult}
          testingStepId={testingStepId}
          onTestStep={(nodeId) => void handleTestStep(nodeId)}
          onNodeChange={handleNodeChange}
          clientsMenuOpen={clientsMenuOpen}
          onClientsMenuOpenChange={handleClientsMenuOpenChange}
        />
      </div>
    </div>
  );
}

function buildLocalDraft(teamId: number, siteId?: string | null): WorkflowDefinition {
  return {
    id: 0,
    ...emptyWorkflowDraft(teamId, siteId),
  };
}

function syncRagVariables(nodes: WorkflowNode[], current: WorkflowRagVariable[]): WorkflowRagVariable[] {
  const ragNodes = nodes.filter(
    (node) => node.kind === "action_agent" || node.kind === "csv_rows",
  );
  return ragNodes.map((node) => {
    const config = node.config as {
      ragVariableKey?: string;
      ragScope?: WorkflowRagVariable["scope"];
      title?: string;
    };
    const defaultPrefix = node.kind === "csv_rows" ? `csv_${node.id}` : node.id;
    const key = config.ragVariableKey?.trim() || defaultPrefix;
    const existing = current.find((item) => item.nodeId === node.id);
    return {
      key,
      nodeId: node.id,
      scope: "run",
      label: config.title ?? node.label ?? existing?.label ?? key,
    };
  });
}
