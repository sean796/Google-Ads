import { useMemo } from "react";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { OverviewRow, RowStatus } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { resolveSerpBriefDownloadable, type BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { buildWordBlacklistDownloadText } from "@/lib/content-word-blocklist";
import { resolveStudioDrawerElementorHeaders } from "@/lib/overview/overview-studio-drawer-section-headers";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import { extractAnswerSectionHtml, extractOverviewSectionHtml, stripLeadingAnswerSection, stripLeadingOverviewSection } from "@/lib/overview/overview-blog-overview-prepend";
import { splitHtmlBodyIntoH2PassageSections } from "@/lib/overview/overview-blog-passage-sections";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import { extractFaqFromPostHtml } from "@/lib/overview/overview-row-scrape";

export type StudioDrawerStepRow = {
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

export type StudioPassageStatus = {
  label: string;
  current: number;
  total: number;
} | null;

type Args = {
  c: OverviewTabController;
  row: OverviewRow | null;
  isBulkGeneratorStudio: boolean;
  activeBatchState?: BulkOptimizationState;
  busy: boolean;
  isViewedRowOptimizing: boolean;
  optimizingRowUrl?: string | null;
  bulkMicroSnapshot?: MetaBulkMicroSnapshot | null;
  passageStatus: StudioPassageStatus;
  fullAutoRunning: boolean;
  studioRow: OverviewRow | null;
  isElementorRow: boolean;
  bodyHtml: string;
  siteId: string;
};

export function useOverviewStudioDrawerSteps({
  c,
  row,
  isBulkGeneratorStudio,
  activeBatchState,
  busy,
  isViewedRowOptimizing,
  optimizingRowUrl,
  bulkMicroSnapshot,
  passageStatus,
  fullAutoRunning,
  studioRow,
  isElementorRow,
  bodyHtml,
  siteId,
}: Args) {

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

  const activeOptimizingSectionTitle =
    busy && activeBatchState?.currentStep?.trim()
      ? activeBatchState.currentStep.trim()
      : passageStatus?.label?.includes(":")
        ? passageStatus.label.split(":").slice(1).join(":").trim()
        : null;

  return {
    drawerStepRows,
    effectiveSnapshot,
    activeOptimizingSectionTitle,
  };
}