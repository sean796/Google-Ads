import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { logger } from "@/lib/logger";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { extractFaqFromPostHtml } from "@/lib/overview/overview-row-scrape";
import {
  recordOverviewStudioTextRevision,
} from "@/lib/overview/record-overview-studio-revision";

type TitleHandler = (
  index: number,
  row?: OverviewRow,
  options?: { skipOptimizeTitleLoading?: boolean },
) => Promise<unknown>;

type MetaHandler = (
  index: number,
  row?: OverviewRow,
  options?: { skipOptimizeMetaLoading?: boolean },
) => Promise<unknown>;

type FaqHandler = (
  index: number,
  row: OverviewRow,
  options?: {
    silentToast?: boolean;
    skipFaqLoading?: boolean;
    skipUploadAfterRowWrite?: boolean;
    onMicroStep?: () => void;
  },
) => Promise<unknown>;

/** After body content: run SEO Title, then Meta Description, then FAQs strictly one by one (never in parallel). */
export async function runAutoSeoMetaAndFaqFinale(args: {
  rowIndex: number;
  pageUrl: string;
  revisionRunId?: string;
  getRow: () => OverviewRow | undefined;
  handleAiTitleRow: TitleHandler;
  handleAiMetaRow: MetaHandler;
  handleAiFaqRowAll: FaqHandler;
  faqOptions?: Parameters<FaqHandler>[2];
  onStepStart?: (stepLabel: "SEO Title & Meta Description" | "FAQs") => void;
}): Promise<void> {
  const {
    rowIndex,
    pageUrl,
    revisionRunId,
    getRow,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiFaqRowAll,
    faqOptions,
    onStepStart,
  } = args;

  // 1. SEO Title & Meta Description (one by one)
  onStepStart?.("SEO Title & Meta Description");
  let row = getRow();
  if (row && !overviewTitleOptimizationExcluded(row)) {
    const titleBefore = (row.aiTitle || row.title || "").trim();
    try {
      await handleAiTitleRow(rowIndex, row, { skipOptimizeTitleLoading: true });
      row = getRow() ?? row;
      const titleAfter = (row.aiTitle || row.title || "").trim();
      recordOverviewStudioTextRevision({
        pageUrl,
        stepLabel: "SEO Title",
        runId: revisionRunId,
        beforeText: titleBefore,
        afterText: titleAfter,
      });
    } catch (err) {
      logger.warn("[Auto SEO] Title step warning for", pageUrl, err);
    }
  }

  row = getRow() ?? row;
  if (row) {
    const metaBefore = (row.aiMeta || row.metaDescription || "").trim();
    try {
      await handleAiMetaRow(rowIndex, row, { skipOptimizeMetaLoading: true });
      row = getRow() ?? row;
      const metaAfter = (row.aiMeta || row.metaDescription || "").trim();
      recordOverviewStudioTextRevision({
        pageUrl,
        stepLabel: "Meta Description",
        runId: revisionRunId,
        beforeText: metaBefore,
        afterText: metaAfter,
      });
    } catch (err) {
      logger.warn("[Auto SEO] Meta step warning for", pageUrl, err);
    }
  }

  // 2. FAQs (runs after Title & Meta finish)
  onStepStart?.("FAQs");
  row = getRow() ?? row;
  if (row) {
    const faqBefore =
      row.faq?.trim() ||
      extractFaqFromPostHtml(row.postContentOptimized || row.postContent || "") ||
      "";
    try {
      await handleAiFaqRowAll(rowIndex, row, {
        silentToast: true,
        skipFaqLoading: true,
        skipUploadAfterRowWrite: true,
        onMicroStep: () => {},
        ...faqOptions,
      });
      const after = getRow();
      const faqAfter =
        after?.faq?.trim() ||
        extractFaqFromPostHtml(after?.postContentOptimized || after?.postContent || "") ||
        "";
      recordOverviewStudioTextRevision({
        pageUrl,
        stepLabel: "FAQs",
        runId: revisionRunId,
        beforeText: faqBefore,
        afterText: faqAfter,
      });
    } catch (err) {
      logger.warn("[Auto SEO] FAQ step warning for", pageUrl, err);
    }
  }
}
