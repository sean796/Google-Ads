import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchWorkflow,
} from "@/lib/workflow/workflow-api";
import {
  newWorkflowDraftScopeKey,
  shouldApplyFetchedWorkflow,
  shouldInitializeNewWorkflowDraft,
  shouldShowWorkflowLoadSpinner,
} from "@/lib/workflow/workflow-editor-load-guard";
import { ensureWorkflowClientNode } from "@/lib/workflow/workflow-migrate-from-planner";
import {
  applyWorkflowLoadMigrations,
  persistWorkflowDefinition,
} from "@/lib/workflow/workflow-persist";
import { syncAgentNodesForWorkflowClient } from "@/lib/workflow/workflow-client-agent-sync";
import type {
  WorkflowDefinition,
} from "@/lib/workflow/workflow-types";
import { WorkflowWorkspaceHeader } from "@/components/manager/workflow/WorkflowWorkspaceHeader";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { WorkflowRightRail } from "@/components/manager/workflow/WorkflowRightRail";
import { WorkflowStepColumn } from "@/components/manager/workflow/WorkflowStepColumn";
import type { WorkflowStepTestResult } from "@/lib/workflow/workflow-step-test";
import { workflowClientSiteIds } from "@/components/manager/workflow/forge-workflow-styles";
import { AGENT_RUNS_ALL_SITES_ID } from "@/lib/agent-runs/agent-runs-site-filter";
import type { WorkflowEditorViewProps } from "@/components/manager/workflow/workflow-editor-view-types";
import { buildLocalDraft } from "@/components/manager/workflow/workflow-editor-view-helpers";
import { useWorkflowEditorGraphHandlers } from "@/components/manager/workflow/use-workflow-editor-graph-handlers";
import { useWorkflowEditorTestRunners } from "@/components/manager/workflow/use-workflow-editor-test-runners";

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

  const {
    handleNodeChange,
    handleClientsMenuOpenChange,
    handleAddStep,
    handleAddActionAgentPreset,
    handleAddRecipe,
    handleDeleteNode,
    handleDuplicateNode,
    handleSave,
    handlePublish,
    handleOpenStepDeepLink,
  } = useWorkflowEditorGraphHandlers({
    workflow,
    teamId,
    selectedNode,
    clientsMenuOpen,
    workflowRef,
    markDirty,
    persist,
    setWorkflow,
    setSelectedNodeId,
    setInspectorNote,
    setSaveError,
    setSaving,
    setClientsMenuOpen,
    setActiveWordPressSiteId,
    setAgentsSiteFilter,
  });

  const { handleTestRun, handleTestStep } = useWorkflowEditorTestRunners({
    workflow,
    teamId,
    workflowClientSiteId,
    workflowTestAgentsFilter,
    workflowTestSiteIds,
    clearDirty,
    onCreated,
    onNameChange,
    openSidebar,
    seedOptimisticWorkflowAgent,
    patchOptimisticWorkflowAgentProgress,
    dispatchWorkflowRun,
    refreshRuns,
    setAgentsSiteFilter,
    setWorkflow,
    setSaveError,
    setInspectorNote,
    setTestingRun,
    setFocusRagOnRunId,
    setActiveRunId,
    setTestingStepId,
    setStepTestResult,
  });

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
        <p className="text-base text-ui-danger-hover">Workflow not found.</p>
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
