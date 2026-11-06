import { generateAdsReportingDriveDocumentTitle } from "@/lib/ads-reporting/ads-reporting-document-title";
import {
  generateGscReportingDriveDocumentTitle,
} from "@/lib/gsc-reporting/gsc-reporting-drive-document-title";
import { embedGscSparklinesInDeliverables } from "@/lib/gsc-reporting/gsc-reporting-drive-sparklines";
import {
  driveFolderBelongsToClient,
  driveFolderDisplayName,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import type {
  ResolveGoogleDriveFolderContext,
  ResolvedGoogleDriveFolder,
} from "@/lib/google-drive/resolve-google-drive-folder";
import {
  uploadDeliverableToDrive,
  type UploadDeliverableToDriveResult,
} from "@/lib/google-drive/upload-deliverable-to-drive";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";
import { inferAutomationDeliveryStepKey } from "@/lib/workflow/automation-delivery-log";
import {
  isGscMeetingNotesDeliverable,
  resolveDriveUploadDeliverables,
} from "@/lib/automation-google-drive-deliverable";
import {
  enrichGoogleDriveContractFromSite,
  readConfiguredGoogleDriveTargetFolder,
  resolveGoogleDriveTargetFolder,
} from "@/lib/automation-google-drive-folder";
import type {
  DriveStepStatus,
  GoogleDriveDeliveryResult,
  ReportingGoogleDriveExecutionKind,
  ResolvedPrimaryDeliverable,
  ResolveDriveUploadDeliverablesInput,
  ResolvePrimaryDeliverableOptions,
} from "@/lib/automation-google-drive-delivery-types";

export type {
  GoogleDriveDeliveryResult,
  ReportingGoogleDriveExecutionKind,
  ResolvedPrimaryDeliverable,
  ResolveDriveUploadDeliverablesInput,
  ResolvePrimaryDeliverableOptions,
};
export { resolveDriveUploadDeliverables };
export {
  normalizeWorkflowDriveContract,
  readConfiguredGoogleDriveTargetFolder,
  resolveGoogleDriveTargetFolder,
  enrichGoogleDriveContractFromSite,
} from "@/lib/automation-google-drive-folder";
export {
  resolvePrimaryDeliverable,
} from "@/lib/automation-google-drive-deliverable";


/** Upload the generated SEO/PPC report markdown as a Google Doc into the resolved month folder. */
export async function uploadReportingMarkdownToGoogleDriveFolder(args: {
  folderId: string;
  siteName: string;
  markdown: string;
  executionKind: ReportingGoogleDriveExecutionKind;
}): Promise<UploadDeliverableToDriveResult> {
  const markdown = args.markdown.trim();
  if (!markdown) {
    return { success: false, error: "Generate a report before uploading to Google Drive." };
  }
  const siteName = args.siteName.trim();
  let fileName: string;
  try {
    fileName =
      args.executionKind === "ads_reporting"
        ? await generateAdsReportingDriveDocumentTitle({ siteName, markdown })
        : await generateGscReportingDriveDocumentTitle({ siteName, markdown });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drive document title failed.";
    return { success: false, error: message };
  }
  return uploadDeliverableToDrive({
    fileName,
    content: markdown,
    folderId: args.folderId,
    mime: "text/markdown",
    convertToGoogleDoc: true,
  });
}

export async function uploadDeliverableToGoogleDriveIfConfigured(args: {
  teamId: number;
  executionId: number;
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  archiveFiles?: TaskArchiveFileInput[];
  summaryText: string;
  fileNameHint?: string;
  runOk?: boolean;
  siteName?: string;
  siteUrl?: string;
  executionKind?: string;
  driveFolderContext?: ResolveGoogleDriveFolderContext;
  resolvedFolder?: ResolvedGoogleDriveFolder | null;
  deliverable?: ResolvedPrimaryDeliverable | null;
  compareLabel?: string;
  comparePreset?: "mom" | "yoy";
  onStep?: (
    label: string,
    status?: DriveStepStatus,
    resumePayload?: Record<string, unknown>,
    stepKey?: string,
  ) => void | Promise<void>;
}): Promise<GoogleDriveDeliveryResult> {
  const reportStep = async (label: string, status: DriveStepStatus = "running") => {
    const stepKey = inferAutomationDeliveryStepKey(label, status);
    await args.onStep?.(label, status, { phase: "automation_delivery" }, stepKey);
  };

  if (args.runOk === false) {
    await reportStep("Google Drive skipped (run failed)", "error");
    return {
      googleDriveSkipped: true,
      googleDriveSkipReason: "Run did not complete successfully.",
    };
  }

  const contract = enrichGoogleDriveContractFromSite(
    args.contract as TaskExecutionClientRunContract,
    String(args.siteName ?? "").trim(),
    args.siteUrl,
  );
  if (!contract.saveToGoogleDrive) {
    return {
      googleDriveSkipped: true,
      googleDriveSkipReason: "saveToGoogleDrive not set on run contract.",
    };
  }

  const configured = readConfiguredGoogleDriveTargetFolder(contract, args.siteName);
  const resolvedForClient =
    args.resolvedFolder &&
    (!String(args.siteName ?? "").trim() ||
      driveFolderBelongsToClient(args.resolvedFolder.label, String(args.siteName ?? "").trim()))
      ? args.resolvedFolder
      : null;
  const folder =
    resolvedForClient ??
    configured ??
    (await resolveGoogleDriveTargetFolder({
      contract,
      siteName: args.siteName,
      siteUrl: args.siteUrl,
      executionKind: args.executionKind,
      context: args.driveFolderContext,
    }));
  if (!folder) {
    await reportStep("Google Drive failed (folder required)", "error");
    return { googleDriveError: "Google Drive folder is required." };
  }

  const usingPresetFolder = Boolean(resolvedForClient?.folderId || configured?.folderId);
  await reportStep(
    usingPresetFolder
      ? `Google Drive: using folder (${folder.label})`
      : `Google Drive: resolving folder (${folder.label})`,
    "running",
  );

  let deliverables = args.deliverable
    ? [args.deliverable]
    : await resolveDriveUploadDeliverables({
        archiveFiles: args.archiveFiles,
        summaryText: args.summaryText,
        fileNameHint: args.fileNameHint,
        executionKind: args.executionKind,
        siteName: args.siteName,
        compareLabel: args.compareLabel,
        comparePreset: args.comparePreset,
      });
  if (
    args.executionKind === "gsc_reporting" &&
    deliverables.length > 0 &&
    args.archiveFiles?.some((f) => f.fileName.startsWith("gsc-sparkline-"))
  ) {
    deliverables = await embedGscSparklinesInDeliverables({
      deliverables,
      archiveFiles: args.archiveFiles,
      folderId: folder.folderId,
    });
  }
  if (deliverables.length === 0) {
    await reportStep("Google Drive: failed (no deliverable)", "error");
    return { googleDriveError: "No deliverable content available to upload." };
  }

  const folderLink = folder.webViewLink?.trim() ?? "";
  const folderMonth = driveFolderDisplayName(folder.label ?? "");
  let lastFileName = "";
  let lastFileLink = "";
  let lastFileId: string | undefined;

  for (const deliverable of deliverables) {
    let uploadFileName: string;
    if (
      (args.executionKind === "gsc_reporting" || args.executionKind === "ads_reporting") &&
      deliverable.content.trim() &&
      !isGscMeetingNotesDeliverable(deliverable.fileName)
    ) {
      try {
        uploadFileName =
          args.executionKind === "ads_reporting"
            ? await generateAdsReportingDriveDocumentTitle({
                siteName: String(args.siteName ?? "").trim(),
                markdown: deliverable.content,
              })
            : await generateGscReportingDriveDocumentTitle({
                siteName: String(args.siteName ?? "").trim(),
                markdown: deliverable.content,
              });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive title failed.";
        await reportStep(`Google Drive: failed (${message})`, "error");
        return { googleDriveError: message };
      }
    } else {
      uploadFileName = deliverable.fileName;
    }

    await reportStep(`Google Drive: uploading ${uploadFileName}`, "running");
    if (args.executionId > 0) {
      await patchTaskExecutionProgress(args.teamId, args.executionId, {
        message: "Uploading to Google Drive…",
        progress: 0.98,
      });
    }

    const upload = await uploadDeliverableToDrive({
      fileName: uploadFileName,
      content: deliverable.content,
      folderId: folder.folderId,
      mime: deliverable.mime,
      convertToGoogleDoc: deliverable.convertToGoogleDoc,
    });

    if (!upload.success || !upload.webViewLink) {
      const message = upload.error ?? "Google Drive upload failed.";
      await reportStep(`Google Drive: failed (${message})`, "error");
      return { googleDriveError: message };
    }

    lastFileName = upload.name ?? uploadFileName;
    lastFileLink = upload.webViewLink.trim();
    lastFileId = upload.fileId;
    await reportStep(`Google Drive: uploaded ${lastFileName} into ${folderMonth}`, "done");
  }

  return {
    googleDriveWebViewLink: lastFileLink || undefined,
    googleDriveFileWebViewLink: lastFileLink || undefined,
    googleDriveFileId: lastFileId,
    googleDriveFileName: lastFileName || undefined,
    googleDriveFolderWebViewLink: folderLink || undefined,
    googleDriveFolderLabel: folder.label?.trim() || undefined,
    googleDriveTargetFolderId: folder.folderId,
    googleDriveFoldersCreated: folder.created,
  };
}
