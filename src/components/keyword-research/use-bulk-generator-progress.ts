import { useMemo } from "react";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { PressReleaseWorkspaceBindings } from "@/components/press-release/press-release-workspace-bindings";
import { GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES } from "@/lib/overview/overview-content-optimize-pipeline";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { BULK_POST_DESTINATION_CHOICES } from "@/lib/bulk-auto-generate";
import {
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
} from "@/lib/bulk/blog-import-header-progress";
import {
  buildPressReleaseMicroSnapshot,
  pressReleaseHeaderProgressFromState,
} from "@/lib/press-release/press-release-header-progress";
import { buildVerticalBenchmarkMicroSnapshot } from "@/lib/vertical-benchmark/vertical-benchmark-header-progress";
import type { useVerticalBenchmarkController } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";

type VerticalBenchmarkController = ReturnType<typeof useVerticalBenchmarkController>;

type UseBulkGeneratorProgressArgs = {
  isPressRelease: boolean;
  isVerticalBenchmark: boolean;
  vb: VerticalBenchmarkController;
  bulkBindings: BulkGeneratorWorkspaceBindings | null;
  pressReleaseBindings: PressReleaseWorkspaceBindings | null;
};

export function useBulkGeneratorProgress({
  isPressRelease,
  isVerticalBenchmark,
  vb,
  bulkBindings,
  pressReleaseBindings,
}: UseBulkGeneratorProgressArgs) {
  const workspaceBusy = isPressRelease
    ? Boolean(pressReleaseBindings?.isProcessing)
    : Boolean(bulkBindings?.isProcessing) ||
      Boolean(bulkBindings?.isGeneratingChecklist) ||
      Boolean(bulkBindings?.csvEnrichingTitlesUrls) ||
      (isVerticalBenchmark && Boolean(vb.busy));

  const headerProgress = useMemo(() => {
    if (isPressRelease) {
      return pressReleaseHeaderProgressFromState({
        isProcessing: Boolean(pressReleaseBindings?.isProcessing),
        runPhase: pressReleaseBindings?.runPhase,
        harnessSections: pressReleaseBindings?.harnessSections ?? [],
        harnessPlannedSectionCount: pressReleaseBindings?.harnessPlannedSectionCount ?? null,
      });
    }
    if (isVerticalBenchmark && vb.generatingBulkTemplate && vb.bulkTemplateProgress) {
      const steps = vb.bulkTemplateProgress.steps ?? [];
      const done = steps.filter((s) => s.status === "done").length;
      return {
        phase: vb.bulkTemplateProgress.message?.trim() || "Curating peer GSC ideas",
        completed: done,
        total: Math.max(steps.length, 1),
        progressPct: vb.bulkTemplateProgress.percent,
        harnessActive: true,
      };
    }
    if (bulkBindings?.isGeneratingChecklist) {
      const pct = bulkBindings.checklistProgressPct;
      return {
        phase: bulkBindings.checklistPhase?.trim() || "Generating blog ideas",
        completed: 0,
        total: 1,
        progressPct: typeof pct === "number" ? pct : 0,
        harnessActive: false,
      };
    }
    return blogImportHeaderProgressFromBulk({
      status: bulkBindings?.status,
      isProcessing: bulkBindings?.isProcessing,
      harnessSections: bulkBindings?.harnessSections,
      harnessPlannedSectionCount: bulkBindings?.harnessPlannedSectionCount,
      currentRow: bulkBindings?.currentRow ?? 0,
      batchRowProgress:
        Boolean(bulkBindings?.isProcessing) &&
        (bulkBindings?.totalRows ?? 0) > 0
          ? {
              current: bulkBindings!.currentRow,
              total: bulkBindings!.totalRows,
            }
          : undefined,
    });
  }, [
    isPressRelease,
    isVerticalBenchmark,
    vb.generatingBulkTemplate,
    vb.bulkTemplateProgress,
    pressReleaseBindings,
    bulkBindings,
  ]);

  const progressSnapshot = useMemo(() => {
    if (isPressRelease) {
      return buildPressReleaseMicroSnapshot(headerProgress);
    }
    if (
      isVerticalBenchmark &&
      !bulkBindings?.isProcessing &&
      (vb.generatingBulkTemplate || vb.bulkTemplateProgress)
    ) {
      return buildVerticalBenchmarkMicroSnapshot({
        exporting: vb.exporting,
        generatingBulkTemplate: vb.generatingBulkTemplate,
        exportProgress: vb.exportProgress,
        bulkTemplateProgress: vb.bulkTemplateProgress,
      });
    }
    return buildBlogImportMicroSnapshot(headerProgress, "Studio");
  }, [
    headerProgress,
    isPressRelease,
    isVerticalBenchmark,
    bulkBindings?.isProcessing,
    vb.exporting,
    vb.generatingBulkTemplate,
    vb.exportProgress,
    vb.bulkTemplateProgress,
  ]);

  const postDestinationChoices = BULK_POST_DESTINATION_CHOICES;
  const postDestination = bulkBindings?.bulkPostDestination ?? "wordpress";

  const warmSiteDetails = useOverviewSiteWarmDetails(bulkBindings?.wordPressSite ?? null);

  const mergedInventoryDetails = useMemo(() => {
    const bindingLinks = bulkBindings?.sitemapInventoryLinks ?? [];
    const links =
      warmSiteDetails.sitemapInventoryLinks.length > 0
        ? warmSiteDetails.sitemapInventoryLinks
        : bindingLinks;
    const gscHostedLink =
      warmSiteDetails.gscHostedLink ??
      bulkBindings?.gscHostedLink ??
      bulkBindings?.siteKwHostedLink ??
      null;
    const sitemapInventoryLoading =
      warmSiteDetails.sitemapInventoryLoading ||
      Boolean(bulkBindings?.sitemapInventoryLoading);
    return { links, gscHostedLink, sitemapInventoryLoading };
  }, [bulkBindings, warmSiteDetails]);

  const googleImagePipelineTitles = useMemo(
    () =>
      bulkBindings?.featuredImageType === "google-maps"
        ? [...GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES]
        : undefined,
    [bulkBindings?.featuredImageType],
  );

  const wpConfig = useMemo(
    () =>
      bulkBindings
        ? {
        selectedWordPressSites: bulkBindings.selectedWordPressSites,
        setSelectedWordPressSites: bulkBindings.setSelectedWordPressSites,
        siteConfigs: bulkBindings.siteConfigs,
        setSiteConfigs: bulkBindings.setSiteConfigs,
        scheduleFrequency: bulkBindings.scheduleFrequency,
        setScheduleFrequency: bulkBindings.setScheduleFrequency,
        customInterval: bulkBindings.customInterval,
        setCustomInterval: bulkBindings.setCustomInterval,
        dayOfWeek: bulkBindings.dayOfWeek,
        setDayOfWeek: bulkBindings.setDayOfWeek,
        startDateOption: bulkBindings.startDateOption,
        setStartDateOption: bulkBindings.setStartDateOption,
        customStartDate: bulkBindings.customStartDate,
        setCustomStartDate: bulkBindings.setCustomStartDate,
        startTime: bulkBindings.startTime,
        setStartTime: bulkBindings.setStartTime,
        useCsvPublishDates: bulkBindings.useCsvPublishDates,
        setUseCsvPublishDates: bulkBindings.setUseCsvPublishDates,
        wordpressDraftOnly: bulkBindings.wordpressDraftOnly,
        setWordpressDraftOnly: bulkBindings.setWordpressDraftOnly,
        previewRows: bulkBindings.previewRows,
        rowOrder: bulkBindings.rowOrder,
        setRowOrder: bulkBindings.setRowOrder,
        connectedSite: bulkBindings.connectedSite,
        postDestination: bulkBindings.bulkPostDestination,
        setPostDestination: bulkBindings.setBulkPostDestination,
        postDestinationChoices,
        scheduleOccupancy: bulkBindings.scheduleOccupancy,
        scheduleOccupancyLoading: bulkBindings.scheduleOccupancyLoading,
      }
    : null,
    [bulkBindings, postDestinationChoices],
  );

  const baseDetailsProps = useMemo(
    () => ({
      workspaceBusy,
      headerProgress,
      isProcessing: Boolean(bulkBindings?.isProcessing),
      status: bulkBindings?.status ?? "",
      processingStepLog: bulkBindings?.processingStepLog ?? [],
      harnessSections: bulkBindings?.harnessSections ?? [],
      harnessByRow: bulkBindings?.harnessByRow ?? new Map(),
      harnessPlannedSectionCount: bulkBindings?.harnessPlannedSectionCount ?? null,
      currentRow: bulkBindings?.currentRow ?? 0,
      totalRows: bulkBindings?.totalRows ?? 0,
      displayRows: bulkBindings?.displayRows ?? [],
      postDestination,
      wpConfig,
      runKind: "content" as const,
      pipelineSectionTitles: googleImagePipelineTitles,
      entitySapRowDisplay: bulkBindings?.featuredImageType === "google-maps",
      sitemapInventoryLinks: mergedInventoryDetails.links,
      siteKwHostedLink: mergedInventoryDetails.gscHostedLink,
      sitemapInventoryLoading: mergedInventoryDetails.sitemapInventoryLoading,
    }),
    [
      workspaceBusy,
      headerProgress,
      bulkBindings,
      postDestination,
      wpConfig,
      googleImagePipelineTitles,
      mergedInventoryDetails,
    ],
  );

  return {
    workspaceBusy,
    headerProgress,
    progressSnapshot,
    postDestination,
    postDestinationChoices,
    mergedInventoryDetails,
    baseDetailsProps,
  };
}
