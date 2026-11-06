import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import {
  formatGoogleDriveFolderUrl,
  parseGoogleDriveFolderId,
  suggestPresetForSiteName,
} from "@/lib/google-drive/google-drive-folder-presets";
import {
  driveFolderBelongsToClient,
  driveFolderDisplayName,
  resolveWorkflowDriveFolderPath,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import {
  resolveGoogleDriveFolderWithFallback,
  type ResolveGoogleDriveFolderContext,
  type ResolvedGoogleDriveFolder,
} from "@/lib/google-drive/resolve-google-drive-folder";
import {
  uploadDeliverableToDrive,
  type UploadDeliverableToDriveResult,
} from "@/lib/google-drive/upload-deliverable-to-drive";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";
import { inferAutomationDeliveryStepKey } from "@/lib/workflow/automation-delivery-log";
import { generateAdsReportingDriveDocumentTitle } from "@/lib/ads-reporting/ads-reporting-document-title";
import { generateGscReportingDriveDocumentTitle, sanitizeGoogleDriveDocumentTitle } from "@/lib/gsc-reporting/gsc-reporting-drive-document-title";
import { reportPeriodFromMarkdownHeading } from "@/lib/gsc-reporting/gsc-reporting-document-title";
import {
  formatGscMeetingScriptMarkdown,
  gscMeetingScriptFile,
} from "@/lib/gsc-reporting/gsc-reporting-meeting-script-markdown";
import { buildAutomationEmailIntro } from "@/lib/automation-email-intro";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { embedGscSparklinesInDeliverables } from "@/lib/gsc-reporting/gsc-reporting-drive-sparklines";

export type GoogleDriveDeliveryResult = {
  /** Uploaded file (Google Doc) view link. */
  googleDriveWebViewLink?: string;
  googleDriveFileWebViewLink?: string;
  googleDriveFileId?: string;
  googleDriveFileName?: string;
  googleDriveFolderWebViewLink?: string;
  googleDriveFolderLabel?: string;
  googleDriveTargetFolderId?: string;
  googleDriveFoldersCreated?: string[];
  googleDriveError?: string;
  googleDriveSkipped?: boolean;
  googleDriveSkipReason?: string;
};

type DriveStepStatus = "running" | "done" | "error";

export type ResolvedPrimaryDeliverable = {
  fileName: string;
  content: string;
  mime: string;
  convertToGoogleDoc: boolean;
};

function isMarkdownFile(file: TaskArchiveFileInput): boolean {
  const name = file.fileName.toLowerCase();
  return file.mime === "text/markdown" || name.endsWith(".md");
}

function isCsvFile(file: TaskArchiveFileInput): boolean {
  const name = file.fileName.toLowerCase();
  return file.mime === "text/csv" || name.endsWith(".csv");
}

function isFinalReportName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.includes("final-report") || lower.includes("gsc-report");
}

function isExcludedDeliverableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("automation")) return true;
  if (lower.includes("agent-run") && lower.includes("log")) return true;
  if (lower.includes("session-log") || lower.includes("session_log")) return true;
  if (lower.endsWith("-log.json") || lower.endsWith("-log.md")) return true;
  return false;
}

function isGscReportMarkdown(file: TaskArchiveFileInput): boolean {
  const lower = file.fileName.toLowerCase();
  if (!lower.includes("gsc-report") && !lower.includes("ppc-report")) return false;
  if (lower.endsWith(".md")) return true;
  return file.mime === "text/markdown" && Boolean(file.content.trim());
}

function isGscMeetingNotesMarkdown(file: TaskArchiveFileInput): boolean {
  const lower = file.fileName.toLowerCase();
  if (!lower.includes("meeting-notes") && !lower.includes("meeting notes")) return false;
  if (lower.endsWith(".md")) return true;
  return file.mime === "text/markdown" && Boolean(file.content.trim());
}

function isGscMeetingNotesDeliverable(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.includes("meeting-notes") || lower.includes("meeting notes");
}

function gscComparePresetFromFiles(
  files: TaskArchiveFileInput[],
  comparePreset?: "mom" | "yoy",
): "mom" | "yoy" {
  if (comparePreset === "yoy" || comparePreset === "mom") return comparePreset;
  const names = files.map((file) => file.fileName.toLowerCase()).join(" ");
  return names.includes("-yoy-") || names.includes("_yoy_") ? "yoy" : "mom";
}

function markdownDocDeliverable(fileName: string, content: string): ResolvedPrimaryDeliverable {
  return {
    fileName: fileName.replace(/\.md$/i, ""),
    content,
    mime: "text/markdown",
    convertToGoogleDoc: true,
  };
}

