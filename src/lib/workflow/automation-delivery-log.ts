import { appendAgentRunStep } from "@/lib/agent-runs/agent-run-step";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import { thenConfig } from "@/lib/workflow/workflow-then-utils";
import type { ResolvedThenConfig } from "@/lib/workflow/workflow-then-aggregate";
import type { WorkflowNode, WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";

export function resolveWorkflowBoundAgentRunId(
  upstream: WorkflowStepOutput | null,
  upstreamOutputs: WorkflowStepOutput[],
): number | null {
  const fromUpstream = upstream?.agentRunId;
  if (fromUpstream != null && fromUpstream > 0) return fromUpstream;
  const fromList = upstreamOutputs.find((output) => output.agentRunId != null && output.agentRunId > 0);
  return fromList?.agentRunId ?? null;
}

export function inferAutomationDeliveryStepKey(
  label: string,
  status: "running" | "done" | "error" = "running",
): string {
  const trimmed = label.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("google drive: failed") || (lower.includes("google drive") && status === "error")) {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveError;
  }
  if (lower.startsWith("google drive: uploaded") || lower === "uploaded to google drive") {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveComplete;
  }
  if (lower.startsWith("google drive: uploading") || lower.startsWith("uploading to google drive")) {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveUpload;
  }
  if (
    lower.startsWith("google drive: resolving")
    || lower.startsWith("resolved google drive folder")
    || lower.startsWith("created google drive folder")
  ) {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveResolve;
  }
  if (lower.startsWith("email: failed") || (lower.startsWith("email") && status === "error")) {
    return AGENT_RUN_STEP_KEYS.automationEmailError;
  }
  if (lower.startsWith("email: sent") || lower.startsWith("email: skipped") || lower === "email sent") {
    return AGENT_RUN_STEP_KEYS.automationEmailComplete;
  }
  if (lower.startsWith("email: sending") || lower.startsWith("sending email")) {
    return AGENT_RUN_STEP_KEYS.automationEmailSend;
  }
  if (lower.startsWith("local: saved")) {
    return AGENT_RUN_STEP_KEYS.automationLocalComplete;
  }
  return AGENT_RUN_STEP_KEYS.automationDelivery;
}

export function automationDeliveryStepKeyForThenPhase(
  node: WorkflowNode,
  thenPhase: string,
  status: "running" | "done" | "error" = "running",
): string {
  if (node.kind === "then_google_drive") {
    if (status === "error") {
      return AGENT_RUN_STEP_KEYS.automationGoogleDriveError;
    }
    if (thenPhase === "upload_complete") return AGENT_RUN_STEP_KEYS.automationGoogleDriveComplete;
    if (thenPhase === "upload") return AGENT_RUN_STEP_KEYS.automationGoogleDriveUpload;
    if (thenPhase === "resolve_folder") return AGENT_RUN_STEP_KEYS.automationGoogleDriveResolve;
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveResolve;
  }
  if (node.kind === "then_email") {
    if (status === "error") return AGENT_RUN_STEP_KEYS.automationEmailError;
    if (thenPhase === "send_complete") return AGENT_RUN_STEP_KEYS.automationEmailComplete;
    if (thenPhase === "send") return AGENT_RUN_STEP_KEYS.automationEmailSend;
    return AGENT_RUN_STEP_KEYS.automationEmailSend;
  }
  if (node.kind === "then_local") {
    return AGENT_RUN_STEP_KEYS.automationLocalComplete;
  }
  return `automation-then-${node.id}`;
}

export function formatThenConfigSuffix(
  node: WorkflowNode,
  resolved: Pick<ResolvedThenConfig, "inputMode">,
): string {
  const config = thenConfig(node);
  const parts: string[] = [];
  if (resolved.inputMode) parts.push(resolved.inputMode);
  if (config.emailBatchScope === "workflow_run") parts.push("workflow-wide email");
  const recipients = String(config.executionPayload?.automationEmailTo ?? "").trim();
  if (recipients && node.kind === "then_email") parts.push(`to ${recipients}`);
  return parts.length > 0 ? ` · ${parts.join(", ")}` : "";
}

export async function logAutomationDeliveryStep(args: {
  teamId: number;
  agentRunId: number | null;
  label: string;
  stepKey?: string;
  status?: "running" | "done" | "error";
  payload?: Record<string, unknown>;
  workflowNode?: WorkflowNode;
}): Promise<void> {
  if (!args.agentRunId || args.agentRunId <= 0) return;
  const existingRun = await fetchAgentRun(args.teamId, args.agentRunId);
  if (!existingRun) return;
  const status = args.status ?? "running";
  const thenPhase = typeof args.payload?.thenPhase === "string" ? args.payload.thenPhase : "";
  const stepKey =
    args.stepKey
    ?? (args.workflowNode && isWorkflowThenKind(args.workflowNode.kind)
      ? automationDeliveryStepKeyForThenPhase(args.workflowNode, thenPhase, status)
      : inferAutomationDeliveryStepKey(args.label, status));
  await appendAgentRunStep(
    args.teamId,
    args.agentRunId,
    {
      label: args.label,
      status,
      stepKey,
      resumePayload: {
        phase: "automation_delivery",
        ...(args.workflowNode
          ? { workflowNodeId: args.workflowNode.id, workflowNodeKind: args.workflowNode.kind }
          : {}),
        ...args.payload,
      },
    },
    existingRun,
  );
}

type AutomationDeliveryOnStep = (
  label: string,
  status?: "running" | "done" | "error",
  resumePayload?: Record<string, unknown>,
  stepKey?: string,
) => void | Promise<void>;

export function createAutomationDeliveryOnStep(
  onStep: AutomationDeliveryOnStep | undefined,
): AutomationDeliveryOnStep {
  return async (label, status = "running", resumePayload, stepKey) => {
    const key = stepKey ?? inferAutomationDeliveryStepKey(label, status);
    await onStep?.(
      label,
      status,
      { phase: "automation_delivery", ...resumePayload },
      key,
    );
  };
}

/** @deprecated Use logAutomationDeliveryStep */
export async function logWorkflowThenStepToAgentRun(args: {
  teamId: number;
  agentRunId: number | null;
  node: WorkflowNode;
  label: string;
  status?: "running" | "error";
  payload?: Record<string, unknown>;
}): Promise<void> {
  await logAutomationDeliveryStep({
    teamId: args.teamId,
    agentRunId: args.agentRunId,
    label: args.label,
    status: args.status,
    payload: args.payload,
    workflowNode: args.node,
  });
}

/** @deprecated Use resolveWorkflowBoundAgentRunId */
export const resolveWorkflowTailAgentRunId = resolveWorkflowBoundAgentRunId;

/** @deprecated Use automationDeliveryStepKeyForThenPhase */
export function workflowThenStepKey(node: WorkflowNode): string {
  return automationDeliveryStepKeyForThenPhase(node, "", "running");
}
