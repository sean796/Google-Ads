import { sendAutomationEmailIfConfigured } from "@/lib/automation-email-delivery";
import { loadArchiveFilesFromStepOutput } from "@/lib/workflow/workflow-then-deliverable-loader";
import {
  formatThenConfigSuffix,
  logWorkflowThenStepToAgentRun,
  resolveWorkflowTailAgentRunId,
} from "@/lib/workflow/workflow-agent-tail-log";
import {
  buildAggregatedEmailSummary,
  collectDeliverableLabels,
  collectDriveLinkItems,
  collectEmailAttachmentsFromOutputs,
  formatDriveLinksBulletList,
  resolveEffectiveThenConfig,
  resolveThenUpstreamOutputs,
} from "@/lib/workflow/workflow-then-aggregate";
import { defaultThenVariableKey, thenConfig } from "@/lib/workflow/workflow-then-utils";
import type {
  WorkflowNode,
  WorkflowStepDeliveryMeta,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import {
  buildThenContract,
  buildThenEmailContract,
  buildThenEmailTokenContext,
  googleDriveThenFlightKey,
  googleDriveThenFlights,
  mergeOutputFileRefs,
  pickFinalEmailAttachment,
  resolveCompareLabelFromUpstream,
  type WorkflowThenRunContext,
  type WorkflowThenStepResult,
} from "@/lib/workflow/workflow-then-runner-helpers";
import { executeWorkflowThenGoogleDriveStep } from "@/lib/workflow/workflow-then-runner-drive";

export { resetGoogleDriveThenFlightsForTests } from "@/lib/workflow/workflow-then-runner-helpers";
export type { WorkflowThenRunContext } from "@/lib/workflow/workflow-then-runner-helpers";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";

export async function executeWorkflowThenStep(
  node: WorkflowNode,
  outputs: WorkflowStepOutput[],
  ctx: WorkflowThenRunContext,
): Promise<WorkflowThenStepResult> {
  if (node.kind === "then_google_drive") {
    const key = googleDriveThenFlightKey(ctx, node, outputs);
    const existing = googleDriveThenFlights.get(key);
    if (existing) return existing;
    const flight = executeWorkflowThenStepOnce(node, outputs, ctx);
    googleDriveThenFlights.set(key, flight);
    return flight;
  }
  return executeWorkflowThenStepOnce(node, outputs, ctx);
}

async function executeWorkflowThenStepOnce(
  node: WorkflowNode,
  outputs: WorkflowStepOutput[],
  ctx: WorkflowThenRunContext,
): Promise<WorkflowThenStepResult> {
  if (!isWorkflowThenKind(node.kind)) {
    return { ok: true };
  }

  const config = thenConfig(node);
  const resolved = resolveEffectiveThenConfig(config);
  const sourceOutputs = ctx.allOutputs ?? outputs;
  const upstreamOutputs = resolveThenUpstreamOutputs(sourceOutputs, config, {
    siteId: ctx.siteId,
    allSiteIds: ctx.allSiteIds ?? [],
    nodes: ctx.workflow.nodes,
  });
  if (upstreamOutputs.length === 0) {
    const folderTestOnly = ctx.folderTestOnly === true && node.kind === "then_google_drive";
    if (!folderTestOnly) {
      return { ok: false, error: "Then step has no upstream output to use." };
    }
  }

  const upstream = upstreamOutputs[upstreamOutputs.length - 1] ?? null;
  const tailAgentRunId = resolveWorkflowTailAgentRunId(upstream, upstreamOutputs);
  const payload = config.executionPayload ?? {};
  const contract = buildThenContract(payload, node.kind);
  const variableKey = defaultThenVariableKey(node);
  const summaryText =
    upstreamOutputs.length === 1
      ? (upstream?.textPreview?.trim() || "Workflow deliverable")
      : `${upstreamOutputs.length} deliverables`;
  const deliveryMeta: WorkflowStepDeliveryMeta = {};

  if (node.kind === "then_local") {
    let hasLocal = false;
    for (const item of upstreamOutputs) {
      const files = await loadArchiveFilesFromStepOutput(ctx.workflow.teamId, item);
      if (files.length > 0 || (item.fileRefs?.length ?? 0) > 0) hasLocal = true;
    }
    deliveryMeta.localSaved = hasLocal;
    if (!deliveryMeta.localSaved) {
      return { ok: false, error: "No local deliverable found from upstream step." };
    }
    await logWorkflowThenStepToAgentRun({
      teamId: ctx.workflow.teamId,
      agentRunId: tailAgentRunId,
      node,
      label: "Local: saved deliverables",
      payload: { thenPhase: "local_complete" },
    });
    return {
      ok: true,
      output: {
        variableKey,
        label: node.label,
        textPreview: "Saved locally",
        fileRefs: mergeOutputFileRefs(upstreamOutputs),
        agentRunId: upstream?.agentRunId,
        deliveryMeta,
      },
    };
  }

  if (node.kind === "then_google_drive") {
    return executeWorkflowThenGoogleDriveStep({
      node,
      ctx,
      upstreamOutputs,
      upstream,
      tailAgentRunId,
      payload,
      resolved,
      sourceOutputs,
      summaryText,
      deliveryMeta,
      variableKey,
    });
  }

  if (node.kind === "then_email") {
    const emailConfigSuffix = formatThenConfigSuffix(node, resolved);
    const driveItems = collectDriveLinkItems(upstreamOutputs);
    const driveLinkBlock = formatDriveLinksBulletList(driveItems);
    const emailSummary = buildAggregatedEmailSummary(upstreamOutputs, driveItems);
    const compareLabel = await resolveCompareLabelFromUpstream(ctx.workflow.teamId, upstream);
    const tokenContext = buildThenEmailTokenContext(ctx.workflow, upstream, ctx, {
      driveLinks: driveLinkBlock,
      deliverableCount: upstreamOutputs.length,
      deliverableList: collectDeliverableLabels(upstreamOutputs).join(", "),
    });
    if (compareLabel) tokenContext.compareLabel = compareLabel;
    const emailAttachments = await collectEmailAttachmentsFromOutputs(
      ctx.workflow.teamId,
      upstreamOutputs,
      tokenContext.executionKind,
      ctx.siteName,
      (files) => pickFinalEmailAttachment(tokenContext.executionKind, files, ctx.siteName),
    );
    if (emailAttachments.length === 0 && driveItems.length === 0) {
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: "Email: failed (No final report found to attach to the email.)",
        status: "error",
        payload: { thenPhase: "send" },
      });
      return { ok: false, error: "No final report found to attach to the email." };
    }
    const attachmentName =
      emailAttachments[0]?.fileName ?? collectDeliverableLabels(upstreamOutputs)[0] ?? "report";
    await logWorkflowThenStepToAgentRun({
      teamId: ctx.workflow.teamId,
      agentRunId: tailAgentRunId,
      node,
      label: `Email: sending · ${attachmentName}${emailConfigSuffix}`,
      payload: { thenPhase: "send", attachmentName },
    });
    const emailContract = buildThenEmailContract(payload, tokenContext.executionKind, resolved);
    const summaryForEmail =
      (tokenContext.executionKind === "gsc_reporting" || tokenContext.executionKind === "ads_reporting") &&
      resolved.inputMode === "single" &&
      emailAttachments[0]?.content.trim()
        ? emailAttachments[0].content.trim()
        : emailSummary;
    const emailResult = await sendAutomationEmailIfConfigured({
      teamId: ctx.workflow.teamId,
      executionId: 0,
      contract: emailContract,
      tokenContext: {
        ...tokenContext,
        summary: emailSummary,
      },
      summaryText: summaryForEmail,
      attachments: emailAttachments,
      runOk: true,
    });
    if (emailResult.emailError) {
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: `Email: failed (${emailResult.emailError})`,
        status: "error",
        payload: { thenPhase: "send" },
      });
      return { ok: false, error: emailResult.emailError };
    }
    deliveryMeta.emailSent = emailResult.emailSent === true;
    deliveryMeta.emailError = emailResult.emailError;
    if (driveItems[0]?.url) deliveryMeta.googleDriveUrl = driveItems[0].url;
    const emailOutcome = emailResult.emailSent
      ? "Email: sent"
      : `Email: skipped (${emailResult.emailSkipReason ?? "not configured"})`;
    await logWorkflowThenStepToAgentRun({
      teamId: ctx.workflow.teamId,
      agentRunId: tailAgentRunId,
      node,
      label: emailOutcome,
      payload: { thenPhase: "send_complete", emailSent: emailResult.emailSent === true },
    });
    return {
      ok: true,
      output: {
        variableKey,
        label: node.label,
        textPreview: emailResult.emailSent ? "Email sent" : (emailResult.emailSkipReason ?? "Email skipped"),
        fileRefs: mergeOutputFileRefs(upstreamOutputs),
        agentRunId: upstream?.agentRunId,
        deliveryMeta,
      },
    };
  }

  if (node.kind === "then_scheduled" || node.kind === "then_draft") {
    deliveryMeta.scheduled = node.kind === "then_scheduled";
    return {
      ok: true,
      output: {
        variableKey,
        label: node.label,
        textPreview: node.kind === "then_draft" ? "Draft destination configured" : "Scheduled destination configured",
        fileRefs: mergeOutputFileRefs(upstreamOutputs),
        agentRunId: upstream?.agentRunId,
        deliveryMeta,
      },
    };
  }

  return { ok: true };
}