function gscMeetingNotesDriveTitle(siteName: string, reportMarkdown: string): string {
  const client = siteName.trim() || "Client";
  const period = reportPeriodFromMarkdownHeading(reportMarkdown);
  return sanitizeGoogleDriveDocumentTitle(
    period ? `${client} - Meeting notes - ${period}` : `${client} - Meeting notes`,
  );
}

function usableArchiveFiles(archiveFiles: TaskArchiveFileInput[] | undefined): TaskArchiveFileInput[] {
  return (archiveFiles ?? []).filter(
    (file) =>
      file.fileName.trim() &&
      file.content.trim() &&
      !isExcludedDeliverableFile(file.fileName),
  );
}

export type ResolvePrimaryDeliverableOptions = {
  executionKind?: string;
  reportOnly?: boolean;
};

export function normalizeWorkflowDriveContract(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  executionKind?: string,
): TaskExecutionClientRunContract {
  const typed = contract as TaskExecutionClientRunContract;
  return {
    ...typed,
    saveToGoogleDrive: true,
    googleDriveFolderSource: "path",
    googleDriveFolderPath: resolveWorkflowDriveFolderPath(typed, executionKind),
    googleDriveFolderId: "",
    googleDrivePresetKey: "",
    googleDriveTargetFolderId: "",
  };
}

export function resolvePrimaryDeliverable(
  archiveFiles: TaskArchiveFileInput[] | undefined,
  summaryText: string,
  fileNameHint?: string,
  options?: ResolvePrimaryDeliverableOptions,
): ResolvedPrimaryDeliverable | null {
  const executionKind = String(options?.executionKind ?? "").trim();
  const reportOnly = options?.reportOnly === true || executionKind === "gsc_reporting" || executionKind === "ads_reporting";
  const files = (archiveFiles ?? []).filter(
    (file) =>
      file.fileName.trim() &&
      file.content.trim() &&
      !isExcludedDeliverableFile(file.fileName),
  );

  if (executionKind === "gsc_reporting" || reportOnly) {
    const gscReport = files.find((file) => isGscReportMarkdown(file));
    if (gscReport) {
      return {
        fileName: gscReport.fileName.replace(/\.md$/i, ""),
        content: gscReport.content,
        mime: "text/markdown",
        convertToGoogleDoc: true,
      };
    }
    return null;
  }

  const finalReport = files.find((file) => isFinalReportName(file.fileName) && isMarkdownFile(file));
  if (finalReport) {
    return {
      fileName: finalReport.fileName.replace(/\.md$/i, ""),
      content: finalReport.content,
      mime: "text/markdown",
      convertToGoogleDoc: true,
    };
  }

  const markdown = files.find((file) => isMarkdownFile(file));
  if (markdown) {
    return {
      fileName: markdown.fileName.replace(/\.md$/i, ""),
      content: markdown.content,
      mime: "text/markdown",
      convertToGoogleDoc: true,
    };
  }

  const csv = files.find((file) => isCsvFile(file));
  if (csv) {
    return {
      fileName: csv.fileName,
      content: csv.content,
      mime: "text/csv",
      convertToGoogleDoc: false,
    };
  }

  const textFile = files.find((file) => file.mime.startsWith("text/") || file.mime === "application/json");
  if (textFile) {
    const asDoc = textFile.mime !== "text/csv";
    return {
      fileName: textFile.fileName.replace(/\.[^.]+$/, ""),
      content: textFile.content,
      mime: textFile.mime,
      convertToGoogleDoc: asDoc,
    };
  }

  const summary = summaryText.trim();
  if (summary && !reportOnly) {
    const baseName = (fileNameHint ?? "Automation deliverable").trim() || "Automation deliverable";
    return {
      fileName: baseName,
      content: summary,
      mime: "text/plain",
      convertToGoogleDoc: true,
    };
  }

  return null;
}

export type ResolveDriveUploadDeliverablesInput = {
  archiveFiles?: TaskArchiveFileInput[];
  summaryText: string;
  fileNameHint?: string;
  executionKind?: string;
  siteName?: string;
  compareLabel?: string;
  comparePreset?: "mom" | "yoy";
};

async function buildGscMeetingNotesDeliverable(args: {
  report: TaskArchiveFileInput;
  siteName: string;
  compareLabel?: string;
  comparePreset?: "mom" | "yoy";
  files: TaskArchiveFileInput[];
}): Promise<ResolvedPrimaryDeliverable> {
  const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required to build GSC meeting notes for Google Drive.");
  }
  const intro = await buildAutomationEmailIntro({
    apiKey,
    executionKind: "gsc_reporting",
    siteName: args.siteName,
    automationTitle: "GSC report",
    summaryText: args.report.content,
    compareLabel: args.compareLabel,
  });
  const comparePreset = gscComparePresetFromFiles([args.report, ...args.files], args.comparePreset);
  const markdown = formatGscMeetingScriptMarkdown({
    siteName: args.siteName,
    compareLabel: args.compareLabel,
    comparePreset,
    highlights: intro.highlights,
    talkingPoints: intro.talkingPoints ?? intro.highlights,
    clientQuestions: intro.clientQuestions ?? [],
  });
  const file = gscMeetingScriptFile({
    siteName: args.siteName,
    comparePreset,
    content: markdown,
  });
  return markdownDocDeliverable(
    gscMeetingNotesDriveTitle(args.siteName, args.report.content),
    file.content,
  );
}

