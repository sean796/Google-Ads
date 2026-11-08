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

  // 1. SEO Title & Meta Description (in parallel)
  onStepStart?.("SEO Title & Meta Description");
  const initialRow = getRow();
  if (initialRow) {
    const titleBefore = (initialRow.aiTitle || initialRow.title || "").trim();
    const metaBefore = (initialRow.aiMeta || initialRow.metaDescription || "").trim();

    const runTitleTask = async () => {
      if (overviewTitleOptimizationExcluded(initialRow)) return;
      try {
        await handleAiTitleRow(rowIndex, initialRow, { skipOptimizeTitleLoading: true });
        const updatedRow = getRow() ?? initialRow;
        const titleAfter = (updatedRow.aiTitle || updatedRow.title || "").trim();
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
    };

    const runMetaTask = async () => {
      try {
        await handleAiMetaRow(rowIndex, initialRow, { skipOptimizeMetaLoading: true });
        const updatedRow = getRow() ?? initialRow;
        const metaAfter = (updatedRow.aiMeta || updatedRow.metaDescription || "").trim();
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
    };

    await Promise.all([runTitleTask(), runMetaTask()]);
  }

  // 2. FAQs (runs after Title & Meta finish)
  onStepStart?.("FAQs");
  const row = getRow() ?? initialRow;
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
