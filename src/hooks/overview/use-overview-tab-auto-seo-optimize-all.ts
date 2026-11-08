import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
import pLimit from "p-limit";
import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN } from "@/lib/notify-messages";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { countAutoSeoBlogBodySteps, runAutoSeoBlogBodyRewrite } from "@/lib/overview/overview-auto-seo-blog-rewrite";
import { rewriteBlogPassageSection } from "@/lib/overview/overview-blog-passage-sections";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { isDfsPaymentLatched } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { clearOverviewStudioRevisions } from "@/lib/overview/studio-doc-revisions-store";
import { runAutoSeoMetaAndFaqFinale } from "@/lib/overview/overview-auto-seo-meta-faq-finale";
import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";
import { overviewBulkRowIndices, overviewBulkRowIndicesForDisplayOrder } from "@/lib/overview/overview-bulk-row-scope";

type Args = Pick<
  OverviewTabBase,
  | "rowsRef"
  | "displayRowsRef"
  | "updateRow"
  | "opt"
  | "getInventoryMatchForUrl"
  | "sitemapSource"
> & {
  site: WordPressSite | undefined;
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  handleAiTitleRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeTitleLoading?: boolean },
  ) => Promise<{ title: string; aiTitle: string } | null>;
  handleAiMetaRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeMetaLoading?: boolean },
  ) => Promise<{ metaDescription: string; aiMeta: string } | null>;
  handleAiFaqRowAll: (
    rowIndex: number,
    rowOverride?: OverviewRow,
    options?: {
      silentToast?: boolean;
      skipFaqLoading?: boolean;
      onMicroStep?: () => void;
      seedQuestionCount?: number;
      skipUploadAfterRowWrite?: boolean;
    },
  ) => Promise<void>;
  bulkScopeUrlKeysRef: MutableRefObject<Set<string>>;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

type WindowWithOptimizeRunId = Window & {
  __neoPulseOptimizeAllRunId?: number;
};

function nextOptimizeAllRunId(): number {
  if (typeof window === "undefined") return 1;
  const w = window as WindowWithOptimizeRunId;
  w.__neoPulseOptimizeAllRunId = (w.__neoPulseOptimizeAllRunId ?? 0) + 1;
  return w.__neoPulseOptimizeAllRunId;
}

function isOptimizeAllRunCurrent(runId: number): boolean {
  if (typeof window === "undefined") return true;
  return (window as WindowWithOptimizeRunId).__neoPulseOptimizeAllRunId === runId;
}

// Invalidate any orphaned pre-HMR loop immediately on module evaluation
if (typeof window !== "undefined") {
  nextOptimizeAllRunId();
}