/** Final Google Drive docs: meeting notes and the GSC report. No CSVs or working files. */
export async function resolveDriveUploadDeliverables(
  input: ResolveDriveUploadDeliverablesInput,
): Promise<ResolvedPrimaryDeliverable[]> {
  const executionKind = String(input.executionKind ?? "").trim();
  const files = usableArchiveFiles(input.archiveFiles);

  if (executionKind === "ads_reporting") {
    const report = files.find((file) => isGscReportMarkdown(file));
    if (!report) return [];
    return [markdownDocDeliverable(report.fileName, report.content)];
  }

  if (executionKind === "gsc_reporting") {
    const report = files.find((file) => isGscReportMarkdown(file));
    if (!report) return [];
    const siteName = String(input.siteName ?? "").trim();
    const existingNotes = files.find((file) => isGscMeetingNotesMarkdown(file));
    const reportDoc = markdownDocDeliverable(report.fileName, report.content);
    const notes = existingNotes
      ? markdownDocDeliverable(
          gscMeetingNotesDriveTitle(siteName, report.content),
          existingNotes.content,
        )
      : await buildGscMeetingNotesDeliverable({
          report,
          siteName,
          compareLabel: input.compareLabel,
          comparePreset: input.comparePreset,
          files,
        });
    return [notes, reportDoc];
  }

  const one = resolvePrimaryDeliverable(
    input.archiveFiles,
    input.summaryText,
    input.fileNameHint,
    { executionKind },
  );
  return one ? [one] : [];
}

export function readConfiguredGoogleDriveTargetFolder(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  siteName?: string,
): ResolvedGoogleDriveFolder | null {
  const typed = contract as TaskExecutionClientRunContract;
  const source = String(typed.googleDriveFolderSource ?? "").trim();
  if (source !== "manual") return null;
  const targetId = parseGoogleDriveFolderId(String(typed.googleDriveTargetFolderId ?? ""));
  if (!targetId) return null;
  const label = String(typed.googleDriveFolderLabel ?? "").trim() || "Google Drive folder";
  const want = String(siteName ?? "").trim();
  if (want && !driveFolderBelongsToClient(label, want)) return null;
  return {
    folderId: targetId,
    label,
    webViewLink: formatGoogleDriveFolderUrl(targetId),
  };
}

export async function resolveGoogleDriveTargetFolder(args: {
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  siteName?: string;
  siteUrl?: string;
  executionKind?: string;
  context?: ResolveGoogleDriveFolderContext;
}): Promise<ResolvedGoogleDriveFolder | null> {
  const enriched = enrichGoogleDriveContractFromSite(
    args.contract,
    args.siteName ?? "",
    args.siteUrl,
  );
  const configured = readConfiguredGoogleDriveTargetFolder(enriched, args.siteName);
  if (configured) return configured;
  return resolveGoogleDriveFolderWithFallback({
    contract: enriched,
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    executionKind: args.executionKind,
    context: args.context,
  });
}

export function enrichGoogleDriveContractFromSite(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  siteName: string,
  siteUrl?: string,
): TaskExecutionClientRunContract {
  const typed = contract as TaskExecutionClientRunContract;
  if (typed.saveToGoogleDrive !== true) return typed;

  const suggested = suggestPresetForSiteName(siteName, siteUrl);
  if (!suggested) return typed;

  const source = String(typed.googleDriveFolderSource ?? "manual").trim();
  const patch: Partial<TaskExecutionClientRunContract> = {};

  if (!String(typed.googleDrivePresetKey ?? "").trim()) {
    patch.googleDrivePresetKey = suggested.id;
    patch.googleDriveFolderLabel = suggested.label;
  }

  if (source === "path" || source === "client_root") {
    if (!String(typed.googleDriveFolderPath ?? "").trim()) {
      patch.googleDriveFolderPath = "reporting";
    }
    return { ...typed, ...patch };
  }

  if (!String(typed.googleDriveFolderId ?? "").trim()) {
    patch.googleDriveFolderId = suggested.folderId;
  }
  return { ...typed, ...patch };
}

export type ReportingGoogleDriveExecutionKind = "gsc_reporting" | "ads_reporting";

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
