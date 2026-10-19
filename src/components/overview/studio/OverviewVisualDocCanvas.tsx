import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  History,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import {
  type MetaBulkMicroSnapshot,
} from "@/components/overview/OverviewBulkMicroProgress";
import type { OverviewRow, RowStatus } from "@/components/overview/overview-meta-row-types";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { OverviewDocSectionBlocks } from "@/components/overview/studio/OverviewDocSectionBlock";
import {
  resolveSerpBriefDownloadable,
  type BulkDetailsDownloadable,
} from "@/components/shared/bulk-details-tile-sections";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { buildWordBlacklistDownloadText } from "@/lib/content-word-blocklist";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { runAutoSeoMetaAndFaqFinale } from "@/lib/overview/overview-auto-seo-meta-faq-finale";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";
import { clearOverviewStudioRevisions } from "@/lib/overview/studio-doc-revisions-store";
import { notify } from "@/lib/app-notifications";
import {
  generatedFilesForUrl,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { buildElementorPageHtml } from "@/lib/elementor-page-content/elementor-page-html";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { resolveAiseoHarnessSourceHtmlFromCache } from "@/lib/overview/overview-aiseo-source-html";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import {
  extractAnswerSectionHtml,
  extractOverviewSectionHtml,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import {
  isOverviewRowOptimizationActive,
} from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import {
  rewriteBlogLeadSectionBlock,
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
  stitchOverviewBlogPostHtml,
} from "@/lib/overview/overview-blog-passage-sections";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { extractFaqFromPostHtml } from "@/lib/overview/overview-row-scrape";
import {
  metaDisplayTitle,
  overviewRowUrlPathLabel,
  overviewTitlePrimarySegment,
} from "@/lib/overview/overview-tab-display";
import { setStudioDocMetaInspectorBridge } from "@/lib/overview/studio-doc-meta-bridge";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import { cn } from "@/lib/utils";

export interface OverviewVisualDocCanvasProps {
  ctrl: OverviewTabController;
  row: OverviewRow | null;
  rowIndex: number;
  bulkWorkspaceBusy: boolean;
  bulkMicroSnapshot?: MetaBulkMicroSnapshot | null;
  batchBulkState?: BulkOptimizationState;
  optimizingRowUrl?: string | null;
  onInFlightAutoSeoUrlChange?: (url: string | null) => void;
  onOpenRevisions?: () => void;
  bulkGeneratorStudioActions?: {
    onGenerateContent: () => void;
    canGenerateContent: boolean;
  };
  bulkGeneratorDetailsPanel?: BulkGeneratorDetailsPanelProps;
  bulkGeneratedFilesPanelId?: string;
  bulkGeneratedFilesStepTotal?: number;
  bulkGeneratedFilesStepCompleted?: number;
  bulkGeneratorBand2Toolbar?: ReactNode;
  studioBody?: ReactNode;
}

type StudioDrawerStepRow = {
  id: string;
  title: string;
  anchorId?: string;
  isActive: boolean;
  isDone: boolean;
  downloadFile?: BulkDetailsDownloadable | null;
};

function sanitizeFileSlug(text: string): string {
  return text.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "section";
}

function triggerBlobDownload(file: BulkDetailsDownloadable) {
  const blob = new Blob([file.content], { type: file.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ROW_STATUS_LABELS: Partial<Record<RowStatus, { label: string; pct: number }>> = {
  uploading: { label: "Uploading to WordPress", pct: 90 },
  "research-faq": { label: "SERP Research Brief (DataForSEO + GSC + Semrush)", pct: 25 },
  "ai-focus-kw": { label: "Deriving Focus Keyword", pct: 40 },
  "ai-title": { label: "Optimizing SEO Title", pct: 55 },
  "ai-meta": { label: "Optimizing Meta Description", pct: 70 },
  "ai-url": { label: "Optimizing URL Slug", pct: 60 },
  "ai-faq": { label: "Generating ACF FAQ & Schema Pairs", pct: 85 },
  "ai-headers": { label: "Optimizing Section Headers", pct: 65 },
  "ai-links": { label: "Weaving Contextual Internal Links", pct: 70 },
  "ai-wikipedia-link": { label: "Resolving & Inserting Wikipedia Citation", pct: 70 },
  "ai-answer": { label: "Writing Direct Answer Section", pct: 65 },
  "ai-overview": { label: "Writing Overview & Jump Citations", pct: 70 },
  "ai-scenario": { label: "Writing Illustrative Buyer Scenario", pct: 75 },
  "ai-in-content-image": { label: "Generating Section Image", pct: 75 },
  "content-cleanup": { label: "Cleaning HTML", pct: 65 },
};

export function OverviewVisualDocCanvas({
  ctrl: c,
  row,
  rowIndex,
  bulkWorkspaceBusy,
  bulkMicroSnapshot,
  batchBulkState,
  optimizingRowUrl,
  onInFlightAutoSeoUrlChange,
  onOpenRevisions,
  bulkGeneratorStudioActions,
  bulkGeneratorDetailsPanel,
  bulkGeneratedFilesPanelId = "bulk-generator-generated-files-panel",
  bulkGeneratedFilesStepTotal = 0,
  bulkGeneratedFilesStepCompleted = 0,
  bulkGeneratorBand2Toolbar,
  studioBody,
}: OverviewVisualDocCanvasProps) {
  const isBulkGeneratorStudio = Boolean(bulkGeneratorStudioActions);
  const hasRow = Boolean(row && rowIndex >= 0);
  const { setSidebarOpen, setSidebarPanel } = useAgentRunsContext();
  const autoScrapedUrlsRef = useRef<Set<string>>(new Set());
  const [fullAutoRunning, setFullAutoRunning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [passageStatus, setPassageStatus] = useState<{
    label: string;
    current: number;
    total: number;
  } | null>(null);

  const isElementorRow = Boolean(
    row &&
      (c.sitemapSource === "pages" ||
        row.contentFormat === "elementor" ||
        Boolean(row.elementorDataJson?.trim())),
  );

  const bodyHtml = useMemo(() => {
    if (!row) return "";
    const liveHtml = row.postContentOptimized?.trim() || row.postContent?.trim() || "";
    const optimizingThisRow = isOverviewRowOptimizationActive(row.url, optimizingRowUrl);

    if (isBulkGeneratorStudio) {
      return liveHtml;
    }

    if (isElementorRow) {
      if (optimizingThisRow && liveHtml) return liveHtml;
      if (row.elementorDataJson?.trim()) {
        return buildElementorPageHtml(row.elementorDataJson);
      }
      return liveHtml;
    }

    if (optimizingThisRow && liveHtml) {
      return liveHtml;
    }

    if (c.site) {
      return resolveAiseoHarnessSourceHtmlFromCache({
        row,
        site: c.site,
        sitemapSource: c.sitemapSource,
        getInventoryMatchForUrl: c.getInventoryMatchForUrl,
      });
    }
    return liveHtml;
  }, [
    row,
    isElementorRow,
    optimizingRowUrl,
    c.site,
    c.sitemapSource,
    c.getInventoryMatchForUrl,
  ]);

  const siteId = c.site?.id ?? "";
  const batchKey = siteId ? `${siteId}-batch` : "";
  const activeBatchState =
    batchBulkState ?? (batchKey ? c.opt.bulkOptimizationState[batchKey] : undefined);
  const singleProgress = siteId ? c.opt.optimizationProgress[siteId] : undefined;
  const batchProgress = batchKey ? c.opt.optimizationProgress[batchKey] : undefined;
  const isViewedRowOptimizing = Boolean(
    row && isOverviewRowOptimizationActive(row.url, optimizingRowUrl),
  );
  const busy = isViewedRowOptimizing;

  useEffect(() => {
    if (!isViewedRowOptimizing) {
      setPassageStatus(null);
    }
  }, [row?.url, isViewedRowOptimizing]);

  const rowGeneratedFiles = useMemo((): BulkDetailsDownloadable[] => {
    if (!row?.url) return [];
    const fromBatch = generatedFilesForUrl(activeBatchState?.urlGeneratedFiles, row.url).map(
      (f) => ({
        name: f.name,
        content: f.content,
        mimeType: f.mimeType || "text/plain;charset=utf-8",
      }),
    );
    if (fromBatch.length > 0) return fromBatch;
    if (siteId && c.opt.optimizationFileManagers[siteId]) {
      return c.opt.optimizationFileManagers[siteId].getFiles().map((f) => ({
        name: f.name,
        content: f.content,
        mimeType: f.mimeType || "text/plain;charset=utf-8",
      }));
    }
    return [];
  }, [row?.url, activeBatchState, siteId, c.opt.optimizationFileManagers]);

  const serpBriefDownload = useMemo(() => {
    if (!row) return null;
    return resolveSerpBriefDownloadable(
      row.focusKeyword?.trim() || row.url?.trim() || "brief",
      rowGeneratedFiles,
      row.seoResearch,
    );
  }, [row, rowGeneratedFiles]);

  // Build stable, non-jumping drawer rows using actual page headers (never "Post content")
  const drawerStepRows = useMemo((): StudioDrawerStepRow[] => {
    if (!row) return [];
    const items: StudioDrawerStepRow[] = [];
    const isPages = c.sitemapSource === "pages" || isElementorRow;
    const runKind = activeBatchState?.runKind;

    const batchActiveStepLabel =
      busy && activeBatchState?.currentStep?.trim()
        ? activeBatchState.currentStep.trim()
        : "";

    const wordBlacklistDownload: BulkDetailsDownloadable = {
      name: "word-blacklist.txt",
      content: buildWordBlacklistDownloadText(),
      mimeType: "text/plain;charset=utf-8",
    };

    // 1. Word Blacklist (read before SERP brief and all generation)
    items.push({
      id: "step-word-blacklist",
      title: "Word Blacklist",
      isActive: false,
      isDone: true,
      downloadFile: wordBlacklistDownload,
    });

    // 2. SERP Research Brief
    items.push({
      id: "step-research",
      title: "SERP Research Brief",
      isActive:
        row.status === "research-faq" ||
        (busy && runKind === "research") ||
        batchActiveStepLabel === "SERP Research Brief",
      isDone: Boolean(row.seoResearch?.trim() || serpBriefDownload),
      downloadFile: serpBriefDownload,
    });

    // 3. Answer & Overview (for Posts / SAP when present or actively running)
    if (!isPages) {
      const ansHtml = extractAnswerSectionHtml(bodyHtml);
      if (ansHtml || row.status === "ai-answer" || (busy && runKind === "aiAnswer")) {
        items.push({
          id: "step-answer",
          title: "Answer",
          anchorId: "studio-sec-answer",
          isActive: row.status === "ai-answer" || (busy && runKind === "aiAnswer"),
          isDone: Boolean(ansHtml),
          downloadFile: ansHtml
            ? {
                name: "answer.html",
                content: ansHtml,
                mimeType: "text/html;charset=utf-8",
              }
            : null,
        });
      }

      const ovHtml = extractOverviewSectionHtml(bodyHtml);
      if (ovHtml || row.status === "ai-overview" || (busy && runKind === "aiOverview")) {
        items.push({
          id: "step-overview",
          title: "Overview",
          anchorId: "studio-sec-overview",
          isActive: row.status === "ai-overview" || (busy && runKind === "aiOverview"),
          isDone: Boolean(ovHtml),
          downloadFile: ovHtml
            ? {
                name: "overview.html",
                content: ovHtml,
                mimeType: "text/html;charset=utf-8",
              }
            : null,
        });
      }
    }

    // 4. Actual Section Headers (H2s / Elementor Sections — never generic "Post content")
    const headersRunning =
      row.status === "ai-headers" ||
      row.status === "ai-links" ||
      (busy && (runKind === "aiHeaders" || runKind === "aiLinks"));

    if (isElementorRow) {
      const elHeaders = elementorSectionHeadersFromCachedRow(row).filter((sec) => {
        const key = (sec.title ?? "").trim().toLowerCase();
        return key !== "faq" && key !== "frequently asked questions";
      });
      elHeaders.forEach((sec, idx) => {
        const headingTitle = sec.title?.trim() || `Section ${idx + 1}`;
        const secHtml = (sec.bodyHtml || sec.bodyText || "").trim();
        items.push({
          id: `step-h2-${idx}`,
          title: headingTitle,
          anchorId: `studio-sec-h2-${idx}`,
          isActive:
            headersRunning ||
            batchActiveStepLabel === headingTitle ||
            (passageStatus !== null && passageStatus.current === idx + 1),
          isDone: Boolean(secHtml || sec.title?.trim()),
          downloadFile: secHtml
            ? {
                name: `section-${idx + 1}-${sanitizeFileSlug(headingTitle)}.html`,
                content: `<h2>${headingTitle}</h2>\n${secHtml}`,
                mimeType: "text/html;charset=utf-8",
              }
            : null,
        });
      });
    } else {
      const coreHtml = stripTrailingFaqSection(
        stripLeadingOverviewSection(stripLeadingAnswerSection(bodyHtml)),
      );
      const parsed = splitHtmlBodyIntoH2PassageSections(coreHtml);
      parsed.sections.forEach((sec, idx) => {
        const headingTitle = sec.title?.trim() || `Section ${idx + 1}`;
        items.push({
          id: `step-h2-${idx}`,
          title: headingTitle,
          anchorId: `studio-sec-h2-${idx}`,
          isActive:
            headersRunning ||
            batchActiveStepLabel === headingTitle ||
            (passageStatus !== null && passageStatus.current === idx + 1),
          isDone: Boolean(sec.bodyHtml.trim()),
          downloadFile: sec.bodyHtml.trim()
            ? {
                name: `section-${idx + 1}-${sanitizeFileSlug(headingTitle)}.html`,
                content: `${sec.h2OpenTag}${headingTitle}</h2>\n${sec.bodyHtml}`,
                mimeType: "text/html;charset=utf-8",
              }
            : null,
        });
      });
    }

    // 5. SEO Title & Meta (runs after body content during Auto SEO)
    const titleVal = (row.aiTitle || row.title || "").trim();
    const metaVal = (row.aiMeta || row.metaDescription || "").trim();
    items.push({
      id: "step-meta",
      title: "SEO Title & Meta Description",
      isActive:
        row.status === "ai-title" ||
        row.status === "ai-meta" ||
        row.status === "ai-focus-kw" ||
        batchActiveStepLabel === "SEO Title & Meta Description" ||
        batchActiveStepLabel === "SEO Meta & FAQs" ||
        (busy && (runKind === "aiTitle" || runKind === "aiMeta" || runKind === "aiAllMeta")),
      isDone: Boolean(titleVal && metaVal),
      downloadFile:
        titleVal || metaVal
          ? {
              name: "seo-meta.json",
              content: JSON.stringify(
                {
                  url: row.url,
                  focusKeyword: row.focusKeyword ?? "",
                  title: titleVal,
                  metaDescription: metaVal,
                },
                null,
                2,
              ),
              mimeType: "application/json;charset=utf-8",
            }
          : null,
    });

    // 6. FAQs
    const faqEntries = (() => {
      const fromRow = parseFaqEntries(row.faq);
      if (fromRow.length > 0) return fromRow;
      const fromHtml = extractFaqFromPostHtml(bodyHtml);
      return fromHtml ? parseFaqEntries(fromHtml) : [];
    })();
    items.push({
      id: "step-faq",
      title: faqEntries.length > 0 ? `FAQs (${faqEntries.length})` : "FAQs",
      anchorId: "studio-sec-faq",
      isActive:
        row.status === "ai-faq" ||
        batchActiveStepLabel === "FAQs" ||
        batchActiveStepLabel === "SEO Meta & FAQs" ||
        batchActiveStepLabel === "AI FAQs" ||
        activeBatchState?.currentStepProgress?.step === "AI FAQs" ||
        (busy && runKind === "aiFaq"),
      isDone: faqEntries.length > 0,
      downloadFile:
        faqEntries.length > 0
          ? {
              name: "faq.json",
              content: JSON.stringify(
                { faq: serializeFaqEntriesPlain(faqEntries), entries: faqEntries },
                null,
                2,
              ),
              mimeType: "application/json;charset=utf-8",
            }
          : null,
    });

    // 6. WordPress Upload Proof (when present or uploading)
    const wpFile =
      rowGeneratedFiles.find((f) => f.name === "wordpress.json") ??
      rowGeneratedFiles.find((f) => f.name.startsWith("upload-payload-")) ??
      null;
    if (wpFile || row.status === "uploading" || (busy && runKind === "wpUpload")) {
      items.push({
        id: "step-wp-upload",
        title: "WordPress upload",
        isActive: row.status === "uploading" || (busy && runKind === "wpUpload"),
        isDone: Boolean(wpFile),
        downloadFile: wpFile,
      });
    }

    return items;
  }, [
    row,
    c.sitemapSource,
    isElementorRow,
    activeBatchState?.runKind,
    activeBatchState?.currentStep,
    busy,
    serpBriefDownload,
    bodyHtml,
    passageStatus,
    rowGeneratedFiles,
  ]);

  const doneStepCount = useMemo(
    () => drawerStepRows.filter((s) => s.isDone).length,
    [drawerStepRows],
  );
  const totalStepCount = drawerStepRows.length;

  const activeDrawerStepIndex = useMemo(
    () => drawerStepRows.findIndex((s) => s.isActive),
    [drawerStepRows],
  );

  // When a step is actively running, always start at 1/12 (never fall back to pre-existing 12/12)
  const displayStepCurrent = useMemo(() => {
    if (busy) {
      return activeDrawerStepIndex >= 0 ? activeDrawerStepIndex + 1 : 1;
    }
    return doneStepCount;
  }, [busy, activeDrawerStepIndex, doneStepCount]);

  const activeStepPct = useMemo(() => {
    if (busy && totalStepCount > 0) {
      const stepNum = activeDrawerStepIndex >= 0 ? activeDrawerStepIndex + 1 : 1;
      return Math.round((stepNum / totalStepCount) * 100);
    }
    return undefined;
  }, [busy, activeDrawerStepIndex, totalStepCount]);

  const allReadyFiles = useMemo(
    () =>
      drawerStepRows
        .map((s) => s.downloadFile)
        .filter((f): f is BulkDetailsDownloadable => f != null),
    [drawerStepRows],
  );

  // Build snapshot for the neon progress bar
  const rowStepMeta = row ? ROW_STATUS_LABELS[row.status] : undefined;
  const effectiveSnapshot = useMemo((): MetaBulkMicroSnapshot | null => {
    if (isViewedRowOptimizing && passageStatus) {
      return {
        label: passageStatus.label,
        completed: displayStepCurrent,
        total: Math.max(totalStepCount, 1),
        progressPct:
          activeStepPct ??
          Math.round((passageStatus.current / Math.max(passageStatus.total, 1)) * 100),
        statusMessage: passageStatus.label,
      };
    }
    if (busy && rowStepMeta) {
      return {
        label: rowStepMeta.label,
        completed: displayStepCurrent,
        total: Math.max(totalStepCount, 1),
        progressPct: activeStepPct ?? rowStepMeta.pct,
        statusMessage: rowStepMeta.label,
      };
    }
    if (isViewedRowOptimizing && bulkMicroSnapshot) {
      return {
        ...bulkMicroSnapshot,
        completed: activeDrawerStepIndex >= 0 ? displayStepCurrent : bulkMicroSnapshot.completed,
        total: activeDrawerStepIndex >= 0 ? Math.max(totalStepCount, 1) : bulkMicroSnapshot.total,
        progressPct: activeStepPct ?? bulkMicroSnapshot.progressPct,
        label: bulkMicroSnapshot.label.replace(/\bpost content\b/gi, "Sections"),
        statusMessage: bulkMicroSnapshot.statusMessage?.replace(
          /\bpost content\b/gi,
          "Sections",
        ),
      };
    }
    if (isViewedRowOptimizing && fullAutoRunning) {
      return {
        label: "Running Auto SEO pipeline",
        completed: displayStepCurrent,
        total: Math.max(totalStepCount, 1),
        progressPct: activeStepPct ?? 10,
        statusMessage: "Running Auto SEO pipeline",
      };
    }
    return null;
  }, [
    isViewedRowOptimizing,
    busy,
    passageStatus,
    rowStepMeta,
    displayStepCurrent,
    totalStepCount,
    activeStepPct,
    activeDrawerStepIndex,
    bulkMicroSnapshot,
    fullAutoRunning,
  ]);

  const activeHeadlineText = useMemo(() => {
    if (passageStatus) return passageStatus.label;
    if (rowStepMeta) return rowStepMeta.label;
    const activeRow = drawerStepRows.find((s) => s.isActive);
    if (activeRow) return activeRow.title;
    if (effectiveSnapshot?.statusMessage) return effectiveSnapshot.statusMessage;
    if (effectiveSnapshot?.label) return effectiveSnapshot.label;
    return "";
  }, [passageStatus, rowStepMeta, drawerStepRows, effectiveSnapshot]);

  const bandDisplayTotal = isBulkGeneratorStudio
    ? Math.max(
        bulkGeneratedFilesStepTotal > 0 ? bulkGeneratedFilesStepTotal : 0,
        bulkMicroSnapshot?.total ?? 0,
        totalStepCount,
        1,
      )
    : Math.max(totalStepCount, 1);

  const bandDisplayCurrent = isBulkGeneratorStudio
    ? Math.min(
        Math.max(
          bulkGeneratedFilesStepTotal > 0 ? bulkGeneratedFilesStepCompleted : 0,
          bulkMicroSnapshot?.completed ?? 0,
          busy ? displayStepCurrent : doneStepCount,
          0,
        ),
        bandDisplayTotal,
      )
    : Math.min(displayStepCurrent, bandDisplayTotal);

  const bandHeadlineText =
    isBulkGeneratorStudio && bulkMicroSnapshot?.label?.trim()
      ? bulkMicroSnapshot.label.trim()
      : activeHeadlineText;

  const bandBusy = isBulkGeneratorStudio ? bulkWorkspaceBusy || busy : busy;

  const scrollToSection = (anchorId?: string) => {
    if (!anchorId) return;
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setDrawerOpen(false);
    }
  };

  const activeOptimizingSectionTitle =
    busy && activeBatchState?.currentStep?.trim()
      ? activeBatchState.currentStep.trim()
      : passageStatus?.label?.includes(":")
        ? passageStatus.label.split(":").slice(1).join(":").trim()
        : null;

  // Sync the active row's SERP & Meta inspector into the existing right-hand Mastra sidebar
  useEffect(() => {
    if (!row || rowIndex < 0) {
      setStudioDocMetaInspectorBridge(null);
      return;
    }
    setStudioDocMetaInspectorBridge({
      row,
      rowIndex,
      busy,
      onUpdateRow: c.updateRow,
      onAiKeyword: c.handleAiKeywordRow,
      onAiUrl: c.handleAiUrlRow,
      onAiTitle: c.handleAiTitleRow,
      onAiMeta: c.handleAiMetaRow,
      onAiAllMeta: c.handleAiAllMetaRow,
      onResearchRow: c.handleDataForSeoResearch,
      onSetDateToday: c.handleSetDateToday,
      onCommitDateModifier: c.commitRowDateModifier,
    });
    return () => {
      setStudioDocMetaInspectorBridge(null);
    };
  }, [
    row,
    rowIndex,
    busy,
    c.updateRow,
    c.handleAiKeywordRow,
    c.handleAiUrlRow,
    c.handleAiTitleRow,
    c.handleAiMetaRow,
    c.handleAiAllMetaRow,
    c.handleDataForSeoResearch,
    c.handleSetDateToday,
    c.commitRowDateModifier,
  ]);

  // Murphy's Law check: auto-pull live WordPress body & ACF once per selected URL
  useEffect(() => {
    if (isBulkGeneratorStudio) return;
    if (!row?.url || rowIndex < 0 || !c.site) return;
    if (row.status !== "idle") return;
    const scrapeKey = `${c.site.id}:${c.sitemapSource}:${row.url}`;
    if (autoScrapedUrlsRef.current.has(scrapeKey)) return;
    autoScrapedUrlsRef.current.add(scrapeKey);
    void c.handleScrapeRow(rowIndex);
  }, [row?.url, row?.status, rowIndex, c, isBulkGeneratorStudio]);

  const openMastraSidebar = () => {
    setSidebarPanel("seo");
    writeSidebarPanel("seo");
    setSidebarOpen(true);
    writeSidebarOpen(true);
  };

  const rawTitle = hasRow && row ? metaDisplayTitle(row, c.wpTitlesByUrl) : "";
  const displayTitle =
    hasRow && row
      ? overviewTitlePrimarySegment(rawTitle) ||
        overviewRowUrlPathLabel(row.url) ||
        row.url
      : isBulkGeneratorStudio
        ? "Blog batch studio"
        : "Visual document studio";

  const drawerBody = bulkGeneratorDetailsPanel ? (
    <BulkGeneratorDetailsDrawer {...bulkGeneratorDetailsPanel} />
  ) : (
    <ul className="flex flex-col divide-y divide-white/5">
      {drawerStepRows.map((step, idx) => {
        const canDownload = Boolean(step.downloadFile);
        return (
          <li
            key={step.id}
            className={cn(
              "flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-base",
              contentOptimizerRowStripeClass(idx, {
                isActiveOptimize: step.isActive,
              }),
            )}
          >
            <span
              className={cn(
                "w-6 shrink-0 tabular-nums",
                step.isActive
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-muted-foreground",
              )}
            >
              {idx + 1}
            </span>

            {step.anchorId ? (
              <button
                type="button"
                onClick={() => scrollToSection(step.anchorId)}
                className={cn(
                  "min-w-0 flex-1 truncate text-left hover:underline",
                  step.isActive
                    ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                    : step.isDone
                      ? "text-white"
                      : "text-muted-foreground",
                )}
              >
                {step.title}
              </button>
            ) : (
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  step.isActive
                    ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                    : step.isDone
                      ? "text-white"
                      : "text-muted-foreground",
                )}
              >
                {step.title}
              </span>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canDownload}
              onClick={() => {
                if (!step.downloadFile) return;
                triggerBlobDownload(step.downloadFile);
                notify.success(NOTIFY_CSV_DOWNLOADED);
              }}
              className={cn(
                "h-7 shrink-0 px-2 text-base hover:bg-white/10 hover:text-white",
                canDownload ? "text-white" : "text-muted-foreground opacity-45",
              )}
            >
              <Download className="mr-1 h-3 w-3" />
              File
            </Button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950 font-sans text-base text-white">
      {/* Studio Top Header + Overlay Collapsible Drawer (Zero Jumping, Real Page Headers) */}
      <header
        className={cn(
          "relative z-30 flex shrink-0 flex-col border-b bg-black transition-colors",
          busy ? "animate-meta-opt-breathe border-semantic-data/40" : "border-white/10",
        )}
      >
        <div className="flex flex-col gap-2 px-4 py-2.5">
          {/* Band 1: Full Untruncated Document Title + Focus Keyword Badge */}
          <div className="flex w-full items-center justify-between gap-3">
            <h1
              className={cn(
                "text-base font-semibold",
                busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
              )}
            >
              {displayTitle}
            </h1>
            {hasRow && row?.focusKeyword?.trim() ? (
              <span className="shrink-0 bg-zinc-900 px-2.5 py-0.5 text-base text-cyan-400">
                {row.focusKeyword.trim()}
              </span>
            ) : null}
          </div>

          {/* Band 2: URL + bulk batch controls + studio actions (bulk uses stacked rows to avoid overflow) */}
          <div
            className={cn(
              "w-full min-w-0",
              bulkGeneratorBand2Toolbar
                ? "flex flex-col gap-2"
                : "flex flex-wrap items-center justify-between gap-2",
            )}
          >
            {hasRow && row ? (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 font-mono text-base text-cyan-400 hover:underline"
                title={row.url}
              >
                <span>{overviewRowUrlPathLabel(row.url)}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            ) : !isBulkGeneratorStudio ? (
              <span className="font-mono text-base text-muted-foreground">
                Select an article in the left dock
              </span>
            ) : null}

            {bulkGeneratorBand2Toolbar ? (
              <div className="w-full min-w-0">{bulkGeneratorBand2Toolbar}</div>
            ) : null}

            {!isBulkGeneratorStudio || (hasRow && !studioBody) ? (
            <div
              className={cn(
                "flex flex-wrap items-center gap-1.5",
                bulkGeneratorBand2Toolbar ? "w-full justify-end" : "ml-auto shrink-0 justify-end",
              )}
            >
              {onOpenRevisions ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenRevisions}
                  className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-cyan-400 hover:bg-zinc-800 hover:text-white"
                  title="Open full-page before/after revisions for this URL"
                >
                  <History className="mr-1.5 h-4 w-4" aria-hidden />
                  Revisions
                </Button>
              ) : null}
              {!isBulkGeneratorStudio && hasRow ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void c.handleScrapeRow(rowIndex)}
                  className={cn(
                    "h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-white hover:bg-zinc-800",
                    row!.status === "scraping" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                  )}
                  title="Re-scrape live WordPress HTML & ACF fields"
                >
                  <RefreshCw className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
                  Pull WP
                </Button>
              ) : null}

              {!isBulkGeneratorStudio && hasRow && row ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (c.selectedCount > 0) {
                    void c.handleOptimizeAll();
                    return;
                  }
                  if (!row?.url) return;
                  const targetUrl = row.url;
                  const resolveTargetIndex = () =>
                    c.rowsRef.current.findIndex(
                      (r) => normalizePageUrlKey(r.url) === normalizePageUrlKey(targetUrl),
                    );
                  onInFlightAutoSeoUrlChange?.(targetUrl);
                  clearOverviewStudioRevisions(targetUrl);
                  setFullAutoRunning(true);
                  void (async () => {
                    try {
                      let idx = resolveTargetIndex();
                      if (idx < 0) return;

                      // 1. Focus keyword from slug only; research brief is never changed during Auto SEO.
                      let latestRow = c.rowsRef.current[idx] ?? row;
                      if (!latestRow.focusKeyword?.trim()) {
                        const slugHint = normalizeFocusKeywordPhrase(
                          pathSlugToFocusHint(latestRow.url) || "",
                        );
                        if (slugHint) {
                          c.updateRow(idx, { focusKeyword: slugHint });
                          idx = resolveTargetIndex();
                          if (idx < 0) return;
                          latestRow = c.rowsRef.current[idx] ?? latestRow;
                        }
                      }
                      if (!latestRow.seoResearch?.trim()) {
                        try {
                          await c.handleDataForSeoResearch(idx, { silent: true });
                          idx = resolveTargetIndex();
                          if (idx < 0) return;
                          latestRow = c.rowsRef.current[idx] ?? latestRow;
                        } catch (err) {
                          console.warn("[Auto SEO] Research step warning:", err);
                        }
                      }

                      // 2. Content sections (Answer, Overview, passages, Elementor)
                      idx = resolveTargetIndex();
                      if (idx < 0) return;
                      latestRow = c.rowsRef.current[idx] ?? latestRow;

                      // Content Sections (Passage-by-Passage or Elementor Sections)
                      const isPages =
                        c.sitemapSource === "pages" ||
                        latestRow.contentFormat === "elementor" ||
                        Boolean(latestRow.elementorDataJson?.trim());

                      if (isPages && latestRow.elementorDataJson?.trim() && c.handleAiElementorFullPageRow) {
                        await c.handleAiElementorFullPageRow(idx);
                      } else if (isPages) {
                        const headers = elementorSectionHeadersFromCachedRow(latestRow).filter(
                          (sec) => {
                            const key = (sec.title ?? "").trim().toLowerCase();
                            return key !== "faq" && key !== "frequently asked questions";
                          },
                        );
                        const siblingTitles = headers.map((s) => s.title);
                        const workingHeaders = [...headers];

                        for (let i = 0; i < workingHeaders.length; i += 1) {
                          const sec = workingHeaders[i]!;
                          const secBody = (sec.bodyHtml || sec.bodyText || "").trim();
                          if (!secBody) continue;
                          setPassageStatus({
                            label: `Section ${i + 1}/${workingHeaders.length}: ${sec.title || `Section ${i + 1}`}`,
                            current: i + 1,
                            total: workingHeaders.length,
                          });
                          const elBefore = secBody;
                          try {
                            const rewritten = await rewriteBlogPassageSection({
                              mode: "copy",
                              section: {
                                id: sec.id || `sec-${i}`,
                                index: i,
                                h2OpenTag: "<h2>",
                                title: sec.title,
                                bodyHtml: secBody,
                              },
                              siblingTitles: siblingTitles.filter((_, idx) => idx !== i),
                              articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                              focusKeyword: latestRow.focusKeyword?.trim() || "",
                              seoResearchBrief: latestRow.seoResearch,
                              siteId: c.site?.id,
                              siteUrl: c.site?.siteUrl,
                              pageUrl: latestRow.url,
                              businessName: c.site?.name,
                            });
                            const normalizedHtml = normalizeSectionProseHtml(rewritten.bodyHtml);
                            recordOverviewStudioRevision({
                              pageUrl: targetUrl,
                              stepLabel: sec.title?.trim() || `Section ${i + 1}`,
                              sectionTitle: sec.title?.trim() || undefined,
                              beforeHtml: elBefore,
                              afterHtml: normalizedHtml,
                            });
                            workingHeaders[i] = {
                              ...sec,
                              bodyHtml: normalizedHtml,
                              bodyText: prosePlainText(normalizedHtml),
                            };
                            idx = resolveTargetIndex();
                            if (idx < 0) return;
                            c.updateRow(idx, {
                              elementorSectionHeaders: [...workingHeaders],
                            });
                          } catch (err) {
                            console.warn(`[Auto SEO] Page section ${i + 1} warning:`, err);
                          }
                        }
                        setPassageStatus(null);
                      } else {
                        const currentBody =
                          latestRow.postContentOptimized?.trim() ||
                          latestRow.postContent?.trim() ||
                          bodyHtml;
                        let ansHtml = extractAnswerSectionHtml(currentBody);
                        let ovHtml = extractOverviewSectionHtml(currentBody);
                        const withoutLead = stripLeadingOverviewSection(
                          stripLeadingAnswerSection(currentBody),
                        );
                        const coreOnly = stripTrailingFaqSection(withoutLead);
                        const trailingFaq =
                          withoutLead.length > coreOnly.length
                            ? withoutLead.slice(coreOnly.length).trim()
                            : "";
                        const parsed = splitHtmlBodyIntoH2PassageSections(coreOnly);
                        let leadingHtml = parsed.leadingHtml;
                        const workingSections = [...parsed.sections];
                        const passageCtx = {
                          articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                          focusKeyword: latestRow.focusKeyword?.trim() || "",
                          seoResearchBrief: latestRow.seoResearch,
                          siteId: c.site?.id,
                          siteUrl: c.site?.siteUrl,
                          pageUrl: latestRow.url,
                          businessName: c.site?.name,
                        };
                        const siblingTitles = workingSections.map((s) => s.title);
                        const commitBlogHtml = () => {
                          const html = stitchOverviewBlogPostHtml({
                            ansHtml,
                            ovHtml,
                            leadingHtml,
                            sections: workingSections,
                            trailingFaq,
                          });
                          idx = resolveTargetIndex();
                          if (idx < 0) return;
                          c.updateRow(idx, {
                            postContentOptimized: html,
                            postContent: html,
                          });
                        };
                        if (ansHtml.trim()) {
                          const ansBefore = ansHtml;
                          try {
                            ansHtml = await rewriteBlogLeadSectionBlock(ansHtml, {
                              ...passageCtx,
                              siblingTitles,
                            });
                            recordOverviewStudioRevision({
                              pageUrl: targetUrl,
                              stepLabel: "Answer",
                              beforeHtml: ansBefore,
                              afterHtml: ansHtml,
                            });
                            commitBlogHtml();
                          } catch (err) {
                            console.warn("[Auto SEO] Answer section warning:", err);
                          }
                        }
                        if (ovHtml.trim()) {
                          const ovBefore = ovHtml;
                          try {
                            ovHtml = await rewriteBlogLeadSectionBlock(ovHtml, {
                              ...passageCtx,
                              siblingTitles,
                            });
                            recordOverviewStudioRevision({
                              pageUrl: targetUrl,
                              stepLabel: "Overview",
                              beforeHtml: ovBefore,
                              afterHtml: ovHtml,
                            });
                            commitBlogHtml();
                          } catch (err) {
                            console.warn("[Auto SEO] Overview section warning:", err);
                          }
                        }
                        if (leadingHtml.trim()) {
                          const introBefore = leadingHtml;
                          try {
                            leadingHtml = await rewriteBlogLeadSectionBlock(leadingHtml, {
                              ...passageCtx,
                              siblingTitles,
                            });
                            recordOverviewStudioRevision({
                              pageUrl: targetUrl,
                              stepLabel: "Introduction",
                              beforeHtml: introBefore,
                              afterHtml: leadingHtml,
                            });
                            commitBlogHtml();
                          } catch (err) {
                            console.warn("[Auto SEO] Intro lead warning:", err);
                          }
                        }

                        for (let i = 0; i < workingSections.length; i += 1) {
                          const sec = workingSections[i]!;
                          if (!sec.bodyHtml.trim()) continue;
                          setPassageStatus({
                            label: `Section ${i + 1}/${workingSections.length}: ${sec.title || `Section ${i + 1}`}`,
                            current: i + 1,
                            total: workingSections.length,
                          });
                          const passageBefore = sec.bodyHtml;
                          try {
                            const rewritten = await rewriteBlogPassageSection({
                              mode: "copy",
                              section: sec,
                              siblingTitles: workingSections
                                .filter((_, idx) => idx !== i)
                                .map((s) => s.title),
                              articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                              focusKeyword: latestRow.focusKeyword?.trim() || "",
                              seoResearchBrief: latestRow.seoResearch,
                              siteId: c.site?.id,
                              siteUrl: c.site?.siteUrl,
                              pageUrl: latestRow.url,
                              businessName: c.site?.name,
                            });
                            const nextBody = normalizeSectionProseHtml(rewritten.bodyHtml);
                            recordOverviewStudioRevision({
                              pageUrl: targetUrl,
                              stepLabel: sec.title?.trim() || `Section ${i + 1}`,
                              sectionTitle: sec.title?.trim() || undefined,
                              beforeHtml: passageBefore,
                              afterHtml: nextBody,
                            });
                            workingSections[i] = {
                              ...sec,
                              bodyHtml: nextBody,
                            };
                            commitBlogHtml();
                          } catch (err) {
                            console.warn(`[Auto SEO] Passage ${i + 1} warning:`, err);
                          }
                        }
                        setPassageStatus(null);
                      }

                      idx = resolveTargetIndex();
                      if (idx >= 0) {
                        await runAutoSeoMetaAndFaqFinale({
                          rowIndex: idx,
                          pageUrl: targetUrl,
                          getRow: () => {
                            const i = resolveTargetIndex();
                            return i >= 0 ? c.rowsRef.current[i] : undefined;
                          },
                          handleAiTitleRow: (i) => c.handleAiTitleRow(i),
                          handleAiMetaRow: (i) => c.handleAiMetaRow(i),
                          handleAiFaqRowAll: (i, r, opts) => c.handleAiFaqRowAll(i, r, opts),
                          faqOptions: { silentToast: false, skipFaqLoading: true },
                        });
                      }
                    } finally {
                      onInFlightAutoSeoUrlChange?.(null);
                      setPassageStatus(null);
                      setFullAutoRunning(false);
                    }
                  })();
                }}
                className={cn(
                  "h-8 rounded-none border-0 bg-zinc-900 px-3 text-base font-medium text-primary hover:bg-zinc-800",
                  fullAutoRunning &&
                    isViewedRowOptimizing &&
                    CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                )}
                title="Execute Auto SEO pipeline (chains all selected posts if multiple are selected)"
              >
                <Sparkles className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
                {c.selectedCount > 1 ? `Auto SEO (${c.selectedCount})` : "Auto SEO"}
              </Button>
              ) : null}

              {bulkGeneratorStudioActions ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || !bulkGeneratorStudioActions.canGenerateContent}
                  onClick={bulkGeneratorStudioActions.onGenerateContent}
                  className="h-8 rounded-none border-0 bg-zinc-900 px-3 text-base font-medium text-primary hover:bg-zinc-800"
                  title="Run the blog content pipeline for this batch"
                >
                  <Play className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
                  Generate content
                </Button>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openMastraSidebar}
                className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-cyan-400 hover:bg-zinc-800"
                title="Open the Right-Hand Page SEO & Meta Inspector Drawer"
              >
                <Workflow className="mr-1.5 h-4 w-4" aria-hidden />
                SEO Inspector
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || !hasRow || !row}
                onClick={() => {
                  if (!row) return;
                  void c.handleUpdateWordPressForRow(row, { rowIndex });
                }}
                className={cn(
                  "h-8 rounded-none border-0 bg-primary px-3 text-base font-semibold text-black hover:bg-primary/90",
                  row?.status === "uploading" && "opacity-90",
                )}
                title="Publish staged meta, prose, and FAQs to WordPress"
              >
                <Upload className="mr-1.5 h-4 w-4" aria-hidden />
                Upload to WP
              </Button>
            </div>
            ) : null}
          </div>
        </div>

        <OverviewStudioGeneratedFilesBand
          busy={bandBusy}
          activeHeadlineText={bandHeadlineText}
          displayStepCurrent={bandDisplayCurrent}
          totalStepCount={bandDisplayTotal}
          allReadyFiles={allReadyFiles}
          detailsPanelId={
            isBulkGeneratorStudio ? bulkGeneratedFilesPanelId : "opt-generated-files-panel"
          }
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
          drawerContent={drawerBody}
          endRailTitle={
            isBulkGeneratorStudio ? "Run steps and site inventory" : "Sections & SEO artifacts"
          }
        />
      </header>

      {studioBody ? (
        <div className="min-h-0 flex-1 overflow-hidden">{studioBody}</div>
      ) : !hasRow || !row ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-zinc-950 p-8 text-center text-base text-muted-foreground">
          <FileText className="h-8 w-8 shrink-0 text-primary" aria-hidden />
          <p className="max-w-md text-white">
            {isBulkGeneratorStudio
              ? "Select a row from the left list to open it in the studio editor."
              : "Select an article from the Left Sitemap Dock to open it in the Visual Document Studio."}
          </p>
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-900/40 px-4 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col bg-zinc-950 px-6 py-7 sm:px-10 sm:py-9">
          <OverviewDocSectionBlocks
            row={row}
            rowIndex={rowIndex}
            sitemapSource={c.sitemapSource}
            siteId={c.site?.id}
            siteUrl={c.site?.siteUrl}
            businessName={c.site?.name}
            isElementorRow={isElementorRow}
            bodyHtml={bodyHtml}
            busy={busy}
            onUpdateRow={c.updateRow}
            onAiAnswer={c.handleAiAnswerRow}
            onAiOverview={c.handleAiOverviewRow}
            onAiHeaders={c.handleAiHeadersRow}
            onAiLinks={c.handleAiLinksRow}
            onAiWikipediaLink={c.handleAiWikipediaLinkRow}
            onAiScenario={c.handleAiScenarioRow}
            onAiInContentImage={c.handleAiInContentImageRow}
            onAiFaqAll={c.handleAiFaqRowAll}
            onAiFaqQuestion={c.handleAiFaqQuestion}
            onAiFaqAnswer={c.handleAiFaqAnswer}
            onAiElementorSection={c.handleAiElementorSectionRow}
            onAiElementorSectionHeader={c.handleAiElementorSectionHeaderRow}
            onAiElementorSectionContent={c.handleAiElementorSectionContentRow}
            onPassageStatusChange={setPassageStatus}
            activeOptimizingSectionTitle={activeOptimizingSectionTitle}
          />
        </div>
      </div>
      )}
    </div>
  );
}
