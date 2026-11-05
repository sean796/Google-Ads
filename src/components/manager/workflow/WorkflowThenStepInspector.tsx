import React, { useCallback, useMemo, useRef } from "react";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { WordPressScheduleFields } from "@/components/keyword-research/bulk/WordPressScheduleFields";
import { AutomationGoogleDriveFields, GoogleDriveConnectionInline } from "@/components/manager/tasks/planner/AutomationGoogleDriveFields";
import { AutomationEmailDeliveryFields } from "@/components/manager/tasks/planner/AutomationEmailDeliveryFields";
import {
  WorkflowInspectorField,
  WorkflowInspectorGroup,
} from "@/components/manager/workflow/WorkflowInspectorLayout";
import {
  WORKFLOW_FORM_SELECT_CONTENT_CLASS,
  WORKFLOW_FORM_SELECT_ITEM_CLASS,
  WORKFLOW_FORM_SELECT_TRIGGER_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import {
  postCreatorPayloadToScheduleState,
  scheduleStateToExecutionPayload,
  ensureExecutionSchedulePayload,
  type PostCreatorScheduleUiState,
} from "@/lib/post-creator/post-creator-schedule-payload";
import {
  googleDriveClientFolderName,
  inferGoogleDriveDeliveryPath,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import { findUpstreamActionAgent } from "@/lib/workflow/workflow-graph-mutations";
import { upstreamRagVariablesForNode } from "@/lib/workflow/workflow-rag-utils";
import type {
  ThenEmailBatchScope,
  ThenInputMode,
  ThenWaitMode,
  WorkflowActionConfig,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRagVariable,
  WorkflowThenStepConfig,
} from "@/lib/workflow/workflow-types";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { SelectField } from "@/ui";

export type WorkflowThenStepInspectorProps = {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  sites: WordPressSiteOption[];
  onChange: (node: WorkflowNode) => void;
};

export function WorkflowThenStepInspector({
  node,
  nodes,
  edges,
  ragVariables,
  sites,
  onChange,
}: WorkflowThenStepInspectorProps): React.ReactElement {
  const config = node.config as WorkflowThenStepConfig;
  const executionPayload = config.executionPayload ?? {};
  const upstream = upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node.id);

  const nodeRef = useRef(node);
  const configRef = useRef(config);
  const executionPayloadRef = useRef(executionPayload);
  nodeRef.current = node;
  configRef.current = config;
  executionPayloadRef.current = executionPayload;

  const workflowSite = (() => {
    const client = nodes.find((item) => item.kind === "workflow_client");
    const siteIds = (client?.config as { siteIds?: string[] } | undefined)?.siteIds ?? [];
    const siteId = siteIds[0]?.trim();
    if (!siteId) return null;
    return sites.find((site) => site.id === siteId) ?? null;
  })();
  const workflowSiteName = workflowSite ? googleDriveClientFolderName(workflowSite) : "";
  const workflowSiteUrl = workflowSite?.siteUrl?.trim() ?? "";
  const upstreamExecutionKind = String(
    (findUpstreamActionAgent({ nodes, edges }, node.id)?.config as WorkflowActionConfig | undefined)
      ?.executionKind ?? "",
  ).trim();

  const patchConfig = (patch: Partial<WorkflowThenStepConfig>) => {
    onChange({
      ...nodeRef.current,
      config: {
        ...configRef.current,
        ...patch,
      },
    });
  };

  const patchExecutionPayload = (patch: Partial<TaskExecutionPayload>) => {
    const merged = {
      ...executionPayloadRef.current,
      ...patch,
    };
    executionPayloadRef.current = merged;
    if (nodeRef.current.kind === "then_email" && "automationEmailTo" in patch) {
      const trimmed = String(patch.automationEmailTo ?? "").trim();
      onChange({
        ...nodeRef.current,
        label: trimmed || "Email",
        config: {
          ...configRef.current,
          executionPayload: merged,
        },
      });
      return;
    }
    patchConfig({ executionPayload: merged });
  };

  const needsSchedule = node.kind === "then_scheduled" || node.kind === "then_draft";

  const schedulePayload = useMemo(() => {
    if (!needsSchedule) return null;
    const base = ensureExecutionSchedulePayload(executionPayload);
    const postCount =
      base.postCount ??
      (typeof base.scheduleTimesPerMonth === "number" && base.scheduleTimesPerMonth >= 1
        ? base.scheduleTimesPerMonth
        : 1);
    return {
      ...base,
      postCount,
      saveLocalArchive: false,
      sendAutomationEmail: false,
      saveToGoogleDrive: false,
      scheduleDraftOnly: node.kind === "then_draft",
      postDestination: node.kind === "then_draft" ? ("draft" as const) : ("wordpress" as const),
    };
  }, [executionPayload, needsSchedule, node.kind]);

  const schedulePayloadRef = useRef(schedulePayload);
  schedulePayloadRef.current = schedulePayload;

  const scheduleState = useMemo(() => {
    if (!schedulePayload) return null;
    return postCreatorPayloadToScheduleState(schedulePayload);
  }, [schedulePayload]);

  const scheduleStateRef = useRef(scheduleState);
  scheduleStateRef.current = scheduleState;

  const pushScheduleState = useCallback(
    (nextState: PostCreatorScheduleUiState) => {
      const payload = schedulePayloadRef.current;
      if (!payload) return;
      scheduleStateRef.current = nextState;
      const nextPayload = scheduleStateToExecutionPayload(
        {
          ...nextState,
          wordpressDraftOnly: nodeRef.current.kind === "then_draft",
        },
        payload,
      );
      const {
        saveLocalArchive: _saveLocalArchive,
        sendAutomationEmail: _sendAutomationEmail,
        saveToGoogleDrive: _saveToGoogleDrive,
        ...scheduleFields
      } = nextPayload;
      patchExecutionPayload({
        ...scheduleFields,
        saveLocalArchive: false,
        sendAutomationEmail: false,
        saveToGoogleDrive: false,
        scheduleDraftOnly: nodeRef.current.kind === "then_draft",
        postDestination: nodeRef.current.kind === "then_draft" ? "draft" : "wordpress",
      });
    },
    [],
  );

  const commitSchedule = useCallback(
    (updater: (prev: PostCreatorScheduleUiState) => PostCreatorScheduleUiState) => {
      const prev = scheduleStateRef.current;
      if (!prev) return;
      pushScheduleState(updater(prev));
    },
    [pushScheduleState],
  );

  const inputMode = config.inputMode ?? "single";
  const emailBatchScope = config.emailBatchScope ?? "single";
  const waitMode = config.waitMode ?? "immediate";
  const inferredDrivePath = inferGoogleDriveDeliveryPath(
    (findUpstreamActionAgent({ nodes, edges }, node.id)?.config as WorkflowActionConfig | undefined)
      ?.executionKind,
  );

  return (
    <>
      {node.kind !== "then_google_drive" ? (
      <WorkflowInspectorGroup title="Input">
        <WorkflowInspectorField>
          <SelectField placeholder="Upstream output" value={String(config.inputVariableKey ?? "")} onValueChange={(value) => {
              const match = upstream.find((variable) => variable.key === value);
              patchConfig({
                inputVariableKey: value,
                inputNodeId: match?.nodeId,
              });
            }} options={upstream.map((variable) => ({ value: variable.key, label: variable.label || variable.key }))} />
        </WorkflowInspectorField>
        <WorkflowInspectorField>
          <SelectField placeholder="Input mode" value={inputMode} onValueChange={(value) => patchConfig({ inputMode: value as ThenInputMode })} options={[{ value: "single", label: "Single output" }, { value: "all_from_node", label: "All from selected step" }, { value: "all_deliverables", label: "All deliverables in run" }]} />
        </WorkflowInspectorField>
        <WorkflowInspectorField>
          <SelectField placeholder="Wait before run" value={waitMode} onValueChange={(value) => patchConfig({ waitMode: value as ThenWaitMode })} options={[{ value: "immediate", label: "Run immediately" }, { value: "upstream_terminal", label: "Wait for upstream deliverables" }, { value: "all_parallel_clients", label: "Wait for all parallel clients" }]} />
        </WorkflowInspectorField>
      </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "then_email" ? (
        <WorkflowInspectorGroup title="Email batching">
          <WorkflowInspectorField>
            <SelectField placeholder="Email batch scope" value={emailBatchScope} onValueChange={(value) =>
                patchConfig({ emailBatchScope: value as ThenEmailBatchScope })
              } options={[{ value: "single", label: "Single deliverable" }, { value: "per_client", label: "One email per client" }, { value: "workflow_run", label: "One email for whole workflow run" }]} />
          </WorkflowInspectorField>
          <p className="text-base text-muted-foreground">
            Tokens: {"{driveLinks}"}, {"{deliverableCount}"}, {"{deliverableList}"}, {"{summary}"}
          </p>
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "then_google_drive" ? (
        <WorkflowInspectorGroup title="Google Drive" titleEnd={<GoogleDriveConnectionInline />}>
          <AutomationGoogleDriveFields
            payload={executionPayload}
            siteName={workflowSiteName}
            siteUrl={workflowSiteUrl}
            executionKind={upstreamExecutionKind || undefined}
            layout="workflow"
            inferredFolderPath={inferredDrivePath}
            onChange={(patch) =>
              patchExecutionPayload({
                ...patch,
                saveToGoogleDrive: true,
                saveLocalArchive: true,
              })
            }
          />
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "then_email" ? (
        <WorkflowInspectorGroup title="Email">
          <AutomationEmailDeliveryFields
            payload={executionPayload}
            onChange={(patch) =>
              patchExecutionPayload({
                ...patch,
                sendAutomationEmail: true,
                saveLocalArchive: true,
              })
            }
          />
        </WorkflowInspectorGroup>
      ) : null}

      {scheduleState ? (
        <WorkflowInspectorGroup title={node.kind === "then_draft" ? "Draft" : "Schedule"}>
          <WordPressScheduleFields
            layout="stack"
            scheduleFrequency={scheduleState.scheduleFrequency}
            setScheduleFrequency={(scheduleFrequency) =>
              commitSchedule((prev) => ({ ...prev, scheduleFrequency }))
            }
            customInterval={scheduleState.customInterval}
            setCustomInterval={(customInterval) =>
              commitSchedule((prev) => ({ ...prev, customInterval }))
            }
            dayOfWeek={scheduleState.dayOfWeek}
            setDayOfWeek={(dayOfWeek) => commitSchedule((prev) => ({ ...prev, dayOfWeek }))}
            startDateOption={scheduleState.startDateOption}
            setStartDateOption={(startDateOption) =>
              commitSchedule((prev) => ({ ...prev, startDateOption }))
            }
            customStartDate={scheduleState.customStartDate}
            setCustomStartDate={(customStartDate) =>
              commitSchedule((prev) => ({
                ...prev,
                customStartDate:
                  typeof customStartDate === "function"
                    ? customStartDate(prev.customStartDate)
                    : customStartDate,
              }))
            }
            startTime={scheduleState.startTime}
            setStartTime={(startTime) => commitSchedule((prev) => ({ ...prev, startTime }))}
            useCsvPublishDates={false}
            setUseCsvPublishDates={() => {}}
            wordpressDraftOnly={node.kind === "then_draft"}
            setWordpressDraftOnly={() => {}}
            localArchive={false}
            destinationModes={[node.kind === "then_draft" ? "draft" : "scheduled"]}
            outputDestinationMode={node.kind === "then_draft" ? "draft" : "scheduled"}
            onApplySchedulePreset={(next) => commitSchedule((prev) => ({ ...prev, ...next }))}
          />
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "then_local" ? (
        <WorkflowInspectorGroup title="Local">
          <p className="text-base text-muted-foreground">
            Confirms deliverables from the upstream step are saved locally.
          </p>
        </WorkflowInspectorGroup>
      ) : null}
    </>
  );
}
