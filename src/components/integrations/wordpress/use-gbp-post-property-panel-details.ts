import { useMemo } from "react";
import { type WordPressSite } from "../types";
import {
  buildGbpPostBulkGeneratorDetailsProps,
  gbpPostDetailsCanOpen,
  gbpPostIsMultiSiteDrawer,
} from "@/lib/gbp-post/gbp-post-bulk-generator-bindings";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { GbpPublishPreview } from "@/components/gbp-post/GbpPostPublishPreview";
import type { GbpPostsInventoryHostedLink } from "@/lib/gbp-post/gbp-posts-inventory";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { useGbpPostRoster } from "@/hooks/gbp-post/use-gbp-post-roster";

export function useGbpPostPropertyPanelDetails(input: {
  roster: ReturnType<typeof useGbpPostRoster>;
  isBusy: boolean;
  resolvedTopic: string;
  selectedCount: number;
  bulkSummary: { published: number; queued: number; failed: number; lastError?: string } | null;
  statusLine: string;
  multiPropertyRun: boolean;
  harnessSectionsBySiteId: Record<string, HarnessSectionListItem[]>;
  harnessSections: HarnessSectionListItem[];
  previewBySiteId: Record<string, GbpPublishPreview | null>;
  displaySite: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  isPosting: boolean;
  harnessPlannedCount: number | null;
  bulkSlotIndex: number;
  harnessTotalRows: number;
  activeSiteId: string | null;
  activePropertyIndex: number;
  inventoryLinkBySiteId: Record<string, GbpPostsInventoryHostedLink>;
  totalPosts: number;
}) {
  const {
    roster,
    isBusy,
    resolvedTopic,
    selectedCount,
    bulkSummary,
    statusLine,
    multiPropertyRun,
    harnessSectionsBySiteId,
    harnessSections,
    previewBySiteId,
    displaySite,
    sitemapSource,
    isPosting,
    harnessPlannedCount,
    bulkSlotIndex,
    harnessTotalRows,
    activeSiteId,
    activePropertyIndex,
    inventoryLinkBySiteId,
    totalPosts,
  } = input;

  const canOpenDetails = useMemo(
    () =>
      gbpPostDetailsCanOpen(
        roster.rosterSites.length,
        isBusy,
        Boolean(resolvedTopic),
        selectedCount > 0,
        Boolean(bulkSummary) || Boolean(statusLine.trim()),
      ),
    [roster.rosterSites.length, isBusy, resolvedTopic, selectedCount, bulkSummary, statusLine],
  );

  const multiSiteDrawer = useMemo(
    () =>
      gbpPostIsMultiSiteDrawer({
        multiPropertyRun,
        selectedSites: roster.selectedSites,
        harnessSectionsBySiteId,
        hasRunData:
          Boolean(bulkSummary) ||
          harnessSections.length > 0 ||
          Object.keys(harnessSectionsBySiteId).length > 0 ||
          Object.values(previewBySiteId).some(Boolean),
      }),
    [
      multiPropertyRun,
      roster.selectedSites,
      harnessSectionsBySiteId,
      bulkSummary,
      harnessSections.length,
      previewBySiteId,
    ],
  );

  const detailsProps = useMemo(
    () =>
      buildGbpPostBulkGeneratorDetailsProps({
        displaySite,
        selectedSites: roster.selectedSites,
        topicForSite: roster.topicForSite,
        landingPageForSite: roster.landingPageForSite,
        sitemapSource,
        isPosting,
        workspaceBusy: isBusy,
        statusLine,
        resolvedTopic,
        harnessSections,
        harnessSectionsBySiteId,
        harnessPlannedCount,
        bulkSlotIndex,
        harnessTotalRows,
        multiPropertyRun,
        activeSiteId,
        activePropertyIndex,
        previewBySiteId,
        inventoryLinkBySiteId,
        bulkSummary,
        numberOfPosts: totalPosts,
        selectedCount,
        rosterCount: roster.rosterSites.length,
      }),
    [
      displaySite,
      roster.selectedSites,
      roster.topicForSite,
      roster.landingPageForSite,
      sitemapSource,
      isPosting,
      isBusy,
      statusLine,
      resolvedTopic,
      harnessSections,
      harnessSectionsBySiteId,
      harnessPlannedCount,
      bulkSlotIndex,
      harnessTotalRows,
      multiPropertyRun,
      activeSiteId,
      activePropertyIndex,
      previewBySiteId,
      inventoryLinkBySiteId,
      bulkSummary,
      totalPosts,
      selectedCount,
      roster.rosterSites.length,
    ],
  );

  return { canOpenDetails, multiSiteDrawer, detailsProps };
}
