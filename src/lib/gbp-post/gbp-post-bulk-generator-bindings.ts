import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { WordPressSite } from "@/components/integrations/types";
import type { GbpPublishPreview } from "@/components/gbp-post/GbpPostPublishPreview";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { GBP_POST_PIPELINE_TITLES } from "@/lib/gbp-post/gbp-post-card-pipeline";
import { sortGbpPostSitesByName } from "@/lib/gbp-post/gbp-site-eligibility";
import { gbpPostHeaderProgressFromState } from "@/lib/gbp-post/gbp-post-header-progress";
import type { GbpPostsInventoryHostedLink } from "@/lib/gbp-post/gbp-posts-inventory";
import {
  OVERVIEW_SITEMAP_SOURCE_LABELS,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export function gbpPostSiteToCsvRow(
  site: WordPressSite,
  topic?: string,
  landingPageUrl?: string,
): CSVRow {
  const keyword = topic?.trim() || undefined;
  const destination =
    landingPageUrl?.trim() || site.siteUrl?.trim() || undefined;
  return {
    keyword,
    title: site.name?.trim() || "GBP post",
    destination_url: destination,
  };
}

function toHarnessUi(sections: HarnessSectionListItem[]): BulkHarnessSectionUi[] {
  return sections.map((section) => ({
    sectionIndex: section.sectionIndex,
    title: section.title,
    status: section.status,
    markdown: section.markdown,
    truncated: section.truncated,
  }));
}

function isGbpMultiSiteDrawer(options: {
  multiPropertyRun: boolean;
  selectedSites: WordPressSite[];
  harnessSectionsBySiteId: Record<string, HarnessSectionListItem[]>;
  hasRunData: boolean;
}): boolean {
  if (options.selectedSites.length <= 1) return false;
  if (options.multiPropertyRun) return true;
  return options.hasRunData && Object.keys(options.harnessSectionsBySiteId).length > 0;
}

function resolveGbpDisplayRows(options: {
  selectedSites: WordPressSite[];
  topicForSite: (siteId: string) => string;
  landingPageForSite: (siteId: string) => string;
  displaySite: WordPressSite;
  resolvedTopic: string;
  isPosting: boolean;
  multiPropertyRun: boolean;
  multiSiteDrawer: boolean;
  totalPosts: number;
  hasRunData: boolean;
}): CSVRow[] {
  const { selectedSites, isPosting, multiSiteDrawer, totalPosts, displaySite } = options;

  if (isPosting || options.hasRunData) {
    if (multiSiteDrawer) {
      return selectedSites.map((site) =>
        gbpPostSiteToCsvRow(
          site,
          options.topicForSite(site.id),
          options.landingPageForSite(site.id),
        ),
      );
    }
    if (totalPosts > 1) {
      const topic = options.resolvedTopic || options.topicForSite(displaySite.id);
      return Array.from({ length: totalPosts }, (_, index) => ({
        keyword: topic || undefined,
        title: `${displaySite.name} · Post ${index + 1}`,
        destination_url:
          options.landingPageForSite(displaySite.id).trim() ||
          displaySite.siteUrl?.trim() ||
          undefined,
      }));
    }
    return [
      gbpPostSiteToCsvRow(
        displaySite,
        options.resolvedTopic || options.topicForSite(displaySite.id),
        options.landingPageForSite(displaySite.id),
      ),
    ];
  }

  if (selectedSites.length > 0) {
    return selectedSites.map((site) =>
      gbpPostSiteToCsvRow(
        site,
        options.topicForSite(site.id),
        options.landingPageForSite(site.id),
      ),
    );
  }
  return [];
}

function buildGbpHarnessByRow(options: {
  displaySites: WordPressSite[];
  harnessSections: HarnessSectionListItem[];
  harnessSectionsBySiteId: Record<string, HarnessSectionListItem[]>;
  bulkSlotIndex: number;
  multiSiteDrawer: boolean;
}): Map<number, BulkHarnessSectionUi[]> {
  const map = new Map<number, BulkHarnessSectionUi[]>();

  if (options.multiSiteDrawer) {
    options.displaySites.forEach((site, index) => {
      const sections = options.harnessSectionsBySiteId[site.id];
      if (sections?.length) map.set(index, toHarnessUi(sections));
    });
    return map;
  }

  if (options.harnessSections.length > 0) {
    map.set(options.bulkSlotIndex, toHarnessUi(options.harnessSections));
  }

  return map;
}

function buildGbpPostRowFiles(
  preview: GbpPublishPreview | null,
  inventoryLink: GbpPostsInventoryHostedLink | null | undefined,
  rowIndex: number,
  rowData: CSVRow,
): BulkGeneratedFile[] {
  const files: BulkGeneratedFile[] = [];
  let ts = Date.now();

  if (inventoryLink?.href) {
    files.push({
      id: `gbp-${rowIndex}-inventory`,
      rowIndex,
      fileName: inventoryLink.filename,
      content: inventoryLink.href,
      mimeType: "text/plain;charset=utf-8",
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  if (preview?.summary?.trim()) {
    files.push({
      id: `gbp-${rowIndex}-summary`,
      rowIndex,
      fileName: "gbp-post-summary.md",
      content: preview.summary.trim(),
      mimeType: "text/markdown;charset=utf-8",
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  if (preview?.moneyPageUrl?.trim()) {
    files.push({
      id: `gbp-${rowIndex}-cta`,
      rowIndex,
      fileName: "gbp-learn-more-link.txt",
      content: preview.moneyPageUrl.trim(),
      mimeType: "text/plain;charset=utf-8",
      status: "completed",
      timestamp: ts++,
      rowData,
    });
  }

  return files;
}

function buildFilesByRow(options: {
  displayRows: CSVRow[];
  displaySites: WordPressSite[];
  previewBySiteId: Record<string, GbpPublishPreview | null>;
  inventoryLinkBySiteId: Record<string, GbpPostsInventoryHostedLink>;
}): Map<number, BulkGeneratedFile[]> {
  const map = new Map<number, BulkGeneratedFile[]>();

  options.displayRows.forEach((row, index) => {
    const site = options.displaySites[index];
    if (!site) return;
    const preview = options.previewBySiteId[site.id] ?? null;
    const inventoryLink = options.inventoryLinkBySiteId[site.id] ?? null;
    const files = buildGbpPostRowFiles(preview, inventoryLink, index, row);
    if (files.length) map.set(index, files);
  });

  return map;
}

export function buildGbpLiveMessage(options: {
  displaySite: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  selectedCount: number;
  rosterCount: number;
  numberOfPosts: number;
  resolvedTopic: string;
  keyword: string;
  multiSiteDrawer: boolean;
  isPosting: boolean;
  statusLine: string;
  bulkSummary: { published: number; queued: number; failed: number; lastError?: string } | null;
}): string | null {
  const parts: string[] = options.multiSiteDrawer
    ? [
        `${options.selectedCount} sites`,
        OVERVIEW_SITEMAP_SOURCE_LABELS[options.sitemapSource],
        `${options.selectedCount}/${options.rosterCount} selected`,
        `${options.numberOfPosts} post${options.numberOfPosts !== 1 ? "s" : ""}/run`,
        "Multi-site",
      ]
    : [
        options.displaySite.name,
        OVERVIEW_SITEMAP_SOURCE_LABELS[options.sitemapSource],
        `${options.selectedCount}/${options.rosterCount} selected`,
        `${options.numberOfPosts} post${options.numberOfPosts !== 1 ? "s" : ""}/run`,
      ];

  if (!options.multiSiteDrawer) {
    const topic = options.resolvedTopic.trim() || options.keyword.trim();
    if (topic) parts.push(`Topic: ${topic}`);
  }

  if (!options.isPosting) {
    const status = options.statusLine.trim();
    if (status) parts.push(status);
    const summary = options.bulkSummary;
    if (summary && summary.published + summary.queued + summary.failed > 0) {
      parts.push(
        `${summary.published} published, ${summary.queued} queued${summary.failed > 0 ? `, ${summary.failed} failed` : ""}`,
      );
    }
  }

  return parts.join(" · ");
}

export function gbpPostIsMultiSiteDrawer(options: {
  multiPropertyRun: boolean;
  selectedSites: WordPressSite[];
  harnessSectionsBySiteId: Record<string, HarnessSectionListItem[]>;
  hasRunData: boolean;
}): boolean {
  return isGbpMultiSiteDrawer(options);
}

export function gbpPostDetailsCanOpen(
  rosterCount: number,
  isBusy: boolean,
  hasTopic: boolean,
  hasSelection: boolean,
  hasBulkSummary: boolean,
): boolean {
  return workspaceDetailsCanOpen(
    rosterCount > 0,
    isBusy,
    hasTopic,
    hasSelection,
    hasBulkSummary,
  );
}

export function buildGbpPostBulkGeneratorDetailsProps(options: {
  displaySite: WordPressSite;
  selectedSites: WordPressSite[];
  topicForSite: (siteId: string) => string;
  landingPageForSite: (siteId: string) => string;
  sitemapSource: OverviewSitemapSource;
  isPosting: boolean;
  workspaceBusy: boolean;
  statusLine: string;
  resolvedTopic: string;
  harnessSections: HarnessSectionListItem[];
  harnessSectionsBySiteId: Record<string, HarnessSectionListItem[]>;
  harnessPlannedCount: number | null;
  bulkSlotIndex: number;
  harnessTotalRows: number;
  multiPropertyRun: boolean;
  activeSiteId: string | null;
  activePropertyIndex: number;
  previewBySiteId: Record<string, GbpPublishPreview | null>;
  inventoryLinkBySiteId: Record<string, GbpPostsInventoryHostedLink>;
  bulkSummary: { published: number; queued: number; failed: number; lastError?: string } | null;
  numberOfPosts: number;
  selectedCount: number;
  rosterCount: number;
}): BulkGeneratorDetailsPanelProps {
  const hasRunData =
    Boolean(options.bulkSummary) ||
    options.harnessSections.length > 0 ||
    Object.keys(options.harnessSectionsBySiteId).length > 0 ||
    Object.values(options.previewBySiteId).some(Boolean);

  const multiSiteDrawer = isGbpMultiSiteDrawer({
    multiPropertyRun: options.multiPropertyRun,
    selectedSites: options.selectedSites,
    harnessSectionsBySiteId: options.harnessSectionsBySiteId,
    hasRunData,
  });

  const sortedSelectedSites = sortGbpPostSitesByName(options.selectedSites);
  const displaySites = multiSiteDrawer ? sortedSelectedSites : [options.displaySite];

  const displayRows = resolveGbpDisplayRows({
    selectedSites: sortedSelectedSites,
    topicForSite: options.topicForSite,
    landingPageForSite: options.landingPageForSite,
    displaySite: options.displaySite,
    resolvedTopic: options.resolvedTopic,
    isPosting: options.isPosting,
    multiPropertyRun: options.multiPropertyRun,
    multiSiteDrawer,
    totalPosts: options.numberOfPosts,
    hasRunData,
  });

  const activeRowIndex =
    options.isPosting && displaySites.length > 0
      ? options.activeSiteId
        ? displaySites.findIndex((site) => site.id === options.activeSiteId)
        : options.activePropertyIndex
      : displaySites.length > 0
        ? 0
        : -1;
  const currentRow =
    activeRowIndex >= 0 && activeRowIndex < displaySites.length
      ? activeRowIndex
      : options.isPosting && displaySites.length > 0
        ? 0
        : displaySites.length > 0
          ? 0
          : -1;

  const activeHarnessSections =
    multiSiteDrawer && options.isPosting && options.activeSiteId
      ? (options.harnessSectionsBySiteId[options.activeSiteId] ?? [])
      : multiSiteDrawer
        ? []
        : options.harnessSections;

  const liveHarness = toHarnessUi(activeHarnessSections);

  const headerStatusLine =
    multiSiteDrawer && options.isPosting && options.activePropertyIndex >= 0
      ? `Posting ${options.activePropertyIndex + 1}/${displaySites.length} · ${options.statusLine.trim()}`
      : options.statusLine;

  const headerProgress = gbpPostHeaderProgressFromState({
    isProcessing: options.isPosting,
    statusLine: headerStatusLine,
    harnessSections: liveHarness,
    harnessPlannedSectionCount: options.harnessPlannedCount,
    currentRow: multiSiteDrawer ? options.activePropertyIndex : options.bulkSlotIndex,
    totalRows: multiSiteDrawer ? displaySites.length : options.harnessTotalRows,
  });

  const downloadManager = new BulkFileManager();
  const keyword = options.topicForSite(options.displaySite.id);

  return {
    variant: "csv",
    workspaceBusy: options.workspaceBusy,
    headerProgress,
    isProcessing: options.isPosting,
    status: options.isPosting ? options.statusLine.trim() : "",
    liveMessage: buildGbpLiveMessage({
      displaySite: options.displaySite,
      sitemapSource: options.sitemapSource,
      selectedCount: options.selectedCount,
      rosterCount: options.rosterCount,
      numberOfPosts: options.numberOfPosts,
      resolvedTopic: options.resolvedTopic,
      keyword,
      multiSiteDrawer,
      isPosting: options.isPosting,
      statusLine: options.statusLine,
      bulkSummary: options.bulkSummary,
    }),
    harnessSections: liveHarness,
    harnessByRow: buildGbpHarnessByRow({
      displaySites,
      harnessSections: options.harnessSections,
      harnessSectionsBySiteId: options.harnessSectionsBySiteId,
      bulkSlotIndex: options.bulkSlotIndex,
      multiSiteDrawer,
    }),
    harnessPlannedSectionCount: options.harnessPlannedCount,
    prepAccordionTitle: "GBP prep",
    pipelineSectionTitles: [...GBP_POST_PIPELINE_TITLES],
    currentRow,
    totalRows: displayRows.length,
    displayRows,
    postDestination: "local",
    wpConfig: null,
    selectedCount: options.selectedCount,
    rowCount: options.rosterCount,
    filesByRow: buildFilesByRow({
      displayRows,
      displaySites,
      previewBySiteId: options.previewBySiteId,
      inventoryLinkBySiteId: options.inventoryLinkBySiteId,
    }),
    downloadFile: (file) => {
      downloadManager.downloadFile(file);
    },
  };
}
