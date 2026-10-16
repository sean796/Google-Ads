import { getStoredSites } from "@/components/integrations/storage";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun } from "@/lib/agent-runs-types";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import { fetchWorkflow, fetchWorkflowStepOutputs, saveWorkflowStepOutput } from "@/lib/workflow/workflow-api";
import { readWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import { filterWorkflowOutputsForSite } from "@/lib/workflow/workflow-rag-client";
import { executeWorkflowThenStep } from "@/lib/workflow/workflow-then-runner";
import { linearExecutableTailNodes } from "@/lib/workflow/workflow-linear-tail";
import { thenConfig, workflowThenOutputExistsForSite } from "@/lib/workflow/workflow-then-utils";
import {
  resolveWorkflowClientSiteIds,
  workflowClientVariableSuffix,
} from "@/lib/workflow/workflow-client-config";
import { findClientNode } from "@/lib/workflow/workflow-graph-utils";
import { listWorkflowAvailableSiteIds } from "@/lib/workflow/workflow-available-sites";
import { workflowRunThenEmailAlreadySent } from "@/lib/workflow/workflow-then-aggregate";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";

function textField(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveSiteContext(
  siteId: string | undefined,
  run?: AgentRun,
): {
  name: string;
  url?: string;
} {
  const site = siteId?.trim()
    ? getStoredSites().find((item) => item.id === siteId.trim())
    : undefined;
  const payload = (run?.plan?.executionPayload ?? run?.plan?.clientRunContract) as
    | Record<string, unknown>
    | undefined;
  const name =
    (site ? wordpressSiteDisplayName(site) : "")
    || textField(payload, "businessName")
    || textField(payload, "siteName");
  const url =
    site?.siteUrl
    || site?.productionSiteUrl
    || textField(payload, "siteUrl")
    || textField(payload, "productionSiteUrl")
    || undefined;
  return { name, url };
}

function resolveExecutionKind(workflow: { nodes: { id: string; kind: string; config?: unknown }[] }, agentNodeId: string): string | undefined {
  const agentNode = workflow.nodes.find((node) => node.id === agentNodeId && node.kind === "action_agent");
  if (!agentNode) return undefined;
  return String((agentNode.config as WorkflowActionConfig).executionKind ?? "").trim() || undefined;
}

async function saveThenOutput(
  teamId: number,
  workflowId: number,
  workflowRunId: number,
  nodeId: string,
  agentRunId: number,
  output: NonNullable<Awaited<ReturnType<typeof executeWorkflowThenStep>>["output"]>,
  siteId?: string,
  variableKeyOverride?: string,
): Promise<WorkflowStepOutput | null> {
  const saved = await saveWorkflowStepOutput(teamId, workflowId, workflowRunId, {
    nodeId,
    variableKey: variableKeyOverride ?? output.variableKey,
    scope: "run",
    label: output.label,
    textPreview: output.textPreview,
    agentRunId: output.agentRunId ?? agentRunId,
    fileRefs: output.fileRefs,
    deliveryMeta: output.deliveryMeta,
    siteId,
  });
  return saved.ok && saved.output ? saved.output : null;
}

export async function runWorkflowBoundDeliverySteps(args: {
  teamId: number;
  run: AgentRun;
  onStep?: AgentRunHarnessContext["onStep"];
}): Promise<void> {
  void args.onStep;
  const binding = readWorkflowAgentBinding(args.run);
  if (!binding) return;

  if (resolveAgentRunRecipeKey(args.run) === "local_dominator_export") {
    return;
  }

  const workflow = await fetchWorkflow(args.teamId, binding.workflowId);
  if (!workflow) {
    throw new Error("Workflow not found.");
  }

  const outputs = [...(await fetchWorkflowStepOutputs(args.teamId, binding.workflowId, binding.workflowRunId))];
  // Agent output may not be saved yet when bound Then runs; prefer this agent as upstream.
  if (!outputs.some((output) => output.agentRunId === args.run.id)) {
    const ragVariableKey = String(args.run.plan?.ragVariableKey ?? "").trim();
    outputs.push({
      id: 0,
      runId: binding.workflowRunId,
      nodeId: binding.workflowNodeId,
      variableKey: ragVariableKey || `step_${binding.workflowNodeId}`,
      scope: "run",
      label: args.run.title,
      textPreview:
        typeof args.run.result?.message === "string" && args.run.result.message.trim()
          ? args.run.result.message.trim()
          : args.run.title,
      fileRefs: [],
      agentRunId: args.run.id,
      siteId: String(args.run.context?.siteId ?? "").trim() || undefined,
      createdAt: "",
    });
  }
  const thenNodes = linearExecutableTailNodes(workflow, binding.workflowNodeId).filter((node) =>
    isWorkflowThenKind(node.kind),
  );
  if (thenNodes.length === 0) return;

  const siteId = String(
    args.run.context?.siteId
    ?? (args.run.plan?.executionPayload as { siteId?: string } | undefined)?.siteId
    ?? "",
  ).trim();
  const siteContext = resolveSiteContext(siteId || undefined, args.run);
  const executionKind = resolveExecutionKind(workflow, binding.workflowNodeId);
  const clientNode = findClientNode(workflow);
  const clientConfig = (clientNode?.config ?? {}) as WorkflowClientConfig;
  const resolvedClientSiteIds = resolveWorkflowClientSiteIds(
    clientConfig,
    listWorkflowAvailableSiteIds(),
  );
  const allSiteIds =
    resolvedClientSiteIds.length > 0
      ? resolvedClientSiteIds
      : siteId
        ? [siteId]
        : [];

  for (const node of thenNodes) {
    if (workflowThenOutputExistsForSite(outputs, node.id, siteId, args.run.id)) {
      continue;
    }

    const config = thenConfig(node);
    const runWorkflowWideEmail =
      node.kind === "then_email" && config.emailBatchScope === "workflow_run";

    if (runWorkflowWideEmail) {
      if (workflowRunThenEmailAlreadySent(outputs, node.id)) continue;
      const thenResult = await executeWorkflowThenStep(node, outputs, {
        workflow,
        siteId: siteId || undefined,
        siteName: siteContext.name,
        siteUrl: siteContext.url,
        executionKind,
        allSiteIds,
        allOutputs: outputs,
      });
      if (!thenResult.ok) {
        throw new Error(thenResult.error ?? "Automation email step failed.");
      }
      if (thenResult.output) {
        const saved = await saveThenOutput(
          args.teamId,
          binding.workflowId,
          binding.workflowRunId,
          node.id,
          args.run.id,
          thenResult.output,
        );
        if (saved) outputs.push(saved);
      }
      continue;
    }

    const sitesForThen = siteId ? [siteId] : [""];
    for (const thenSiteId of sitesForThen) {
      const scopedSiteId = thenSiteId.trim();
      const scopedContext = resolveSiteContext(scopedSiteId || undefined, args.run);
      const siteOutputs = scopedSiteId
        ? filterWorkflowOutputsForSite(outputs, scopedSiteId, allSiteIds)
        : outputs;
      const thenResult = await executeWorkflowThenStep(node, siteOutputs, {
        workflow,
        siteId: scopedSiteId || undefined,
        siteName: scopedContext.name,
        siteUrl: scopedContext.url,
        executionKind,
        allSiteIds,
        allOutputs: outputs,
      });
      if (!thenResult.ok) {
        throw new Error(thenResult.error ?? "Automation delivery step failed.");
      }
      if (!thenResult.output) continue;
      const variableKey =
        scopedSiteId && allSiteIds.length > 1
          ? `${thenResult.output.variableKey}${workflowClientVariableSuffix(allSiteIds, scopedSiteId)}`
          : thenResult.output.variableKey;
      const saved = await saveThenOutput(
        args.teamId,
        binding.workflowId,
        binding.workflowRunId,
        node.id,
        args.run.id,
        thenResult.output,
        scopedSiteId || undefined,
        variableKey,
      );
      if (saved) outputs.push(saved);
    }
  }
}
