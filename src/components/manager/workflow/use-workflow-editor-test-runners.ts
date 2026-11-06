import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  fetchWorkflowRun,
  fetchWorkflowStepOutputs,
  startWorkflowRun,
} from "@/lib/workflow/workflow-api";
import { findAgentRunForWorkflowRun } from "@/lib/workflow/workflow-test-agent-run";
import {
  persistWorkflowDefinition,
} from "@/lib/workflow/workflow-persist";
import { validateWorkflowForRun, workflowHasActionAgent } from "@/lib/workflow/workflow-run-validation";
import {
  formatWorkflowStepTestSummary,
  testCsvRowsWorkflowStep,
  testGoogleDriveWorkflowStep,
  type WorkflowStepTestResult,
} from "@/lib/workflow/workflow-step-test";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import { getStoredSites } from "@/components/integrations/storage";
import type { WorkflowActionConfig } from "@/lib/workflow/workflow-types";
import { thenConfig } from "@/lib/workflow/workflow-then-utils";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";
import { testContentGapAgentNode } from "@/components/manager/workflow/workflow-editor-view-helpers";

type UseWorkflowEditorTestRunnersParams = {
  workflow: WorkflowDefinition | null;
  teamId: number;
  workflowClientSiteId: string;
  workflowTestAgentsFilter: string | undefined;
  workflowTestSiteIds: string[];
  clearDirty: () => void;
  onCreated: (workflowId: number) => void;
  onNameChange?: (name: string) => void;
  openSidebar: (runId?: number) => void;
  seedOptimisticWorkflowAgent: (title: string, siteId?: string | readonly string[]) => void;
  patchOptimisticWorkflowAgentProgress: (message: string, siteId?: string) => void;
  dispatchWorkflowRun: (
    workflowId: number,
    runId: number,
    options?: {
      openAgentSidebar?: boolean;
      stopAfterNodeId?: string;
      clientSiteId?: string;
      skipSetupSteps?: boolean;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshRuns: () => Promise<void>;
  setAgentsSiteFilter: (siteId: string) => void;
  setWorkflow: Dispatch<SetStateAction<WorkflowDefinition | null>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setInspectorNote: Dispatch<SetStateAction<string | null>>;
  setTestingRun: Dispatch<SetStateAction<boolean>>;
  setFocusRagOnRunId: Dispatch<SetStateAction<number | null>>;
  setActiveRunId: Dispatch<SetStateAction<number | null>>;
  setTestingStepId: Dispatch<SetStateAction<string | null>>;
  setStepTestResult: Dispatch<SetStateAction<WorkflowStepTestResult | null>>;
};

export function useWorkflowEditorTestRunners({
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
}: UseWorkflowEditorTestRunnersParams) {
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
    [clearDirty, onCreated, onNameChange, setSaveError, setWorkflow, teamId],
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
      if (validation.ok === false) {
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
    setActiveRunId,
    setAgentsSiteFilter,
    setFocusRagOnRunId,
    setInspectorNote,
    setSaveError,
    setTestingRun,
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
        const stepOk = dispatch.ok;
        const resultSummary = summary;
        setStepTestResult({
          nodeId,
          ok: stepOk,
          summary: resultSummary,
          rows: [{ label: "Result", value: resultSummary }],
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
      setInspectorNote,
      setSaveError,
      setStepTestResult,
      setTestingStepId,
      setWorkflow,
      teamId,
      workflow,
      workflowClientSiteId,
      workflowTestAgentsFilter,
      workflowTestSiteIds,
    ],
  );

  return {
    handleTestRun,
    handleTestStep,
  };
}
