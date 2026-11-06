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
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { uploadDeliverableToDrive } from "@/lib/google-drive/upload-deliverable-to-drive";
import { loadArchiveFilesFromStepOutput } from "@/lib/workflow/workflow-then-deliverable-loader";
import {
  formatThenConfigSuffix,
  logWorkflowThenStepToAgentRun,
} from "@/lib/workflow/workflow-agent-tail-log";
import type { ResolvedThenConfig } from "@/lib/workflow/workflow-then-aggregate";
import type {
  WorkflowNode,
  WorkflowStepDeliveryMeta,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import {
  buildGoogleDriveStepTestFile,
  buildThenContract,
  deliveryFolderIsMonthLeaf,
  resolveCompareLabelFromUpstream,
  resolveThenSiteIdentity,
  upstreamAgentBlocksDelivery,
  type WorkflowThenRunContext,
  type WorkflowThenStepResult,
} from "@/lib/workflow/workflow-then-runner-helpers";

export type WorkflowThenGoogleDriveStepArgs = {
  node: WorkflowNode;
  ctx: WorkflowThenRunContext;
  upstreamOutputs: WorkflowStepOutput[];
  upstream: WorkflowStepOutput | null;
  tailAgentRunId: number | null;
  payload: TaskExecutionPayload;
  resolved: ResolvedThenConfig;
  sourceOutputs: WorkflowStepOutput[];
  summaryText: string;
  deliveryMeta: WorkflowStepDeliveryMeta;
  variableKey: string;
};

export async function executeWorkflowThenGoogleDriveStep(
  args: WorkflowThenGoogleDriveStepArgs,
): Promise<WorkflowThenStepResult> {
  const {
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
  } = args;
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

  return { ok: true };
}
