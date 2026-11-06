import { useCallback, useMemo } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_COULD_NOT_COPY, NOTIFY_GENERATE_REPORT_FIRST, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR } from "@/lib/notify-messages";
import { downloadCompetitorBulkContentCsv } from "@/lib/competitor-research/competitor-bulk-content-csv";
import { filterCompetitorResearchBySelection } from "@/lib/competitor-research/competitor-selection-filter";
import type { CompetitorReportSectionIndex } from "@/lib/competitor-research/competitor-report-system-prompt";
import { safeDomainForFilename } from "@/components/research/competitor/competitor-research-tab-helpers";
import type { CompetitorResearchState } from "@/components/research/competitor/use-competitor-research-state";

export function useCompetitorReportDownloads(s: CompetitorResearchState) {
  const {
    neutralResearchWire,
    semrushData,
    site,
    keywordsMd,
    reportMd,
    reportOpenRouterStats,
    strategistSectionDrafts,
    selectedCompetitorKeys,
  } = s;
const reportDownloadSlug = useMemo(() => {
  if (neutralResearchWire && semrushData?.seedDomain) {
    return safeDomainForFilename(semrushData.seedDomain);
  }
  return (site?.name || "site").replace(/\s+/g, "-");
}, [neutralResearchWire, semrushData?.seedDomain, site?.name]);

/** Clipboard: Keywords They Own + strategist report, separated by --- (only sections that exist). */
const copyMarkdownBundle = useCallback(async () => {
  const parts: string[] = [];
  if (keywordsMd?.trim()) {
    parts.push(`## Keywords They Own (Semrush clusters)\n\n${keywordsMd.trim()}`);
  }
  if (reportMd?.trim()) {
    parts.push(`## Strategist report\n\n${reportMd.trim()}`);
  }
  if (parts.length === 0) {
    notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
    return;
  }
  try {
    await navigator.clipboard.writeText(parts.join("\n\n---\n\n"));
    notify.success(
      parts.length === 2 ? "Both Markdown documents copied (one clipboard, separated by ---)." : "Markdown copied.",
    );
  } catch {
    notify.error(NOTIFY_COULD_NOT_COPY);
  }
}, [keywordsMd, reportMd]);

/** Two separate .md downloads when both exist; one file if only one document is available. */
const downloadMarkdownBundle = useCallback(() => {
  const slug = reportDownloadSlug;
  const ts = Date.now();
  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const hasKw = Boolean(keywordsMd?.trim());
  const hasReport = Boolean(reportMd?.trim());
  if (!hasKw && !hasReport) {
    notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
    return;
  }
  if (hasKw) {
    downloadFile(keywordsMd!.trim(), `competitor-keywords-they-own-${slug}-${ts}.md`);
  }
  if (hasReport) {
    const run = () => downloadFile(reportMd!.trim(), `competitor-strategist-report-${slug}-${ts}.md`);
    if (hasKw) setTimeout(run, 250);
    else run();
  }
  notify.success(hasKw && hasReport ? "Downloaded 2 Markdown files." : "Downloaded 1 Markdown file.");
}, [keywordsMd, reportMd, reportDownloadSlug]);

const downloadOpenRouterRequestJson = useCallback(() => {
  const raw = reportOpenRouterStats?.requestBodyJson;
  if (!raw) return;
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `openrouter-competitor-report-request-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}, [reportOpenRouterStats?.requestBodyJson]);

const downloadStrategistSectionMarkdown = useCallback(
  (section: CompetitorReportSectionIndex) => {
    const md = strategistSectionDrafts[section]?.markdown?.trim();
    if (!md) return;
    const slug = safeDomainForFilename(reportDownloadSlug || "report");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `competitor-strategist-section-${section}-${slug}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  },
  [strategistSectionDrafts, reportDownloadSlug],
);

const downloadStrategistSectionPostJson = useCallback(
  (section: CompetitorReportSectionIndex) => {
    const raw = strategistSectionDrafts[section]?.requestBodyJson;
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openrouter-competitor-report-section-${section}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  [strategistSectionDrafts],
);

const downloadBulkContentCsv = useCallback(() => {
  if (!semrushData) {
    notify.error(NOTIFY_RUN_ANALYZE_FIRST);
    return;
  }
  if (!reportMd?.trim()) {
    notify.error(NOTIFY_GENERATE_REPORT_FIRST);
    return;
  }
  if (selectedCompetitorKeys.size === 0) {
    notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
    return;
  }
  const sr = filterCompetitorResearchBySelection(semrushData, selectedCompetitorKeys);
  if (!sr.rows.length) {
    notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
    return;
  }
  downloadCompetitorBulkContentCsv({
    siteName:
      neutralResearchWire && semrushData?.seedDomain
        ? semrushData.seedDomain
        : site?.name?.trim() || "Site",
    semrush: sr,
    reportMd,
    keywordsMd,
  });
}, [semrushData, site?.name, selectedCompetitorKeys, reportMd, keywordsMd, neutralResearchWire]);
  return { copyMarkdownBundle, downloadMarkdownBundle, downloadOpenRouterRequestJson, downloadStrategistSectionMarkdown, downloadStrategistSectionPostJson, downloadBulkContentCsv };
}
