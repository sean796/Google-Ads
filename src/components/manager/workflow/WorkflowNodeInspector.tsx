import { X } from "lucide-react";
import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TaskFormFlatSelectPlaceholder,
} from "@/components/manager/tasks/TaskFormLayout";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import {
  WorkflowInspectorField,
  WorkflowInspectorFieldGrid,
  WorkflowInspectorGroup,
  WorkflowInspectorKindHeader,
  WorkflowInspectorTile,
} from "@/components/manager/workflow/WorkflowInspectorLayout";
import { WorkflowStepTestPanel } from "@/components/manager/workflow/WorkflowStepTestPanel";
import {
  WORKFLOW_INSPECTOR_FIELD_CELL_CLASS,
  WORKFLOW_FORM_FLAT_CONTROL_CLASS,
  WORKFLOW_FORM_SELECT_CONTENT_CLASS,
  WORKFLOW_FORM_SELECT_ITEM_CLASS,
  WORKFLOW_FORM_SELECT_TRIGGER_CLASS,
  WORKFLOW_SIDEBAR_BG_CLASS,
  WORKFLOW_SIDEBAR_FIELD_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import { inferActionKeyword } from "@/lib/automation-planner-compile";
import {
  resolveRagInputKeys,
  upstreamRagVariablesForNode,
} from "@/lib/workflow/workflow-rag-utils";
import { defaultGscReportingExecutionPayload } from "@/lib/gsc-reporting/resolve-gsc-reporting-run-config";
import { defaultAdsReportingExecutionPayload } from "@/lib/ads-reporting/resolve-ads-reporting-run-config";
import { workflowNodeSupportsStepTest, type WorkflowStepTestResult } from "@/lib/workflow/workflow-step-test";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowPathBranchConfig,
  WorkflowRagArchiveConfig,
  WorkflowRagArchiveDeliverableScope,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { ChatGptAuditExecutionFields } from "@/components/manager/tasks/ChatGptAuditExecutionFields";
import { DfsArticleAuditExecutionFields } from "@/components/manager/tasks/DfsArticleAuditExecutionFields";
import { BrowserAutomationExecutionFields } from "@/components/manager/tasks/BrowserAutomationExecutionFields";
import { ContentGapCheckExecutionFields, ensureContentGapCheckPayload } from "@/components/manager/tasks/ContentGapCheckExecutionFields";
import { LocalDominatorExportExecutionFields } from "@/components/manager/tasks/LocalDominatorExportExecutionFields";
import { EntityPageCreatorExecutionFields } from "@/components/manager/tasks/EntityPageCreatorExecutionFields";
import { EntityGeneratorExecutionFields } from "@/components/manager/tasks/EntityGeneratorExecutionFields";
import { SapGeneratorExecutionFields } from "@/components/manager/tasks/SapGeneratorExecutionFields";
import { ContentOptimizerExecutionFields } from "@/components/manager/tasks/ContentOptimizerExecutionFields";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { WorkflowClientInspectorFields } from "@/components/manager/workflow/WorkflowClientInspectorFields";
import { WorkflowCalendarWhenFields } from "@/components/manager/workflow/WorkflowCalendarWhenFields";
import { WorkflowThenStepInspector } from "@/components/manager/workflow/WorkflowThenStepInspector";
import { WorkflowCsvRowsInspector } from "@/components/manager/workflow/WorkflowCsvRowsInspector";
import { thenEmailDisplayLabel, withThenEmailRecipientSync } from "@/lib/workflow/workflow-then-utils";
import { scheduleHasUpstream } from "@/lib/workflow/workflow-schedule-upstream";
import { cn } from "@/lib/utils";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import type { TaskExecutionKind } from "@/lib/tasks-types";

const RAG_ARCHIVE_DELIVERABLE_OPTIONS: Array<{
  value: WorkflowRagArchiveDeliverableScope;
  label: string;
}> = [
  { value: "final", label: "Final deliverable" },
  { value: "all", label: "All files" },
];

const EXECUTION_KINDS: TaskExecutionKind[] = [
  "content_optimizer_meta",
  "content_optimizer",
  "gsc_reporting",
  "ads_reporting",
  "post_creator",
  "entity_page_creator",
  "entity_generator",
  "sap_generator",
  "local_dominator_export",
  "chatgpt_website_audit",
  "dfs_llm_article_audit",
  "browser_automation",
  "content_gap_check",
];

export type WorkflowNodeInspectorProps = {
  node: WorkflowNode | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  sites: WordPressSiteOption[];
  stepTestResult?: WorkflowStepTestResult | null;
  testingStepId?: string | null;
  onTestStep?: (nodeId: string) => void;
  onChange: (node: WorkflowNode) => void;
  clientsMenuOpen?: boolean;
  onClientsMenuOpenChange?: (open: boolean) => void;
};

export function WorkflowNodeInspector({
  node,
  nodes,
  edges,
  ragVariables,
  sites,
  stepTestResult,
  testingStepId,
  onTestStep,
  onChange,
  clientsMenuOpen = false,
  onClientsMenuOpenChange,
}: WorkflowNodeInspectorProps): React.ReactElement {
  if (!node) {
    return (
      <div className={cn("flex h-full items-center justify-center px-5 py-6", WORKFLOW_SIDEBAR_BG_CLASS)}>
        <p className="text-lg text-muted-foreground">Select a step to edit.</p>
      </div>
    );
  }

  const workflowClientNode = nodes.find((item) => item.kind === "workflow_client");
  const workflowClientConfig = (workflowClientNode?.config ?? {}) as WorkflowClientConfig;
  const clientSiteId = workflowClientConfig.siteIds?.[0]?.trim() ?? "";
  const clientSiteName = clientSiteId
    ? (() => {
        const site = sites.find((item) => item.id === clientSiteId);
        return site ? wordpressSiteDisplayName(site) : "";
      })()
    : "";

  const patchConfig = (patch: Record<string, unknown>) => {
    onChange({ ...node, config: { ...(node.config as Record<string, unknown>), ...patch } });
  };

  const actionConfig = node.config as WorkflowActionConfig;
  const executionKind = String(actionConfig.executionKind ?? "content_optimizer_meta");
  const executionPayload = actionConfig.executionPayload ?? {};

  const patchExecutionPayload = (nextPayload: typeof executionPayload) => {
    onChange({
      ...node,
      config: { ...actionConfig, executionPayload: nextPayload },
    });
  };

  const upstreamUrlVariables = useMemo(
    () =>
      upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node.id).map((variable) => ({
        key: variable.key,
        label: variable.label || variable.key,
      })),
    [nodes, edges, ragVariables, node.id],
  );

  const patchAgentKind = (value: string) => {
    const nextPayload =
      value === "gsc_reporting"
        ? { ...defaultGscReportingExecutionPayload(), ...executionPayload }
        : value === "ads_reporting"
          ? { ...defaultAdsReportingExecutionPayload(), ...executionPayload }
          : value === "post_creator"
            ? ensurePostCreatorPayload(executionPayload)
            : value === "content_gap_check"
              ? ensureContentGapCheckPayload(executionPayload)
              : executionPayload;
    const nextKind = value as TaskExecutionKind;
    onChange({
      ...node,
      config: {
        ...actionConfig,
        executionKind: nextKind,
        actionBlockKeyword: inferActionKeyword(nextKind, nextPayload),
        executionPayload: nextPayload,
      },
    });
  };

  const clientConfig =
    node.kind === "workflow_client" ? (node.config as WorkflowClientConfig) : workflowClientConfig;
  const primaryClientSiteId = clientConfig.siteIds?.[0];

  return (
    <WorkflowInspectorTile>
      {node.kind === "workflow_client" ? (
        <WorkflowClientInspectorFields
          config={clientConfig}
          sites={sites}
          onChange={(nextConfig) => patchConfig(nextConfig)}
          open={clientsMenuOpen}
          onOpenChange={(next) => onClientsMenuOpenChange?.(next)}
        />
      ) : (
        <WorkflowInspectorKindHeader
          kind={node.kind as WorkflowNodeKind}
          title={node.kind === "then_email" ? thenEmailDisplayLabel(node) : node.label}
          onTitleChange={(label) =>
            onChange(
              node.kind === "then_email" ? withThenEmailRecipientSync(node, label) : { ...node, label },
            )
          }
        />
      )}

      {workflowNodeSupportsStepTest(node) && onTestStep ? (
        <WorkflowStepTestPanel
          node={node}
          stepTestResult={stepTestResult}
          testingStepId={testingStepId}
          onTestStep={onTestStep}
        />
      ) : null}

      {node.kind === "workflow_client" ? (
        <WorkflowCalendarWhenFields
          title="Publish"
          config={clientConfig}
          onChange={(patch) => patchConfig(patch)}
        />
      ) : null}

      {node.kind === "trigger_manual" ? (
        <WorkflowInspectorGroup title="When">
          <p className="text-lg text-muted-foreground">
            Runs when you test or publish this workflow manually.
          </p>
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "trigger_calendar" ? (
        <WorkflowCalendarWhenFields
          title="When"
          config={node.config as Record<string, unknown>}
          onChange={(patch) => patchConfig(patch)}
          error={
            scheduleHasUpstream({ nodes, edges }, node.id)
              ? null
              : "Place Schedule after a Client or agent step."
          }
        />
      ) : null}

      {node.kind === "trigger_gsc" ? (
        <WorkflowInspectorGroup title="When">
          <p className="text-lg text-muted-foreground">
            Uses team GSC connection and inventory bucket from action payload.
          </p>
          <button
            type="button"
            className="w-fit bg-black px-4 py-3 text-lg text-white shadow-tile hover:shadow-tile-pop"
            onClick={() => patchConfig({ triggerConfig: defaultGscTriggerConfig(), targetBucket: "pages" })}
          >
            Reset GSC defaults
          </button>
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "trigger_document" ? (
        <WorkflowInspectorGroup title="When">
          <WorkflowInspectorFieldGrid>
            <TaskFormFlatSelectPlaceholder
              placeholder="Document source"
              value={String((node.config as { source?: string }).source ?? "task_file")}
              onChange={(value) => patchConfig({ source: value })}
              options={[
                { value: "task_file", label: "Task file" },
                { value: "kb", label: "Knowledge base" },
                { value: "email", label: "Email attachment" },
              ]}
              className={WORKFLOW_INSPECTOR_FIELD_CELL_CLASS}
            />
            <WorkflowInspectorField>
              <Input
                id="wf-doc-name"
                value={String((node.config as { nameContains?: string }).nameContains ?? "")}
                onChange={(event) => patchConfig({ nameContains: event.target.value })}
                className={WORKFLOW_FORM_FLAT_CONTROL_CLASS}
                placeholder="Name contains"
              />
            </WorkflowInspectorField>
          </WorkflowInspectorFieldGrid>
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "trigger_agentmail" ? (
        <WorkflowInspectorGroup title="When">
          <WorkflowInspectorFieldGrid>
            <WorkflowInspectorField>
              <Input
                id="wf-agentmail-from"
                value={String((node.config as { fromEmail?: string }).fromEmail ?? "")}
                onChange={(event) => patchConfig({ fromEmail: event.target.value })}
                className={WORKFLOW_FORM_FLAT_CONTROL_CLASS}
                placeholder="Sender email"
              />
            </WorkflowInspectorField>
            <WorkflowInspectorField>
              <Input
                id="wf-agentmail-inbox"
                value={String((node.config as { inbox?: string }).inbox ?? "")}
                onChange={(event) => patchConfig({ inbox: event.target.value })}
                className={WORKFLOW_FORM_FLAT_CONTROL_CLASS}
                placeholder="Inbox override (optional)"
              />
            </WorkflowInspectorField>
          </WorkflowInspectorFieldGrid>
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "trigger_agent_done" ? (
        <WorkflowInspectorGroup title="When">
          <WorkflowInspectorFieldGrid>
            <WorkflowInspectorField>
              <Input
                value={String((node.config as { recipeKey?: string }).recipeKey ?? "")}
                onChange={(event) => patchConfig({ recipeKey: event.target.value })}
                className={WORKFLOW_FORM_FLAT_CONTROL_CLASS}
                placeholder="Recipe key"
              />
            </WorkflowInspectorField>
            <TaskFormFlatSelectPlaceholder
              placeholder="Execution kind"
              value={String((node.config as { executionKind?: string }).executionKind ?? "")}
              onChange={(value) => patchConfig({ executionKind: value })}
              options={EXECUTION_KINDS.map((kind) => ({ value: kind, label: kind }))}
              className={WORKFLOW_INSPECTOR_FIELD_CELL_CLASS}
            />
          </WorkflowInspectorFieldGrid>
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "action_agent" ? (
        <>
          <WorkflowInspectorGroup title="Agent">
            <WorkflowInspectorFieldGrid>
              <TaskFormFlatSelectPlaceholder
                placeholder="Agent kind"
                value={executionKind}
                onChange={patchAgentKind}
                options={EXECUTION_KINDS.map((kind) => ({ value: kind, label: kind }))}
                className={WORKFLOW_INSPECTOR_FIELD_CELL_CLASS}
              />
              <WorkflowInspectorField>
                <Input
                  id="wf-rag-key"
                  value={String((node.config as { ragVariableKey?: string }).ragVariableKey ?? "")}
                  onChange={(event) => patchConfig({ ragVariableKey: event.target.value, ragScope: "run" })}
                  className={WORKFLOW_FORM_FLAT_CONTROL_CLASS}
                  placeholder="Output variable key"
                />
              </WorkflowInspectorField>
            </WorkflowInspectorFieldGrid>
          </WorkflowInspectorGroup>
          {executionKind === "gsc_reporting" ? (
            <GscReportingExecutionFields
              layout="workflow"
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "ads_reporting" ? (
            <AdsReportingExecutionFields
              layout="workflow"
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "post_creator" ? (
            <PostCreatorExecutionFields
              surface="what"
              executionPayload={ensurePostCreatorPayload(executionPayload)}
              onChange={(nextPayload) => patchExecutionPayload(ensurePostCreatorPayload(nextPayload))}
            />
          ) : null}
          {executionKind === "chatgpt_website_audit" ? (
            <ChatGptAuditExecutionFields
              clientSiteId={clientSiteId}
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "dfs_llm_article_audit" ? (
            <DfsArticleAuditExecutionFields
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "browser_automation" ? (
            <BrowserAutomationExecutionFields
              layout="workflow"
              clientSiteId={clientSiteId}
              urlVariableOptions={upstreamUrlVariables}
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "content_gap_check" ? (
            <ContentGapCheckExecutionFields
              layout="workflow"
              clientSiteId={clientSiteId}
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "entity_page_creator" ? (
            <EntityPageCreatorExecutionFields
              surface="what"
              clientSiteId={clientSiteId}
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "entity_generator" ? (
            <EntityGeneratorExecutionFields
              surface="what"
              clientSiteId={clientSiteId}
              executionPayload={executionPayload}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "sap_generator" ? (
            <SapGeneratorExecutionFields
              clientSiteId={clientSiteId}
              executionPayload={executionPayload}
              workflowEntityCsvLocked={
                (executionPayload as { entityCsvInputSource?: string }).entityCsvInputSource === "workflow"
              }
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "local_dominator_export" ? (
            <LocalDominatorExportExecutionFields
              layout="inline"
              executionPayload={executionPayload}
              clientSiteName={clientSiteName}
              onChange={patchExecutionPayload}
            />
          ) : null}
          {executionKind === "content_optimizer" || executionKind === "content_optimizer_meta" ? (
            <ContentOptimizerExecutionFields
              layout="workflow"
              actionBlockKeyword={actionConfig.actionBlockKeyword}
              executionKind={executionKind as TaskExecutionKind}
              executionPayload={executionPayload}
              onChange={({ executionKind: nextKind, actionBlockKeyword: nextKeyword, executionPayload: nextPayload }) =>
                onChange({
                  ...node,
                  config: {
                    ...actionConfig,
                    executionKind: nextKind,
                    actionBlockKeyword: nextKeyword,
                    executionPayload: nextPayload,
                  },
                })
              }
            />
          ) : null}
          <ActionAgentRagInputs
            node={node}
            nodes={nodes}
            edges={edges}
            ragVariables={ragVariables}
            onChange={onChange}
          />
        </>
      ) : null}

      {node.kind === "csv_rows" ? (
        <WorkflowCsvRowsInspector
          config={node.config as import("@/lib/workflow/csv-rows-types").WorkflowCsvRowsConfig}
          onChange={(config) =>
            onChange({
              ...node,
              config: { ...(node.config as Record<string, unknown>), ...config },
            })
          }
        />
      ) : null}

      {isWorkflowThenKind(node.kind) ? (
        <WorkflowThenStepInspector
          node={node}
          nodes={nodes}
          edges={edges}
          ragVariables={ragVariables}
          sites={sites}
          onChange={onChange}
        />
      ) : null}

      {node.kind === "path_rules" ? (
        <WorkflowInspectorGroup title="Paths">
          <PathRulesInspector node={node} onChange={onChange} />
        </WorkflowInspectorGroup>
      ) : null}

      {node.kind === "rag_archive" ? (
        <RagArchiveInspector
          node={node}
          nodes={nodes}
          edges={edges}
          ragVariables={ragVariables}
          onChange={onChange}
        />
      ) : null}
    </WorkflowInspectorTile>
  );
}

function RagArchiveInspector({
  node,
  nodes,
  edges,
  ragVariables,
  onChange,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  onChange: (node: WorkflowNode) => void;
}): React.ReactElement {
  const config = node.config as WorkflowRagArchiveConfig;
  const upstream = upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node.id);

  const patchConfig = (patch: Partial<WorkflowRagArchiveConfig>) => {
    onChange({
      ...node,
      config: {
        ...config,
        ...patch,
      },
    });
  };

  return (
    <WorkflowInspectorGroup title="Archive">
      <WorkflowInspectorField>
        <Select
          value={String(config.variableKey ?? "")}
          onValueChange={(value) => patchConfig({ variableKey: value, scope: "run" })}
        >
          <SelectTrigger className={WORKFLOW_FORM_SELECT_TRIGGER_CLASS}>
            <SelectValue placeholder="Source variable" />
          </SelectTrigger>
          <SelectContent className={WORKFLOW_FORM_SELECT_CONTENT_CLASS}>
            {upstream.map((variable) => (
              <SelectItem key={variable.key} value={variable.key} className={WORKFLOW_FORM_SELECT_ITEM_CLASS}>
                {variable.label || variable.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </WorkflowInspectorField>
      <WorkflowInspectorField>
        <Select
          value={config.deliverableScope ?? "final"}
          onValueChange={(value) =>
            patchConfig({ deliverableScope: value as WorkflowRagArchiveDeliverableScope })
          }
        >
          <SelectTrigger className={WORKFLOW_FORM_SELECT_TRIGGER_CLASS}>
            <SelectValue placeholder="Deliverables" />
          </SelectTrigger>
          <SelectContent className={WORKFLOW_FORM_SELECT_CONTENT_CLASS}>
            {RAG_ARCHIVE_DELIVERABLE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className={WORKFLOW_FORM_SELECT_ITEM_CLASS}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </WorkflowInspectorField>
    </WorkflowInspectorGroup>
  );
}

function ActionAgentRagInputs({
  node,
  nodes,
  edges,
  ragVariables,
  onChange,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  onChange: (node: WorkflowNode) => void;
}): React.ReactElement {
  const config = node.config as Record<string, unknown>;
  const selectedKeys = resolveRagInputKeys(config as Parameters<typeof resolveRagInputKeys>[0]);
  const upstream = upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node.id);
  const available = upstream.filter((variable) => !selectedKeys.includes(variable.key));

  const patchRagInputs = (ragInputKeys: string[]) => {
    onChange({
      ...node,
      config: {
        ...config,
        ragInputKeys,
        ragScope: "run",
        upstreamVariable: undefined,
      },
    });
  };

  const addKey = (key: string) => {
    if (!key || selectedKeys.includes(key)) return;
    patchRagInputs([...selectedKeys, key]);
  };

  const removeKey = (key: string) => {
    patchRagInputs(selectedKeys.filter((item) => item !== key));
  };

  const labelForKey = (key: string) =>
    ragVariables.find((variable) => variable.key === key)?.label ?? key;

  return (
    <WorkflowInspectorGroup title="RAG context">
      {selectedKeys.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {selectedKeys.map((key) => (
            <li
              key={key}
              className={cn(WORKFLOW_SIDEBAR_FIELD_CLASS, "flex items-center justify-between gap-3 px-3 py-2")}
            >
              <span className="truncate text-base text-emerald-400">{`{{${key}}}`}</span>
              <span className="truncate text-base text-muted-foreground">{labelForKey(key)}</span>
              <button
                type="button"
                className="shrink-0 p-1 text-muted-foreground hover:text-white"
                aria-label={`Remove ${key}`}
                onClick={() => removeKey(key)}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted-foreground">No run context attached.</p>
      )}
      {available.length > 0 ? (
        <TaskFormFlatSelectPlaceholder
          placeholder="Add run context"
          value=""
          onChange={addKey}
          options={available.map((variable) => ({
            value: variable.key,
            label: variable.label || variable.key,
          }))}
          className={WORKFLOW_INSPECTOR_FIELD_CELL_CLASS}
        />
      ) : null}
    </WorkflowInspectorGroup>
  );
}

function PathRulesInspector({
  node,
  onChange,
}: {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
}): React.ReactElement {
  const config = node.config as { branches?: WorkflowPathBranchConfig[] };
  const branches = config.branches ?? [];

  const updateBranch = (index: number, patch: Partial<WorkflowPathBranchConfig>) => {
    const next = branches.map((branch, i) => (i === index ? { ...branch, ...patch } : branch));
    onChange({ ...node, config: { ...config, branches: next } });
  };

  return (
    <div className="flex flex-col gap-4">
      {branches.map((branch, index) => (
        <WorkflowInspectorField key={branch.branchId}>
          <Input
            value={branch.label}
            onChange={(event) => updateBranch(index, { label: event.target.value })}
            className={WORKFLOW_FORM_FLAT_CONTROL_CLASS}
            placeholder="Path label"
          />
        </WorkflowInspectorField>
      ))}
    </div>
  );
}
