import { getStoredSites } from "@/components/integrations/storage";
import { resolveContentGapCheckExecutionPayload } from "@/lib/content-gap/apply-editorial-package-content-gap-target";
import { resolveContentGapCount } from "@/lib/content-gap/resolve-content-gap-count";
import { emptyWorkflowDraft } from "@/lib/workflow/workflow-migrate-from-planner";
import {
  contentGapStepTestRows,
  mergeContentGapStepTestRows,
  type WorkflowStepTestResult,
} from "@/lib/workflow/workflow-step-test";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";

export async function testContentGapAgentNode(
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

export function buildLocalDraft(teamId: number, siteId?: string | null): WorkflowDefinition {
  return {
    id: 0,
    ...emptyWorkflowDraft(teamId, siteId),
  };
}

export function syncRagVariables(nodes: WorkflowNode[], current: WorkflowRagVariable[]): WorkflowRagVariable[] {
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
