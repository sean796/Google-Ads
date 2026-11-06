import { buildAutomationEmailIntro } from "@/lib/automation-email-intro";
import { reportPeriodFromMarkdownHeading } from "@/lib/gsc-reporting/gsc-reporting-document-title";
import { sanitizeGoogleDriveDocumentTitle } from "@/lib/gsc-reporting/gsc-reporting-drive-document-title";
import {
  formatGscMeetingScriptMarkdown,
  gscMeetingScriptFile,
} from "@/lib/gsc-reporting/gsc-reporting-meeting-script-markdown";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import type {
  ResolvedPrimaryDeliverable,
  ResolveDriveUploadDeliverablesInput,
  ResolvePrimaryDeliverableOptions,
} from "@/lib/automation-google-drive-delivery-types";

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

export function isGscMeetingNotesDeliverable(fileName: string): boolean {
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
