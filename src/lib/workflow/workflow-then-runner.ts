import { sendAutomationEmailIfConfigured, type AutomationEmailTokenContext } from "@/lib/automation-email-delivery";
import {
  enrichGoogleDriveContractFromSite,
  normalizeWorkflowDriveContract,
  readConfiguredGoogleDriveTargetFolder,
  resolveGoogleDriveTargetFolder,
  resolveDriveUploadDeliverables,
  uploadDeliverableToGoogleDriveIfConfigured,
  type GoogleDriveDeliveryResult,
} from "@/lib/automation-google-drive-delivery";
import {
  driveFolderBelongsToClient,
  driveFolderDisplayName,
  googleDriveDeliveryFolderIsMonthLeaf,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import {
  fetchAgentRunSiteIdentity,
  resolveWordPressSiteIdentity,
} from "@/lib/agent-runs/resolve-agent-run-site";
import type { TaskExecutionClientRunContract, TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import { uploadDeliverableToDrive } from "@/lib/google-drive/upload-deliverable-to-drive";
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
  WorkflowActionConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowStepDeliveryMeta,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";

export type WorkflowThenRunContext = {
  workflow: WorkflowDefinition;
  siteId?: string;
  siteName: string;
  siteUrl?: string;
  executionKind?: string;
  allSiteIds?: string[];
  allOutputs?: WorkflowStepOutput[];
  /** Step test: resolve target folder only when no upstream deliverable exists. */
  folderTestOnly?: boolean;
};

function deliveryFolderIsMonthLeaf(label: string): boolean {
  return googleDriveDeliveryFolderIsMonthLeaf(label);
}

function payloadText(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function resolveThenSiteIdentity(
  ctx: WorkflowThenRunContext,
  upstream: WorkflowStepOutput | null,
): Promise<{ siteName: string; siteUrl?: string }> {
  if (upstream?.agentRunId && upstream.agentRunId > 0) {
    const fromAgent = await fetchAgentRunSiteIdentity(ctx.workflow.teamId, upstream.agentRunId);
    if (fromAgent.siteName.trim()) return fromAgent;
  }
  if (upstream?.siteId?.trim()) {
    const fromOutputSite = resolveWordPressSiteIdentity(upstream.siteId);
    if (fromOutputSite.siteName.trim()) return fromOutputSite;
  }
  if (ctx.siteId?.trim()) {
    const fromCtxSite = resolveWordPressSiteIdentity(ctx.siteId);
    if (fromCtxSite.siteName.trim()) return fromCtxSite;
  }
  let siteName = ctx.siteName.trim();
  let siteUrl = ctx.siteUrl?.trim() ?? "";
  if (siteName && siteUrl) return { siteName, siteUrl };
  if (upstream?.agentRunId && upstream.agentRunId > 0) {
    const run = await fetchAgentRun(ctx.workflow.teamId, upstream.agentRunId);
    const payload = (run?.plan?.executionPayload ?? run?.plan?.clientRunContract) as
      | Record<string, unknown>
      | undefined;
    if (!siteName) {
      siteName = payloadText(payload, "businessName") || payloadText(payload, "siteName");
    }
    if (!siteUrl) {
      siteUrl = payloadText(payload, "siteUrl") || payloadText(payload, "productionSiteUrl");
    }
  }
  return { siteName, siteUrl: siteUrl || undefined };
}

async function resolveCompareLabelFromUpstream(
  teamId: number,
  upstream: WorkflowStepOutput | null,
): Promise<string | undefined> {
  if (!upstream?.agentRunId) return undefined;
  const run = await fetchAgentRun(teamId, upstream.agentRunId);
  const compareLabel = run?.result?.compareLabel;
  return typeof compareLabel === "string" && compareLabel.trim() ? compareLabel.trim() : undefined;
}

async function upstreamAgentBlocksDelivery(
  teamId: number,
  upstreamOutputs: WorkflowStepOutput[],
): Promise<string | null> {
  for (const output of upstreamOutputs) {
    if (!output.agentRunId || output.agentRunId <= 0) continue;
    const run = await fetchAgentRun(teamId, output.agentRunId);
    if (!run) continue;
    if (run.status !== "failed" && run.status !== "cancelled") continue;
    // Report may already be in RAG/artifacts (e.g. title-naming failed after deliverables saved).
    const files = await loadArchiveFilesFromStepOutput(teamId, output, 1);
    if (files.some((file) => file.content.trim())) continue;
    return "Upstream agent run failed. Google Drive delivery requires a completed report.";
  }
  return null;
}

function buildThenContract(
  payload: TaskExecutionPayload,
  kind: WorkflowNode["kind"],
): TaskExecutionClientRunContract {
  const contract = { ...payload, executionId: 0, siteId: "" } as TaskExecutionClientRunContract;
  if (kind === "then_google_drive") contract.saveToGoogleDrive = true;
  if (kind === "then_email") contract.sendAutomationEmail = true;
  if (kind === "then_local") contract.saveLocalArchive = true;
  return contract;
}

function resolveUpstreamAgentNode(
  workflow: WorkflowDefinition,
  upstream: WorkflowStepOutput | null,
): WorkflowNode | null {
  if (upstream) {
    const fromOutput = workflow.nodes.find(
      (node) => node.id === upstream.nodeId && node.kind === "action_agent",
    );
    if (fromOutput) return fromOutput;
  }
  return workflow.nodes.find((node) => node.kind === "action_agent") ?? null;
}

function buildThenEmailTokenContext(
  workflow: WorkflowDefinition,
  upstream: WorkflowStepOutput | null,
  ctx: WorkflowThenRunContext,
  extras?: Pick<AutomationEmailTokenContext, "driveLinks" | "deliverableCount" | "deliverableList">,
): AutomationEmailTokenContext {
  const agentNode = resolveUpstreamAgentNode(workflow, upstream);
  const agentConfig = agentNode ? (agentNode.config as WorkflowActionConfig) : null;
  const payload = (agentConfig?.executionPayload ?? {}) as Record<string, unknown>;
  const executionKind =
    (ctx.executionKind as TaskExecutionKind | undefined) ??
    (agentConfig?.executionKind as TaskExecutionKind | undefined) ??
    "gsc_reporting";
  const comparePreset =
    payload.comparePreset === "yoy" || payload.comparePreset === "mom"
      ? payload.comparePreset
      : undefined;

  return {
    siteName: ctx.siteName,
    siteUrl: ctx.siteUrl,
    automationTitle: agentConfig?.title?.trim() || agentNode?.label?.trim() || "Automation",
    executionKind,
    comparePreset,
    attachmentDateStamp: Date.now(),
    ...extras,
  };
}

function siteNameSlug(siteName: string): string {
  return siteName.replace(/\s+/g, "-").replace(/[^\w-]/g, "").toLowerCase();
}

function pickFinalEmailAttachment(
  executionKind: TaskExecutionKind | undefined,
  archiveFiles: TaskArchiveFileInput[],
  siteName?: string,
): TaskArchiveFileInput | null {
  if (archiveFiles.length === 0) return null;

  if (executionKind === "gsc_reporting" || executionKind === "ads_reporting") {
    const gscReports = archiveFiles.filter((file) => {
      const lower = file.fileName.toLowerCase();
      return (lower.includes("gsc-report") || lower.includes("ppc-report")) && lower.endsWith(".md");
    });
    if (gscReports.length > 0) {
      const slug = siteName?.trim() ? siteNameSlug(siteName) : "";
      if (slug) {
        const matched = gscReports.find((file) => file.fileName.toLowerCase().includes(slug));
        if (matched) return matched;
      }
      if (gscReports.length === 1) return gscReports[0]!;
      return null;
    }
    return (
      archiveFiles.find((file) => {
        const lower = file.fileName.toLowerCase();
        return lower.endsWith(".md") && !lower.includes("meeting-notes");
      }) ?? null
    );
  }

  return (
    archiveFiles.find((file) => file.fileName.toLowerCase().includes("final-report")) ??
    archiveFiles.find((file) => file.fileName.toLowerCase().includes("gsc-report")) ??
    archiveFiles.find((file) => file.fileName.toLowerCase().endsWith(".md")) ??
    archiveFiles[0] ??
    null
  );
}

function buildThenEmailContract(
  payload: TaskExecutionPayload,
  executionKind: TaskExecutionKind | undefined,
  resolved: ReturnType<typeof resolveEffectiveThenConfig>,
): TaskExecutionClientRunContract {
  const contract = buildThenContract(payload, "then_email");
  if ((executionKind === "gsc_reporting" || executionKind === "ads_reporting") && resolved.inputMode === "single") {
    contract.automationEmailAiIntro = true;
  }
  return contract;
}

function mergeOutputFileRefs(outputs: WorkflowStepOutput[]): WorkflowStepOutput["fileRefs"] {
  const merged: WorkflowStepOutput["fileRefs"] = [];
  const seen = new Set<string>();
  for (const output of outputs) {
    for (const ref of output.fileRefs ?? []) {
      const key = ref.url?.trim() || ref.name?.trim() || "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(ref);
    }
  }
  return merged;
}

function buildGoogleDriveStepTestFile(title: string): { fileName: string; content: string } {
  const safeTitle = title.trim() || "Workflow step";
  const timestamp = new Date().toISOString();
  const stampSlug = timestamp.replace(/[:.]/g, "-");
  const fileName = `${safeTitle.replace(/\s+/g, "-")}-test-${stampSlug}`;
  const content = `# ${safeTitle}\n\nTest file\n\n${timestamp}\n`;
  return { fileName, content };
}

type WorkflowThenStepResult = {
  ok: boolean;
  error?: string;
  output?: {
    variableKey: string;
    label: string;
    textPreview: string;
    fileRefs: WorkflowStepOutput["fileRefs"];
    agentRunId?: number | null;
    deliveryMeta?: WorkflowStepDeliveryMeta;
  };
};

const googleDriveThenFlights = new Map<string, Promise<WorkflowThenStepResult>>();

function googleDriveThenFlightKey(
  ctx: WorkflowThenRunContext,
  node: WorkflowNode,
  outputs: WorkflowStepOutput[],
): string {
  const runId = (ctx.allOutputs ?? outputs)[0]?.runId ?? 0;
  const siteId = String(ctx.siteId ?? "").trim();
  return `${ctx.workflow.teamId}:${ctx.workflow.id}:${runId}:${node.id}:${siteId}`;
}

export function resetGoogleDriveThenFlightsForTests(): void {
  googleDriveThenFlights.clear();
}

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
    const configSuffix = formatThenConfigSuffix(node, resolved);
    const siteIdentity = await resolveThenSiteIdentity(ctx, upstream);
    const contract = normalizeWorkflowDriveContract(
      buildThenContract(payload, node.kind),
      ctx.executionKind,
    );
    const enriched = enrichGoogleDriveContractFromSite(
      contract,
      siteIdentity.siteName,
      siteIdentity.siteUrl,
    );
    let folderMeta = readConfiguredGoogleDriveTargetFolder(enriched, siteIdentity.siteName);
    const usingConfiguredFolder = Boolean(folderMeta?.folderId);
    try {
      if (!folderMeta) {
        folderMeta = await resolveGoogleDriveTargetFolder({
          contract: enriched,
          siteName: siteIdentity.siteName,
          siteUrl: siteIdentity.siteUrl,
          executionKind: ctx.executionKind,
          context: {
            outputs: sourceOutputs,
            siteId: ctx.siteId,
            clientSiteIds: ctx.allSiteIds ?? [],
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google Drive folder resolution failed.";
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: `Google Drive: failed (${message})`,
        status: "error",
        payload: { thenPhase: "resolve_folder" },
      });
      return {
        ok: false,
        error: message,
      };
    }
    if (!folderMeta?.folderId) {
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: "Google Drive: failed (Google Drive folder is required.)",
        status: "error",
        payload: { thenPhase: "resolve_folder" },
      });
      return { ok: false, error: "Google Drive folder is required." };
    }
    if (
      siteIdentity.siteName.trim() &&
      !driveFolderBelongsToClient(folderMeta.label, siteIdentity.siteName)
    ) {
      const message = `Google Drive folder is not this client (${siteIdentity.siteName}).`;
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: `Google Drive: failed (${message})`,
        status: "error",
        payload: { thenPhase: "resolve_folder", folderId: folderMeta.folderId },
      });
      return { ok: false, error: message };
    }
    if (!usingConfiguredFolder && !deliveryFolderIsMonthLeaf(folderMeta.label)) {
      const message = `Google Drive folder must be a purpose/year/month folder, not the client root (${folderMeta.label}).`;
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: `Google Drive: failed (${message})`,
        status: "error",
        payload: { thenPhase: "resolve_folder", folderId: folderMeta.folderId },
      });
      return { ok: false, error: message };
    }

    await logWorkflowThenStepToAgentRun({
      teamId: ctx.workflow.teamId,
      agentRunId: tailAgentRunId,
      node,
      label: usingConfiguredFolder
        ? `Google Drive: using folder (${folderMeta.label})${configSuffix}`
        : `Google Drive: resolving folder (${folderMeta.label})${configSuffix}`,
      payload: {
        thenPhase: "resolve_folder",
        inputMode: resolved.inputMode,
        folderId: folderMeta.folderId,
        folderUrl: folderMeta.webViewLink,
        folderLabel: folderMeta.label,
      },
    });

    if (folderMeta.webViewLink) deliveryMeta.googleDriveFolderUrl = folderMeta.webViewLink;
    deliveryMeta.googleDriveTargetFolderId = folderMeta.folderId;
    if (folderMeta.created?.length) deliveryMeta.googleDriveFoldersCreated = folderMeta.created;

    const folderTestOnly = ctx.folderTestOnly === true && upstreamOutputs.length === 0;
    if (folderTestOnly) {
      const { fileName, content } = buildGoogleDriveStepTestFile(node.label);
      const upload = await uploadDeliverableToDrive({
        fileName,
        content,
        folderId: folderMeta.folderId,
        mime: "text/markdown",
        convertToGoogleDoc: true,
      });
      if (!upload.success || !upload.webViewLink) {
        return {
          ok: false,
          error: upload.error ?? "Google Drive step test upload failed.",
        };
      }

      deliveryMeta.googleDriveUrl = folderMeta.webViewLink ?? "";
      deliveryMeta.googleDriveTargetFolderId = folderMeta.folderId;
      deliveryMeta.googleDriveFileId = upload.fileId;
      deliveryMeta.googleDriveFileName = upload.name ?? fileName;

      const folderLink = folderMeta.webViewLink ?? "";
      const fileRefs: WorkflowStepOutput["fileRefs"] = folderLink
        ? [
            {
              name: driveFolderDisplayName(folderMeta.label) || "View folder",
              url: folderLink,
              mime: "application/vnd.google-apps.folder",
            },
          ]
        : [];

      const folderNote = folderMeta.created?.length
        ? `Created folder: ${driveFolderDisplayName(folderMeta.label)}`
        : `Folder ready: ${driveFolderDisplayName(folderMeta.label)}`;

      return {
        ok: true,
        output: {
          variableKey,
          label: node.label,
          textPreview: folderLink || folderNote,
          fileRefs,
          deliveryMeta,
        },
      };
    }

    const uploadedRefs: WorkflowStepOutput["fileRefs"] = [];
    let lastFileName = "";
    let lastDriveResult: GoogleDriveDeliveryResult | null = null;

    const targets =
      ctx.executionKind === "gsc_reporting" ||
      ctx.executionKind === "ads_reporting" ||
      resolved.inputMode === "single"
        ? upstreamOutputs.slice(-1)
        : upstreamOutputs;

    const upstreamBlock = await upstreamAgentBlocksDelivery(ctx.workflow.teamId, targets);
    if (upstreamBlock) {
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: `Google Drive: skipped (${upstreamBlock})`,
        status: "error",
        payload: { thenPhase: "upload" },
      });
      return { ok: false, error: upstreamBlock };
    }

    for (const item of targets) {
      const archiveFiles = await loadArchiveFilesFromStepOutput(ctx.workflow.teamId, item, 1);
      const compareLabel = await resolveCompareLabelFromUpstream(ctx.workflow.teamId, item);
      let deliverables: Awaited<ReturnType<typeof resolveDriveUploadDeliverables>>;
      try {
        deliverables = await resolveDriveUploadDeliverables({
          archiveFiles,
          summaryText: item.textPreview?.trim() || summaryText,
          executionKind: ctx.executionKind,
          siteName: siteIdentity.siteName,
          compareLabel,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Google Drive deliverable resolve failed.";
        await logWorkflowThenStepToAgentRun({
          teamId: ctx.workflow.teamId,
          agentRunId: tailAgentRunId,
          node,
          label: `Google Drive: failed (${message})`,
          status: "error",
          payload: { thenPhase: "upload" },
        });
        return { ok: false, error: message };
      }
      if (deliverables.length === 0) continue;

      for (const deliverable of deliverables) {
        await logWorkflowThenStepToAgentRun({
          teamId: ctx.workflow.teamId,
          agentRunId: tailAgentRunId,
          node,
          label: `Google Drive: uploading ${deliverable.fileName}${configSuffix}`,
          payload: {
            thenPhase: "upload",
            fileName: deliverable.fileName,
            folderId: folderMeta.folderId,
            folderUrl: folderMeta.webViewLink,
            folderLabel: folderMeta.label,
          },
        });
        const driveResult = await uploadDeliverableToGoogleDriveIfConfigured({
          teamId: ctx.workflow.teamId,
          executionId: 0,
          contract: enriched,
          deliverable,
          summaryText: item.textPreview?.trim() || summaryText,
          runOk: true,
          siteName: siteIdentity.siteName,
          siteUrl: siteIdentity.siteUrl,
          executionKind: ctx.executionKind,
          resolvedFolder: folderMeta,
          driveFolderContext: {
            outputs: sourceOutputs,
            siteId: ctx.siteId,
            clientSiteIds: ctx.allSiteIds ?? [],
          },
        });
        if (driveResult.googleDriveError) {
          await logWorkflowThenStepToAgentRun({
            teamId: ctx.workflow.teamId,
            agentRunId: tailAgentRunId,
            node,
            label: `Google Drive: failed (${driveResult.googleDriveError})`,
            status: "error",
            payload: { thenPhase: "upload", fileName: deliverable.fileName },
          });
          return { ok: false, error: driveResult.googleDriveError };
        }
        lastFileName = driveResult.googleDriveFileName ?? deliverable.fileName;
        lastDriveResult = driveResult;
        const fileLink =
          driveResult.googleDriveFileWebViewLink?.trim() ||
          driveResult.googleDriveWebViewLink?.trim() ||
          "";
        if (fileLink) {
          uploadedRefs.push({
            name: lastFileName || "Report",
            url: fileLink,
            mime: "application/vnd.google-apps.document",
          });
        }
      }
    }

    if (!lastFileName) {
      const message =
        ctx.executionKind === "gsc_reporting"
          ? "Google Drive upload failed: no GSC report found from upstream agent."
          : ctx.executionKind === "ads_reporting"
            ? "Google Drive upload failed: no PPC report found from upstream agent."
            : "Google Drive upload failed: no deliverable files loaded from upstream agent.";
      await logWorkflowThenStepToAgentRun({
        teamId: ctx.workflow.teamId,
        agentRunId: tailAgentRunId,
        node,
        label: `Google Drive: failed (${message})`,
        status: "error",
        payload: { thenPhase: "upload" },
      });
      return { ok: false, error: message };
    }

    const folderLabel =
      lastDriveResult?.googleDriveFolderLabel?.trim() ||
      folderMeta.label?.trim() ||
      "Folder";
    const folderMonth = driveFolderDisplayName(folderLabel);
    const folderLink =
      lastDriveResult?.googleDriveFolderWebViewLink?.trim() ||
      folderMeta.webViewLink?.trim() ||
      "";
    const fileLink =
      lastDriveResult?.googleDriveFileWebViewLink?.trim() ||
      lastDriveResult?.googleDriveWebViewLink?.trim() ||
      "";

    const uploadedDocNames = uploadedRefs
      .filter((ref) => ref.mime === "application/vnd.google-apps.document")
      .map((ref) => ref.name)
      .filter((name): name is string => Boolean(name));
    const uploadedList = uploadedDocNames.join(", ") || lastFileName;
    await logWorkflowThenStepToAgentRun({
      teamId: ctx.workflow.teamId,
      agentRunId: tailAgentRunId,
      node,
      label: `Google Drive: uploaded ${uploadedList} into ${folderMonth}`,
      payload: {
        thenPhase: "upload_complete",
        fileName: lastFileName,
        fileNames: uploadedDocNames,
        folderUrl: folderMeta.webViewLink,
        folderId: folderMeta.folderId,
        folderLabel,
      },
    });

    if (folderLink) {
      uploadedRefs.push({
        name: folderMonth,
        url: folderLink,
        mime: "application/vnd.google-apps.folder",
      });
    }

    deliveryMeta.googleDriveUrl = fileLink || undefined;
    deliveryMeta.googleDriveFileName = lastFileName;
    deliveryMeta.googleDriveFolderUrl = folderLink || undefined;
    deliveryMeta.googleDriveFolderLabel = folderLabel;
    deliveryMeta.googleDriveTargetFolderId =
      lastDriveResult?.googleDriveTargetFolderId ?? folderMeta.folderId;
    return {
      ok: true,
      output: {
        variableKey,
        label: node.label,
        textPreview: fileLink || folderLink || `Uploaded ${lastFileName} into ${folderMonth}`,
        fileRefs: uploadedRefs,
        agentRunId: upstream?.agentRunId,
        deliveryMeta,
      },
    };
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
