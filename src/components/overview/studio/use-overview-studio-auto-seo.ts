import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { runAutoSeoMetaAndFaqFinale } from "@/lib/overview/overview-auto-seo-meta-faq-finale";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";
import { clearOverviewStudioRevisions } from "@/lib/overview/studio-doc-revisions-store";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { runAutoSeoBlogBodyRewrite } from "@/lib/overview/overview-auto-seo-blog-rewrite";
import { rewriteBlogPassageSection } from "@/lib/overview/overview-blog-passage-sections";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export const STUDIO_ACTION_STATES = ["Ideas", "Curating", "Generate", "Generating", "Approve", "Publish", "Publishing"] as const;

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

type Args = {
  c: OverviewTabController;
  row: OverviewRow | null;
  bodyHtml: string;
  onInFlightAutoSeoUrlChange?: (url: string | null) => void;
  isViewedRowOptimizing: boolean;
};

export function useOverviewStudioAutoSeo({
  c,
  row,
  bodyHtml,
  onInFlightAutoSeoUrlChange,
  isViewedRowOptimizing,
}: Args) {
  const [fullAutoRunning, setFullAutoRunning] = useState(false);
  const [passageStatus, setPassageStatus] = useState<{
    label: string;
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!isViewedRowOptimizing) {
      setPassageStatus(null);
    }
  }, [row?.url, isViewedRowOptimizing]);

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

  return { handleAutoSeo, fullAutoRunning, passageStatus, setPassageStatus };
}