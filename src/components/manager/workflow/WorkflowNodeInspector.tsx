import { defaultGscTriggerConfig } from "@/lib/workflow/workflow-migrate-from-planner";
import React, { useMemo } from "react";
import {
  TaskFormFlatSelectPlaceholder,
} from "@/components/manager/tasks/TaskFormLayout";
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
  WORKFLOW_SIDEBAR_BG_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import { inferActionKeyword } from "@/lib/automation-planner-compile";
import { upstreamRagVariablesForNode } from "@/lib/workflow/workflow-rag-utils";
import { defaultGscReportingExecutionPayload } from "@/lib/gsc-reporting/resolve-gsc-reporting-run-config";
import { defaultAdsReportingExecutionPayload } from "@/lib/ads-reporting/resolve-ads-reporting-run-config";
import { workflowNodeSupportsStepTest } from "@/lib/workflow/workflow-step-test";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowNodeKind,
} from "@/lib/workflow/workflow-types";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { ChatGptAuditExecutionFields } from "@/components/manager/tasks/ChatGptAuditExecutionFields";
import { DfsArticleAuditExecutionFields } from "@/components/manager/tasks/DfsArticleAuditExecutionFields";
import { BrowserAutomationExecutionFields } from "@/components/manager/tasks/BrowserAutomationExecutionFields";
import { ContentGapCheckExecutionFields } from "@/components/manager/tasks/ContentGapCheckExecutionFields";
import { ensureContentGapCheckPayload } from "@/lib/content-gap/resolve-content-gap-count";
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
import type { TaskExecutionKind } from "@/lib/tasks-types";
import { Button, Field } from "@/ui";
import {
  EXECUTION_KINDS,
  type WorkflowNodeInspectorProps,
} from "@/components/manager/workflow/workflow-node-inspector-shared";
import {
  ActionAgentRagInputs,
  PathRulesInspector,
  RagArchiveInspector,
} from "@/components/manager/workflow/WorkflowNodeInspectorSections";

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
  const upstreamUrlVariables = useMemo(
    () =>
      upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node?.id ?? "").map((variable) => ({
        key: variable.key,
        label: variable.label || variable.key,
      })),
    [nodes, edges, ragVariables, node?.id],
  );

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
        return site ? site.name : "";
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
          <Button
            variant="quiet"
            onClick={() => patchConfig({ triggerConfig: defaultGscTriggerConfig(), targetBucket: "pages" })}
          >
            Reset GSC defaults
          </Button>
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
              <Field
                id="wf-doc-name"
                value={String((node.config as { nameContains?: string }).nameContains ?? "")}
                onChange={(event) => patchConfig({ nameContains: event.target.value })}
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
              <Field
                id="wf-agentmail-from"
                value={String((node.config as { fromEmail?: string }).fromEmail ?? "")}
                onChange={(event) => patchConfig({ fromEmail: event.target.value })}
                placeholder="Sender email"
              />
            </WorkflowInspectorField>
            <WorkflowInspectorField>
              <Field
                id="wf-agentmail-inbox"
                value={String((node.config as { inbox?: string }).inbox ?? "")}
                onChange={(event) => patchConfig({ inbox: event.target.value })}
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
              <Field
                value={String((node.config as { recipeKey?: string }).recipeKey ?? "")}
                onChange={(event) => patchConfig({ recipeKey: event.target.value })}
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
                <Field
                  id="wf-rag-key"
                  value={String((node.config as { ragVariableKey?: string }).ragVariableKey ?? "")}
                  onChange={(event) => patchConfig({ ragVariableKey: event.target.value, ragScope: "run" })}
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