export function useOverviewTabAutoSeoOptimizeAll({
  bulkScopeUrlKeysRef,
  rowsRef,
  displayRowsRef,
  site,
  opt,
  sitemapSource,
  handleDataForSeoResearch,
  handleAiTitleRow,
  handleAiMetaRow,
  handleAiFaqRowAll,
  updateRow,
  uploadAfterRowWrite,
  getInventoryMatchForUrl,
}: Args) {
  const handleOptimizeAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopeKeys = bulkScopeUrlKeysRef.current;
    if (scopeKeys.size === 0) {
      notify.error("No posts in the current grid to optimize. Clear filters or load the sitemap.");
      return;
    }
    const orderedDisplayIndices = overviewBulkRowIndicesForDisplayOrder(
      rowsRef.current,
      displayRowsRef.current,
      scopeKeys,
    );
    const scopedIndices =
      orderedDisplayIndices.length > 0
        ? orderedDisplayIndices
        : overviewBulkRowIndices(rowsRef.current, scopeKeys);
    if (scopedIndices.length === 0) {
      notify.error("No posts in the current grid to optimize.");
      return;
    }
    const urls = scopedIndices.map((index) => rowsRef.current[index]!.url);
    const batchKey = `${site.id}-batch`;

    // Claim the single global run slot (cancels any stale or pre-HMR loop immediately)
    const runId = nextOptimizeAllRunId();

    // Clear any stale row statuses left over from interrupted runs so only 1 row is ever sky-blue
    for (let i = 0; i < rowsRef.current.length; i += 1) {
      const r = rowsRef.current[i];
      if (r && r.status !== "idle") {
        updateRow(i, { status: "idle" });
      }
    }

    flushSync(() => {
      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      opt.setBulkOptimizationState((prev) => ({
        ...prev,
        [batchKey]: {
          urls,
          currentIndex: 0,
          urlStatuses: Object.fromEntries(
            urls.map((u, uIdx) => [u, uIdx === 0 ? ("optimizing" as const) : ("pending" as const)]),
          ),
          currentStep: "SERP Research Brief",
          currentUrl: urls[0],
          runKind: "content",
        },
      }));
    });

    const setStepTelemetry = (
      url: string,
      pos: number,
      stepNumber: number,
      totalSteps: number,
      stepTitle: string,
    ) => {
      if (!isOptimizeAllRunCurrent(runId)) return;
      const pct = Math.min(100, Math.max(5, Math.round((stepNumber / Math.max(totalSteps, 1)) * 100)));
      opt.setBulkOptimizationState((prev) => {
        const cur = prev[batchKey];
        const baseUrls = cur?.urls?.length ? cur.urls : urls;
        const baseStatuses: BulkOptimizationState["urlStatuses"] = Object.fromEntries(
          baseUrls.map((u, uIdx) => {
            if (u === url || uIdx === pos) return [u, "optimizing" as const];
            if (uIdx < pos) return [u, cur?.urlStatuses?.[u] ?? ("completed" as const)];
            return [u, "pending" as const];
          }),
        );
        return {
          ...prev,
          [batchKey]: {
            ...(cur || {}),
            urls: baseUrls,
            runKind: "content",
            currentIndex: pos,
            currentUrl: url,
            currentStep: stepTitle,
            currentProgress: pct,
            urlStatuses: baseStatuses,
            currentStepProgress: harnessStepProgress(cur?.currentStepProgress, {
              step: `${stepNumber}/${totalSteps}`,
              progress: pct,
              message: stepTitle,
              harnessPlannedSectionCount: totalSteps,
            }),
          },
        };
      });
    };

    try {
      for (let pos = 0; pos < scopedIndices.length; pos += 1) {
        if (!isOptimizeAllRunCurrent(runId)) return;
        const idx = scopedIndices[pos]!;
        let latestRow = rowsRef.current[idx];
        if (!latestRow?.url) continue;
        const url = latestRow.url;
        clearOverviewStudioRevisions(url);
        const revisionRunId = String(runId);

        try {
          const isPages =
            sitemapSource === "pages" ||
            latestRow.contentFormat === "elementor" ||
            Boolean(latestRow.elementorDataJson?.trim());

          let resolvedHtml =
            latestRow.postContentOptimized?.trim() || latestRow.postContent?.trim() || "";
          if (!isPages) {
            try {
              const sourceRes = await resolveAiseoHarnessSourceHtml({
                row: latestRow,
                site,
                sitemapSource,
                getInventoryMatchForUrl,
              });
              if (!isOptimizeAllRunCurrent(runId)) return;
              if (sourceRes.html?.trim()) {
                resolvedHtml = sourceRes.html;
              }
            } catch (err) {
              logger.warn("[Auto SEO] Source HTML resolve warning for", url, err);
            }
          }

          if (!isPages && resolvedHtml.trim() && !latestRow.postContent?.trim()) {
            updateRow(idx, { postContent: resolvedHtml, postContentOptimized: resolvedHtml });
            latestRow = rowsRef.current[idx] ?? latestRow;
          }

          const pageHeaders = isPages
            ? elementorSectionHeadersFromCachedRow(latestRow).filter((sec) => {
                const key = (sec.title ?? "").trim().toLowerCase();
                return key !== "faq" && key !== "frequently asked questions";
              })
            : [];

          const bodyStepsCount = isPages
            ? pageHeaders.length
            : countAutoSeoBlogBodySteps(resolvedHtml);
          const totalSteps = 1 + bodyStepsCount + 2;

          // Step 1: SERP Research Brief (never gate the run if DataForSEO has a payment/auth issue)
          setStepTelemetry(url, pos, 1, totalSteps, "SERP Research Brief");
          if (!latestRow.focusKeyword?.trim()) {
            const slugHint = normalizeFocusKeywordPhrase(pathSlugToFocusHint(url) || "");
            if (slugHint) {
              updateRow(idx, { focusKeyword: slugHint });
              latestRow = rowsRef.current[idx] ?? { ...latestRow, focusKeyword: slugHint };
            }
          }
          // Auto SEO content: use existing brief as read-only context; never refresh or overwrite it.
          const shouldRunDfsResearch =
            !isDfsPaymentLatched() && !latestRow.seoResearch?.trim();
          if (shouldRunDfsResearch) {
            try {
              await handleDataForSeoResearch(idx, { silent: true, skipGsc: true });
              if (!isOptimizeAllRunCurrent(runId)) return;
              latestRow = rowsRef.current[idx] ?? latestRow;
            } catch (err) {
              logger.warn("[Auto SEO] Research step warning for", url, err);
            } finally {
              updateRow(idx, { status: "idle" });
            }
          }

          // Content sections (parallel with bounded concurrency, committed in document order)
          if (isPages) {
            const siblingTitles = pageHeaders.map((s) => s.title);
            const workingHeaders = [...pageHeaders];
            const elLimit = pLimit(6);
            const sectionResults = await Promise.all(
              workingHeaders.map((sec, sIdx) =>
                elLimit(async () => {
                  if (!isOptimizeAllRunCurrent(runId)) return null;
                  const secBody = (sec.bodyHtml || sec.bodyText || "").trim();
                  const stepNum = 2 + sIdx;
                  setStepTelemetry(
                    url,
                    pos,
                    stepNum,
                    totalSteps,
                    sec.title?.trim() || `Section ${sIdx + 1}`,
                  );
                  if (!secBody) return null;

                  const elBodyBefore = secBody;
                  try {
                    const rewritten = await rewriteBlogPassageSection({
                      mode: "copy",
                      section: {
                        id: sec.id || `sec-${sIdx}`,
                        index: sIdx,
                        h2OpenTag: "<h2>",
                        title: sec.title,
                        bodyHtml: secBody,
                      },
                      siblingTitles: siblingTitles.filter((_, i) => i !== sIdx),
                      articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                      focusKeyword: latestRow.focusKeyword?.trim() || "",
                      seoResearchBrief: latestRow.seoResearch,
                      siteId: site.id,
                      siteUrl: site.siteUrl,
                      pageUrl: url,
                      businessName: site.name,
                    });
                    if (!isOptimizeAllRunCurrent(runId)) return null;
                    const normalizedHtml = normalizeSectionProseHtml(rewritten.bodyHtml);
                    return { sIdx, sec, elBodyBefore, normalizedHtml };
                  } catch (err) {
                    logger.warn(
                      `[Auto SEO] Page section ${sIdx + 1} warning for ${url}:`,
                      err,
                    );
                    return null;
                  }
                }),
              ),
            );
            if (!isOptimizeAllRunCurrent(runId)) return;
            for (const res of sectionResults) {
              if (!res) continue;
              const { sIdx, sec, elBodyBefore, normalizedHtml } = res;
              recordOverviewStudioRevision({
                pageUrl: url,
                stepLabel: sec.title?.trim() || `Section ${sIdx + 1}`,
                sectionTitle: sec.title?.trim() || undefined,
                runId: revisionRunId,
                beforeHtml: elBodyBefore,
                afterHtml: normalizedHtml,
              });
              workingHeaders[sIdx] = {
                ...sec,
                bodyHtml: normalizedHtml,
                bodyText: prosePlainText(normalizedHtml),
              };
            }
            updateRow(idx, { elementorSectionHeaders: [...workingHeaders] });
          } else {
            await runAutoSeoBlogBodyRewrite({
              sourceHtml: resolvedHtml,
              articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
              focusKeyword: latestRow.focusKeyword?.trim() || "",
              seoResearchBrief: latestRow.seoResearch,
              site,
              pageUrl: url,
              sitemapSource,
              revisionRunId,
              shouldContinue: () => isOptimizeAllRunCurrent(runId),
              onStepProgress: (stepIndex, _totalBodySteps, stepLabel) => {
                setStepTelemetry(url, pos, 1 + stepIndex, totalSteps, stepLabel);
              },
              onCommitHtml: (nextFull, h2Titles) => {
                updateRow(idx, {
                  postContentOptimized: nextFull,
                  postContent: nextFull,
                  ...(h2Titles.length > 0 ? { blogH2List: h2Titles } : {}),
                });
              },
            });
          }

          // Final steps: SEO Title & Meta Description, then FAQs (strictly one by one)
          if (!isOptimizeAllRunCurrent(runId)) return;
          try {
            await runAutoSeoMetaAndFaqFinale({
              rowIndex: idx,
              pageUrl: url,
              revisionRunId,
              getRow: () => rowsRef.current[idx],
              handleAiTitleRow,
              handleAiMetaRow,
              handleAiFaqRowAll,
              onStepStart: (stepLabel) => {
                const stepNum =
                  stepLabel === "SEO Title & Meta Description"
                    ? totalSteps - 1
                    : totalSteps;
                setStepTelemetry(url, pos, stepNum, totalSteps, stepLabel);
              },
            });
          } finally {
            updateRow(idx, { status: "idle" });
          }
          latestRow = rowsRef.current[idx] ?? latestRow;

          if (!isOptimizeAllRunCurrent(runId)) return;

          // Fire WordPress upload in background so the next selected article starts immediately
          if (uploadAfterRowWrite) {
            latestRow = rowsRef.current[idx] ?? latestRow;
            const finalHtml =
              latestRow.postContentOptimized?.trim() || latestRow.postContent?.trim() || "";
            if (finalHtml) {
              void uploadAfterRowWrite({
                index: idx,
                url,
                html: finalHtml,
              }).catch((err) => {
                logger.warn("[Auto SEO] Background WP upload warning for", url, err);
              });
            }
          }
        } catch (postErr) {
          logger.warn("[Auto SEO] Article chain error for", url, postErr);
        } finally {
          updateRow(idx, { status: "idle" });
        }

        if (!isOptimizeAllRunCurrent(runId)) return;
        opt.setBulkOptimizationState((prev) => {
          const cur = prev[batchKey];
          const baseUrls = cur?.urls?.length ? cur.urls : urls;
          return {
            ...prev,
            [batchKey]: {
              ...(cur || { urls: baseUrls, currentIndex: pos, currentStep: "Complete" }),
              urls: baseUrls,
              runKind: "content",
              urlStatuses: { ...(cur?.urlStatuses || {}), [url]: "completed" },
            },
          };
        });
      }
    } finally {
      if (isOptimizeAllRunCurrent(runId)) {
        setOptimizingState(opt.setIsOptimizingContent, batchKey, false);
      }
    }
  }, [
    bulkScopeUrlKeysRef,
    rowsRef,
    displayRowsRef,
    site,
    opt,
    sitemapSource,
    handleDataForSeoResearch,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiFaqRowAll,
    updateRow,
    uploadAfterRowWrite,
    getInventoryMatchForUrl,
  ]);

  return { handleOptimizeAll };
}
