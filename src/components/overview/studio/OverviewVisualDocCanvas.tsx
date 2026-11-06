import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, ExternalLink, FileText, Play, RefreshCw, Sparkles, Upload } from "lucide-react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import {
  type MetaBulkMicroSnapshot,
} from "@/components/overview/overview-bulk-micro-progress-helpers";
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
} from "@/components/shared/bulk-details-tile-sections-helpers";
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
import { resolveStudioDrawerElementorHeaders } from "@/lib/overview/overview-studio-drawer-section-headers";
import { overviewStudioRowFromWarmInventory } from "@/lib/overview/overview-studio-row-inventory-merge";
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
import { runAutoSeoBlogBodyRewrite } from "@/lib/overview/overview-auto-seo-blog-rewrite";
import {
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
} from "@/lib/overview/overview-blog-passage-sections";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { extractFaqFromPostHtml } from "@/lib/overview/overview-row-scrape";
import {
  metaDisplayTitle,
  bulkStudioRowPathLabel,
  bulkStudioRowPublicUrl,
  overviewRowUrlPathLabel,
  overviewTitlePrimarySegment,
} from "@/lib/overview/overview-tab-display";
import { setStudioDocMetaInspectorBridge } from "@/lib/overview/studio-doc-meta-bridge";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import { WordBlacklistRunDetail } from "@/components/keyword-research/bulk/WordBlacklistRunDetail";
import {
  STUDIO_EDITOR_MODE_OPTIONS,
  type StudioEditorModeId,
} from "@/components/keyword-research/bulk/studio-editor-modes";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { ContentOptimizerSplashOverlay } from "@/components/overview/studio/ContentOptimizerSplashOverlay";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import { UniversalStudioHeader } from "@/components/overview/studio/UniversalStudioHeader";
import { cn } from "@/lib/utils";
import { ActionButton, Button } from "@/ui";

/** Single header action for bulk generator studios: Generate -> Approve -> Publish. */
const STUDIO_ACTION_STATES = ["Ideas", "Curating", "Generate", "Generating", "Approve", "Publish", "Publishing"] as const;

export interface BulkGeneratorStudioAction {
  stage: "ideas" | "generate" | "approve" | "publish";
  running: boolean;
  canRun: boolean;
  /** Ignored for `publish`; the canvas publishes the active row itself. */
  onRun: () => void;
}

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
  bulkGeneratorStudioActions?: BulkGeneratorStudioAction;
  /** Newest prompt log for the active bulk row (all model calls), shown as a header download. */
  promptLogFile?: BulkDetailsDownloadable | null;
  bulkGeneratorDetailsPanel?: BulkGeneratorDetailsPanelProps;
  customDrawerContent?: ReactNode;
  bulkGeneratedFilesPanelId?: string;
  bulkGeneratorBand2Toolbar?: ReactNode;
  studioBody?: ReactNode;
  studioEditorMode?: StudioEditorModeId;
  onStudioEditorModeChange?: (mode: StudioEditorModeId) => void;
  /** CSV title + URL slug agents in flight (hide raw keyword paths in header). */
  bulkTitleUrlOptimizing?: boolean;
}

type StudioDrawerStepRow = {
  id: string;
  title: string;
  anchorId?: string;
  isActive: boolean;
  isDone: boolean;
  downloadFile?: BulkDetailsDownloadable | null;
};

