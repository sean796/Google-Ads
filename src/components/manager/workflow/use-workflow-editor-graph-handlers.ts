import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { compileWorkflowTasks } from "@/lib/workflow/workflow-compile";
import {
  publishWorkflow,
  updateWorkflow,
} from "@/lib/workflow/workflow-api";
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
import { mergeRecipeIntoWorkflow } from "@/lib/workflow/workflow-recipe-merge";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";
import { isWorkflowClientKind, isWorkflowScheduleKind, isWorkflowTriggerKind } from "@/lib/workflow/workflow-types";
import type { WorkflowClientConfig } from "@/lib/workflow/workflow-types";
import { setPulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-route";
import { resolveWorkflowStepForgeRoute } from "@/lib/workflow/workflow-step-navigation";
import { syncRagVariables } from "@/components/manager/workflow/workflow-editor-view-helpers";

type UseWorkflowEditorGraphHandlersParams = {
  workflow: WorkflowDefinition | null;
  teamId: number;
  selectedNode: WorkflowNode | null;
  clientsMenuOpen: boolean;
  workflowRef: { current: WorkflowDefinition | null };
  markDirty: () => void;
  persist: (next: WorkflowDefinition, options?: { compile?: boolean }) => Promise<void>;
  setWorkflow: Dispatch<SetStateAction<WorkflowDefinition | null>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setInspectorNote: Dispatch<SetStateAction<string | null>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setClientsMenuOpen: Dispatch<SetStateAction<boolean>>;
  setActiveWordPressSiteId: (id: string | null) => void;
  setAgentsSiteFilter: (siteId: string) => void;
};

export function useWorkflowEditorGraphHandlers({
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
}: UseWorkflowEditorGraphHandlersParams) {
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
    [markDirty, persist, setInspectorNote, setSelectedNodeId, setWorkflow],
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
    [markDirty, persist, setWorkflow],
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
    [persist, setActiveWordPressSiteId, setAgentsSiteFilter, setClientsMenuOpen, setWorkflow, workflowRef],
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
    [applyGraphUpdate, setInspectorNote, workflow],
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
    [applyGraphUpdate, setSaveError, workflow],
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
  }, [persist, setWorkflow]);

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
  }, [setSaving, setWorkflow, teamId, workflow]);

  const handleOpenStepDeepLink = useCallback(
    (node: WorkflowNode) => {
      if (!workflow?.id) return;
      const nextRoute = resolveWorkflowStepForgeRoute(node, workflow.id);
      if (nextRoute) setPulseForgeRoute(nextRoute);
    },
    [workflow?.id],
  );

  return {
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
  };
}
