import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
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

/** After body content: SEO title + meta (sequential) in parallel with FAQs. */
export async function runAutoSeoMetaAndFaqFinale(args: {
  rowIndex: number;
  pageUrl: string;
  revisionRunId?: string;
  getRow: () => OverviewRow | undefined;
  handleAiTitleRow: TitleHandler;
  handleAiMetaRow: MetaHandler;
  handleAiFaqRowAll: FaqHandler;
  faqOptions?: Parameters<FaqHandler>[2];
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
  } = args;

  const metaTask = async () => {
    let row = getRow();
    if (!row) return;
    if (!overviewTitleOptimizationExcluded(row)) {
      const titleBefore = (row.aiTitle || row.title || "").trim();
      try {
        await handleAiTitleRow(rowIndex, row, { skipOptimizeTitleLoading: true });
        row = getRow() ?? row;
        recordOverviewStudioTextRevision({
          pageUrl,
          stepLabel: "SEO Title",
          runId: revisionRunId,
          beforeText: titleBefore,
          afterText: (row.aiTitle || row.title || "").trim(),
        });
      } catch (err) {
        console.warn("[Auto SEO] Title step warning for", pageUrl, err);
      }
    }
    row = getRow() ?? row;
    const metaBefore = (row.aiMeta || row.metaDescription || "").trim();
    try {
      await handleAiMetaRow(rowIndex, row, { skipOptimizeMetaLoading: true });
      row = getRow() ?? row;
      recordOverviewStudioTextRevision({
        pageUrl,
        stepLabel: "Meta Description",
        runId: revisionRunId,
        beforeText: metaBefore,
        afterText: (row.aiMeta || row.metaDescription || "").trim(),
      });
    } catch (err) {
      console.warn("[Auto SEO] Meta step warning for", pageUrl, err);
    }
  };

  const faqTask = async () => {
    const row = getRow();
    if (!row) return;
    const faqBefore = row.faq?.trim() || "";
    try {
      await handleAiFaqRowAll(rowIndex, row, {
        silentToast: true,
        skipFaqLoading: true,
        skipUploadAfterRowWrite: true,
        onMicroStep: () => {},
        ...faqOptions,
      });
      const after = getRow();
      recordOverviewStudioTextRevision({
        pageUrl,
        stepLabel: "FAQs",
        runId: revisionRunId,
        beforeText: faqBefore,
        afterText: after?.faq?.trim() || "",
      });
    } catch (err) {
      console.warn("[Auto SEO] FAQ step warning for", pageUrl, err);
    }
  };

  await Promise.all([metaTask(), faqTask()]);
}