/** True when the HTML has readable text or media (blank wrappers like <p></p> do not count). */
function htmlHasVisibleContent(html: string | undefined): boolean {
  if (!html?.trim()) return false;
  const body = new DOMParser().parseFromString(html, "text/html").body;
  return Boolean(body.textContent?.trim()) || body.querySelector("img,video,iframe") !== null;
}

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
  "research-faq": { label: "SERP Research Brief (DataForSEO + GSC)", pct: 25 },
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
  promptLogFile = null,
  bulkGeneratorDetailsPanel,
  customDrawerContent,
  bulkGeneratedFilesPanelId = "bulk-generator-generated-files-panel",
  bulkGeneratorBand2Toolbar,
  studioBody,
  studioEditorMode,
  onStudioEditorModeChange,
  bulkTitleUrlOptimizing = false,
}: OverviewVisualDocCanvasProps) {
  const isBulkGeneratorStudio = Boolean(bulkGeneratorStudioActions || studioEditorMode);
  const siteWarm = useOverviewSiteWarmDetails(c.site ?? undefined);
  const hasRow = Boolean(row && rowIndex >= 0);
  const showStudioEmptyPrompt = !c.site?.id;
  const { setSidebarOpen, setSidebarPanel } = useAgentRunsContext();
  const [fullAutoRunning, setFullAutoRunning] = useState(false);
  const [passageStatus, setPassageStatus] = useState<{
    label: string;
    current: number;
    total: number;
  } | null>(null);

  const studioRow = useMemo(() => {
    if (!row || !c.site) return row ?? null;
    return overviewStudioRowFromWarmInventory(row, c.site, c.sitemapSource);
  }, [row, c.site, c.sitemapSource]);

  const isElementorRow = Boolean(
    !isBulkGeneratorStudio &&
      studioRow &&
      (c.sitemapSource === "pages" ||
        studioRow.contentFormat === "elementor" ||
        Boolean(studioRow.elementorDataJson?.trim())),
  );

  const bodyHtml = useMemo(() => {
    if (!studioRow) return "";
    const liveHtml = studioRow.postContentOptimized?.trim() || studioRow.postContent?.trim() || "";
    const optimizingThisRow = isOverviewRowOptimizationActive(studioRow.url, optimizingRowUrl);

    if (isBulkGeneratorStudio) {
      return liveHtml;
    }

    if (isElementorRow) {
      if (optimizingThisRow && liveHtml) return liveHtml;
      if (studioRow.elementorDataJson?.trim()) {
        return buildElementorPageHtml(studioRow.elementorDataJson);
      }
      return liveHtml;
    }

    if (optimizingThisRow && liveHtml) {
      return liveHtml;
    }

    if (c.site) {
      return resolveAiseoHarnessSourceHtmlFromCache({
        row: studioRow,
        site: c.site,
        sitemapSource: c.sitemapSource,
        getInventoryMatchForUrl: c.getInventoryMatchForUrl,
      });
    }
    return liveHtml;
  }, [
    studioRow,
    isElementorRow,
    optimizingRowUrl,
    c.site,
    c.sitemapSource,
    c.getInventoryMatchForUrl,
    isBulkGeneratorStudio,
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

  const currentStepProgressStep = activeBatchState?.currentStepProgress?.step;
  // Build stable, non-jumping drawer rows using actual page headers (never "Post content")
  const drawerStepRows = useMemo((): StudioDrawerStepRow[] => {
    if (!studioRow) return [];
    const row = studioRow;
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

    const passageStepTitle = passageStatus?.label?.includes(":")
      ? passageStatus.label.split(":").slice(1).join(":").trim()
      : passageStatus?.label?.trim() ?? "";

    // 3. Answer & Overview (for Posts / SAP when present or actively running)
    if (!isPages) {
      const ansHtml = extractAnswerSectionHtml(bodyHtml);
      if (
        ansHtml ||
        row.status === "ai-answer" ||
        batchActiveStepLabel === "Answer" ||
        passageStepTitle === "Answer" ||
        (busy && runKind === "aiAnswer")
      ) {
        items.push({
          id: "step-answer",
          title: "Answer",
          anchorId: "studio-sec-answer",
          isActive:
            row.status === "ai-answer" ||
            batchActiveStepLabel === "Answer" ||
            passageStepTitle === "Answer" ||
            (busy && runKind === "aiAnswer"),
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
      if (
        ovHtml ||
        row.status === "ai-overview" ||
        batchActiveStepLabel === "Overview" ||
        passageStepTitle === "Overview" ||
        (busy && runKind === "aiOverview")
      ) {
        items.push({
          id: "step-overview",
          title: "Overview",
          anchorId: "studio-sec-overview",
          isActive:
            row.status === "ai-overview" ||
            batchActiveStepLabel === "Overview" ||
            passageStepTitle === "Overview" ||
            (busy && runKind === "aiOverview"),
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
      const elHeaders = resolveStudioDrawerElementorHeaders(row, c.site ?? undefined, c.sitemapSource);
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
            passageStepTitle === headingTitle,
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
            passageStepTitle === headingTitle,
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
        passageStepTitle === "SEO Title & Meta Description" ||
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
        passageStepTitle === "FAQs" ||
        batchActiveStepLabel === "AI FAQs" ||
        currentStepProgressStep === "AI FAQs" ||
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
    studioRow,
    c.site,
    c.sitemapSource,
    isElementorRow,
    activeBatchState?.runKind,
    activeBatchState?.currentStep,
    currentStepProgressStep,
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

  const bandBusy =
    isBulkGeneratorStudio ? bulkWorkspaceBusy || busy || bulkTitleUrlOptimizing : busy;

  const bulkContentSplashVisible =
    isBulkGeneratorStudio &&
    !studioBody &&
    hasRow &&
    !htmlHasVisibleContent(row?.postContentOptimized) &&
    !htmlHasVisibleContent(row?.postContent) &&
    row?.status !== "error";

  const scrollToSection = (anchorId?: string) => {
    if (!anchorId) return;
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const activeOptimizingSectionTitle =
    busy && activeBatchState?.currentStep?.trim()
      ? activeBatchState.currentStep.trim()
      : passageStatus?.label?.includes(":")
        ? passageStatus.label.split(":").slice(1).join(":").trim()
        : null;

  // Sync the active row's SERP & Meta inspector into the existing right-hand Pulse Engine sidebar
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

  useEffect(() => {
    return () => {
      setStudioDocMetaInspectorBridge(null);
    };
  }, []);

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
        (isBulkGeneratorStudio ? bulkStudioRowPathLabel(row) : overviewRowUrlPathLabel(row.url)) ||
        row.url
      : isBulkGeneratorStudio
        ? "Blog batch studio"
        : "Visual document studio";

  const drawerBody = customDrawerContent ? (
    customDrawerContent
  ) : bulkGeneratorDetailsPanel ? (
    <BulkGeneratorDetailsDrawer {...bulkGeneratorDetailsPanel} />
  ) : (
    <div className="flex flex-col">
      {c.site ? (
        <>
          <div className={contentOptimizerRowStripeClass(0)}>
            <WordBlacklistRunDetail />
          </div>
          <div className={contentOptimizerRowStripeClass(1)}>
            <BulkSitemapInventoryRunDetail
              links={siteWarm.sitemapInventoryLinks}
              gscHostedLink={siteWarm.gscHostedLink}
              inventoryRows={siteWarm.inventoryRows}
              pinned
            />
          </div>
        </>
      ) : null}
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
              <Button
                pressed={Boolean(step.isActive)}
                variant="quiet"
                onClick={() => scrollToSection(step.anchorId)}
              >
                {step.title}
              </Button>
            ) : (
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
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
              variant="quiet"
              type="button"
              disabled={!canDownload}
              onClick={() => {
                if (!step.downloadFile) return;
                triggerBlobDownload(step.downloadFile);
                notify.success(NOTIFY_CSV_DOWNLOADED);
              }}
            >
              <Download className="mr-1 h-3 w-3" />
              File
            </Button>
          </li>
        );
      })}
      </ul>
    </div>
  );

  const handleAutoSeo = useCallback(() => {
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

        if (isPages) {
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
          await runAutoSeoBlogBodyRewrite({
            sourceHtml: currentBody,
            articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
            focusKeyword: latestRow.focusKeyword?.trim() || "",
            seoResearchBrief: latestRow.seoResearch,
            site: c.site,
            pageUrl: targetUrl,
            sitemapSource: c.sitemapSource,
            onStepProgress: (stepIndex, totalBodySteps, stepLabel) => {
              setPassageStatus({
                label: `Step ${stepIndex}/${totalBodySteps}: ${stepLabel}`,
                current: stepIndex,
                total: totalBodySteps,
              });
            },
            onCommitHtml: (html, h2Titles) => {
              idx = resolveTargetIndex();
              if (idx < 0) return;
              c.updateRow(idx, {
                postContentOptimized: html,
                postContent: html,
                ...(h2Titles.length > 0 ? { blogH2List: h2Titles } : {}),
              });
            },
          });
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
            onStepStart: (stepLabel) => {
              setPassageStatus({
                label: stepLabel,
                current: stepLabel === "SEO Title & Meta Description" ? 1 : 2,
                total: 2,
              });
            },
          });
        }
      } finally {
        onInFlightAutoSeoUrlChange?.(null);
        setPassageStatus(null);
        setFullAutoRunning(false);
      }
    })();
  }, [c, row, bodyHtml, onInFlightAutoSeoUrlChange]);

  const studioActionButtons = (
    <>
      {!isBulkGeneratorStudio && hasRow ? (
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void c.handleScrapeRow(rowIndex)}
          title="Re-scrape live WordPress HTML & ACF fields"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>Sync</span>
        </Button>
      ) : null}

      {!isBulkGeneratorStudio && hasRow && row ? (
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={handleAutoSeo}
          title="Execute Auto SEO pipeline (chains all selected posts if multiple are selected)"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="break-words">{c.selectedCount > 1 ? `Auto SEO (${c.selectedCount})` : "Auto SEO"}</span>
        </Button>
      ) : null}

      {bulkGeneratorStudioActions ? (
        (() => {
          const a = bulkGeneratorStudioActions;
          const publishing = a.stage === "publish" && row?.status === "uploading";
          const running = a.running || publishing;
          const label =
            a.stage === "publish"
              ? publishing
                ? "Publishing"
                : "Publish"
              : running
                ? a.stage === "ideas"
                  ? "Curating"
                  : "Generating"
                : a.stage === "approve"
                  ? "Approve"
                  : a.stage === "ideas"
                    ? "Ideas"
                    : "Generate";
          return (
            <ActionButton
              states={STUDIO_ACTION_STATES}
              state={label}
              icon={Play}
              disabled={
                running || (a.stage === "publish" ? !hasRow || !row : busy || !a.canRun)
              }
              onClick={() => {
                if (a.stage === "publish") {
                  if (!row) return;
                  void c.handleUpdateWordPressForRow(row, { rowIndex });
                  return;
                }
                a.onRun();
              }}
            />
          );
        })()
      ) : null}

      {!bulkGeneratorStudioActions ? (
        <Button
          variant="quiet"
          type="button"
          disabled={busy || !hasRow || !row || row?.status === "uploading"}
          onClick={() => {
            if (!row) return;
            void c.handleUpdateWordPressForRow(row, { rowIndex });
          }}
          title="Publish staged meta, prose, and FAQs to WordPress"
        >
          {row?.status === "uploading" ? (
            null
          ) : (
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="break-words">{row?.status === "uploading" ? "Publishing..." : "Publish"}</span>
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-black font-sans text-base text-white">
      {/* Universal Stacked Studio Header: Row 1 (Studio Mode + External URL Link Out + Drawer Toggle), Row 2 (Filters + Actions), Details Drawer */}
      <UniversalStudioHeader
        studioEditorMode={studioEditorMode}
        onStudioEditorModeChange={onStudioEditorModeChange}
        bulkWorkspaceBusy={bulkWorkspaceBusy}
        activeUrl={row?.url ?? null}
        publicUrl={row ? bulkStudioRowPublicUrl(row, c.site?.siteUrl) : (c.site?.siteUrl ?? null)}
        titleUrlOptimizing={bulkTitleUrlOptimizing}
        urlDisplayLabel={
          bulkTitleUrlOptimizing
            ? null
            : row
              ? (bulkStudioRowPathLabel(row) || overviewRowUrlPathLabel(row.url) || row.url)
              : (c.site?.siteUrl ?? null)
        }
        siteUrl={c.site?.siteUrl ?? null}
        promptLogFile={promptLogFile}
        filters={bulkGeneratorBand2Toolbar}
        actions={studioActionButtons}
        busy={bandBusy}
        drawerContent={drawerBody}
        detailsPanelId={
          isBulkGeneratorStudio ? bulkGeneratedFilesPanelId : "opt-generated-files-panel"
        }
      />

      {studioBody ? (
        <div className="min-h-0 flex-1 overflow-hidden">{studioBody}</div>
      ) : !hasRow || !row ? (
        showStudioEmptyPrompt ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-black p-8 text-center text-base text-muted-foreground">
            <FileText className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <p className="max-w-md text-white">
              {isBulkGeneratorStudio
                ? "Select a row from the left list to open it in the studio editor."
                : "Select an article from the Left Sitemap Dock to open it in the Visual Document Studio."}
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 bg-black" aria-hidden />
        )
      ) : (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        <ContentOptimizerSplashOverlay visible={bulkContentSplashVisible} />
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-black px-4 py-6 sm:px-8",
            bulkContentSplashVisible && "invisible pointer-events-none",
          )}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col bg-black px-6 py-7 sm:px-10 sm:py-9">
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
              onPassageStatusChange={setPassageStatus}
              activeOptimizingSectionTitle={activeOptimizingSectionTitle}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
