import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  buildOverviewBulkGeneratorDetailsProps,
  buildOverviewBulkMicroSnapshot,
  isOverviewBulkDetailsRun,
} from "@/lib/overview/overview-bulk-details-bindings";
import { buildSitemapApproveHarnessSections } from "@/lib/sitemap-optimizer/sitemap-approve-harness";
import type { SitemapApproveProgressView } from "@/lib/sitemap-optimizer/sitemap-approve-progress-display";
import { sitemapPlanHeaderProgressToBlogImport } from "@/lib/sitemap-optimizer/sitemap-plan-header-progress";

const SITEMAP_MERGE_PUBLISH_BATCH_KEY = "sitemap-merge-publish";

function overviewRowsFromBulkState(bulkState: BulkOptimizationState): OverviewRow[] {
  return (bulkState.urls ?? []).map((url) => {
    const keyword = bulkState.urlKeywords?.[url]?.trim() || "";
    return {
      url,
      title: keyword || url,
      metaDescription: "",
      aiTitle: "",
      aiMeta: "",
      status: "idle",
      focusKeyword: keyword || undefined,
    };
  });
}

function overviewInputFromBulkState(
  bulkState: BulkOptimizationState,
  workspaceBusy: boolean,
  entityPrimary: boolean,
) {
  const sitemapSource: OverviewSitemapSource = entityPrimary ? "sap" : "pages";
  return {
    siteId: SITEMAP_MERGE_PUBLISH_BATCH_KEY,
    batchKey: SITEMAP_MERGE_PUBLISH_BATCH_KEY,
    bulkState,
    overviewRows: overviewRowsFromBulkState(bulkState),
    isOptimizingContent: { [SITEMAP_MERGE_PUBLISH_BATCH_KEY]: workspaceBusy },
    optimizationFileManagers: {},
    sitemapSource,
  };
}

export type SitemapMergePublishDetailsInput = {
  approving: boolean;
  approveProgress: SitemapApproveProgressView | null;
  bulkState: BulkOptimizationState | null;
  workspaceBusy: boolean;
  pageSubtitle?: string;
  entityPrimary?: boolean;
};

export function sitemapMergePublishDetailsCanOpen(input: SitemapMergePublishDetailsInput): boolean {
  if (input.approving || input.approveProgress) return true;
  return isOverviewBulkDetailsRun(input.bulkState);
}

export function buildSitemapMergePublishBulkGeneratorDetailsProps(
  input: SitemapMergePublishDetailsInput,
): BulkGeneratorDetailsPanelProps | null {
  const entityPrimary = Boolean(input.entityPrimary);

  if (isOverviewBulkDetailsRun(input.bulkState)) {
    const props = buildOverviewBulkGeneratorDetailsProps(
      overviewInputFromBulkState(input.bulkState!, input.workspaceBusy, entityPrimary),
      input.workspaceBusy,
    );
    if (!props) return null;
    return {
      ...props,
      entitySapRowDisplay: entityPrimary || props.entitySapRowDisplay,
    };
  }

  if (!input.approving && !input.approveProgress) {
    return null;
  }

  const title = "Sitemap merge publish";
  const displayRows = [{ keyword: title, title, destination_url: title }];
  const harnessSections = buildSitemapApproveHarnessSections(input.approveProgress);
  const harnessByRow = new Map<number, BulkHarnessSectionUi[]>([[0, harnessSections]]);

  const status = input.approveProgress?.detail?.trim() ?? input.approveProgress?.phase ?? "";

  return {
    variant: "csv",
    workspaceBusy: input.workspaceBusy,
    headerProgress: input.approveProgress
      ? sitemapPlanHeaderProgressToBlogImport(
          {
            label: "Approve plan",
            phase: status || "Approve plan",
            completed: input.approveProgress.completed,
            total: Math.max(1, input.approveProgress.total),
          },
          input.approving,
        )
      : null,
    isProcessing: input.approving,
    status,
    harnessSections: [],
    harnessByRow,
    batchPrepHarnessSections: [],
    harnessPlannedSectionCount: harnessSections.length,
    currentRow: input.approving ? 0 : -1,
    totalRows: 1,
    displayRows,
    postDestination: "wordpress",
    wpConfig: null,
    entitySapRowDisplay: entityPrimary,
    pipelineSectionTitles: harnessSections.map((section) => section.title),
    liveMessage: input.pageSubtitle?.trim() || undefined,
  };
}

export function buildSitemapMergePublishMicroSnapshot(
  input: SitemapMergePublishDetailsInput,
): MetaBulkMicroSnapshot | null {
  if (isOverviewBulkDetailsRun(input.bulkState)) {
    return buildOverviewBulkMicroSnapshot(
      overviewInputFromBulkState(
        input.bulkState!,
        input.workspaceBusy,
        Boolean(input.entityPrimary),
      ),
    );
  }

  if (!input.approving || !input.approveProgress) return null;

  const phase = input.approveProgress.phase;
  const { completed, total } = input.approveProgress;
  const progressPct =
    total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : undefined;

  return {
    label: input.approveProgress.detail?.trim() || phase,
    completed,
    total: total || 1,
    progressPct,
  };
}
