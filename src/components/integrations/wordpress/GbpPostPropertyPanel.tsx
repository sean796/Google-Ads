import React, { useCallback, useEffect, useMemo, useState } from "react";
import { type WordPressSite } from "../types";
import {
  NOTIFY_GBP_POST_FAILED,
  NOTIFY_GBP_POST_PUBLISHED,
  NOTIFY_GBP_POST_QUEUED,
  NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_,
  NOTIFY_OPENROUTER_API_KEY_REQUIRED_IN_API_KEYS_,
  NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_,
  NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD,
} from "@/lib/notify-messages";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { loadApiKey } from "@/lib/api";
import {
  reduceHarnessSectionList,
  type HarnessSectionListItem,
} from "@/lib/bulk/harness-sections-reducer";
import { GbpPostClientRoster } from "@/components/gbp-post/GbpPostClientRoster";
import type { GbpPublishPreview } from "@/components/gbp-post/GbpPostPublishPreview";
import type { GbpSchedulerSectionState } from "@/lib/gbp-post/gbp-schedule-plan";
import { defaultGbpSchedulerState } from "@/lib/gbp-post/gbp-schedule-plan";
import { GbpPostWorkspaceHeader } from "@/components/gbp-post/GbpPostWorkspaceHeader";
import {
  buildGbpPostBulkGeneratorDetailsProps,
  gbpPostDetailsCanOpen,
  gbpPostIsMultiSiteDrawer,
} from "@/lib/gbp-post/gbp-post-bulk-generator-bindings";
import {
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_INNER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { useGbpPostRoster } from "@/hooks/gbp-post/use-gbp-post-roster";
import { useGbpPostLandingPages } from "@/hooks/gbp-post/use-gbp-post-landing-pages";
import { useGmbConnectionStatus } from "@/hooks/gbp-post/use-gmb-connection-status";
import { mergeServerGbpLocationIdsIntoLocalSites } from "@/components/integrations/storage";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { clampNumberOfGbpPosts } from "@/lib/gbp-post/gbp-schedule-plan";
import { runGbpSitePostBatch } from "@/lib/gbp-post/gbp-post-one-site";
import { runGbpMultiSiteBatch } from "@/lib/gbp-post/gbp-post-multi-site-batch";
import {
  gbpSitemapSourceEmptyMessage,
  resolveGbpSitemapUrlForSite,
} from "@/lib/gbp-post/gbp-sitemap-source";
import {
  revokeGbpPostsInventoryHostedLink,
  type GbpPostsInventoryHostedLink,
} from "@/lib/gbp-post/gbp-posts-inventory";
import {
  isOverviewPostsSourceAvailable,
  isOverviewSapSourceAvailable,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";

interface GbpPostPropertyPanelProps {
  site: WordPressSite;
  /** All WordPress properties; roster shows those with a GBP Location ID. */
  allSites: WordPressSite[];
  onPlatformChange?: (tab: "gbp-post" | "content-calendar" | "social-creator") => void;
}

function validateSitePrereqs(target: WordPressSite): string | null {
  // GBP roster is keyed on GBP Location ID; `enabled` is only the single active header connection.
  if (!target.gbpLocationId?.trim()) {
    return NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_;
  }
  if (!target.username?.trim() || !target.appPassword?.trim()) {
    return NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD;
  }
  if (!loadApiKey()?.trim() && !import.meta.env.VITE_OPENROUTER_API_KEY) {
    return NOTIFY_OPENROUTER_API_KEY_REQUIRED_IN_API_KEYS_;
  }
  return null;
}

export const GbpPostPropertyPanel: React.FC<GbpPostPropertyPanelProps> = ({
  site,
  allSites: _allSites,
  onPlatformChange,
}) => {
  const { sites: integrationSites, reloadSitesFromStorage } = useWordPressSites();
  const roster = useGbpPostRoster(integrationSites);
  const { connected: gmbConnected } = useGmbConnectionStatus();

  const syncGbpFromServer = useCallback(() => {
    void mergeServerGbpLocationIdsIntoLocalSites().then((merged) => {
      if (merged) reloadSitesFromStorage();
    });
  }, [reloadSitesFromStorage]);

  useEffect(() => {
    syncGbpFromServer();
  }, [syncGbpFromServer]);

  useEffect(() => {
    if (roster.rosterSites.length > 0) return;
    syncGbpFromServer();
  }, [roster.rosterSites.length, syncGbpFromServer]);

  const [scheduler, setScheduler] = useState<GbpSchedulerSectionState>(defaultGbpSchedulerState);
  const [isPosting, setIsPosting] = useState(false);
  const [multiPropertyRun, setMultiPropertyRun] = useState(false);
  const [harnessSections, setHarnessSections] = useState<HarnessSectionListItem[]>([]);
  const [harnessSectionsBySiteId, setHarnessSectionsBySiteId] = useState<
    Record<string, HarnessSectionListItem[]>
  >({});
  const [harnessPlannedCount, setHarnessPlannedCount] = useState<number | null>(3);
  const [bulkSlotIndex, setBulkSlotIndex] = useState(0);
  const [resolvedTopic, setResolvedTopic] = useState("");
  const [previewBySiteId, setPreviewBySiteId] = useState<Record<string, GbpPublishPreview | null>>({});
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [postingSiteIds, setPostingSiteIds] = useState<Set<string>>(() => new Set());
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [activePropertyIndex, setActivePropertyIndex] = useState(0);
  const [statusLine, setStatusLine] = useState("");
  const [bulkSummary, setBulkSummary] = useState<{
    published: number;
    queued: number;
    failed: number;
    lastError?: string;
  } | null>(null);
  const [inventoryLinkBySiteId, setInventoryLinkBySiteId] = useState<
    Record<string, GbpPostsInventoryHostedLink>
  >({});
  const [sitemapSource, setSitemapSource] = useState<OverviewSitemapSource>("pages");

  const disabled = site.enabled === false;
  const totalPosts = clampNumberOfGbpPosts(scheduler.numberOfPosts);
  const isMultiSlot = totalPosts > 1;
  const isBusy = isPosting;

  const landingPages = useGbpPostLandingPages({
    rosterSites: roster.rosterSites,
    sitemapSource,
    isBusy,
    landingPageUrlBySiteId: roster.landingPageUrlBySiteId,
    setLandingPageUrlBySiteId: roster.setLandingPageUrlBySiteId,
  });

  const clearInventoryHostedLinks = useCallback(() => {
    setInventoryLinkBySiteId((prev) => {
      for (const link of Object.values(prev)) {
        revokeGbpPostsInventoryHostedLink(link.href);
      }
      return {};
    });
  }, []);

  useEffect(() => () => clearInventoryHostedLinks(), [clearInventoryHostedLinks]);

  const setInventoryHostedLinkForSite = useCallback(
    (siteId: string, link: GbpPostsInventoryHostedLink) => {
      setInventoryLinkBySiteId((prev) => {
        revokeGbpPostsInventoryHostedLink(prev[siteId]?.href);
        return { ...prev, [siteId]: link };
      });
    },
    [],
  );

  const selectedCount = roster.selectedSites.length;
  const rosterSiteCount = roster.rosterSites.length;
  const allClientsSelected =
    rosterSiteCount > 0 && roster.rosterSites.every((s) => roster.selectedSiteIds.has(s.id));
  const someClientsSelected = roster.rosterSites.some((s) => roster.selectedSiteIds.has(s.id));
  const postsSourceAvailable = roster.rosterSites.some((s) => isOverviewPostsSourceAvailable(s));
  const sapSourceAvailable = roster.rosterSites.some((s) => isOverviewSapSourceAvailable(s));

  useEffect(() => {
    if (sitemapSource === "posts" && !postsSourceAvailable) {
      setSitemapSource("pages");
    }
    if (sitemapSource === "sap" && !sapSourceAvailable) {
      setSitemapSource("pages");
    }
  }, [sitemapSource, postsSourceAvailable, sapSourceAvailable]);

  const displaySite = roster.selectedSites[0] ?? site;
  const harnessTotalRows = multiPropertyRun
    ? Math.max(selectedCount, 1)
    : totalPosts;

  const setPreviewForSite = useCallback((siteId: string, preview: GbpPublishPreview | null) => {
    setPreviewBySiteId((prev) => ({ ...prev, [siteId]: preview }));
  }, []);

  const toggleExpandedSiteId = useCallback((siteId: string) => {
    setExpandedSiteId((prev) => (prev === siteId ? null : siteId));
  }, []);

  const resetRunState = useCallback(() => {
    setHarnessSections([]);
    setHarnessSectionsBySiteId({});
    setHarnessPlannedCount(3);
    setBulkSlotIndex(0);
    setResolvedTopic("");
    setPreviewBySiteId({});
    setBulkSummary(null);
    setPostingSiteIds(new Set());
    setActiveSiteId(null);
    setActivePropertyIndex(0);
    clearInventoryHostedLinks();
  }, [clearInventoryHostedLinks]);

  const handlePostSelected = async () => {
    if (!roster.selectedSites.length) {
      const msg = NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_;
      setStatusLine(msg);
      notify.error(msg);
      return;
    }

    const targets = roster.selectedSites;
    const isMultiProperty = targets.length > 1;

    const apiKey = loadApiKey()?.trim() || import.meta.env.VITE_OPENROUTER_API_KEY || "";
    if (!apiKey) {
      const msg = NOTIFY_OPENROUTER_API_KEY_REQUIRED_IN_API_KEYS_;
      setStatusLine(msg);
      notify.error(msg);
      return;
    }

    if (!isMultiProperty) {
      const target = targets[0];
      const err = validateSitePrereqs(target);
      if (err) {
        setStatusLine(err);
        setBulkSummary({ published: 0, queued: 0, failed: 1, lastError: err });
        notify.error(err);
        return;
      }
      if (!resolveGbpSitemapUrlForSite(target, sitemapSource)) {
        const msg = gbpSitemapSourceEmptyMessage(target.name, sitemapSource);
        setStatusLine(msg);
        setBulkSummary({ published: 0, queued: 0, failed: 1, lastError: msg });
        notify.error(msg);
        return;
      }
    }

    resetRunState();
    setIsPosting(true);

    const onHarnessSection = (payload: Parameters<typeof reduceHarnessSectionList>[1]) => {
      setHarnessSections((prev) => reduceHarnessSectionList(prev, payload));
    };

    try {
      if (targets.length === 1) {
        const target = targets[0];
        setMultiPropertyRun(false);
        setPostingSiteIds(new Set([target.id]));
        setExpandedSiteId(target.id);

        const result = await runGbpSitePostBatch({
          site: target,
          keyword: roster.topicForSite(target.id),
          landingPageUrl: roster.landingPageForSite(target.id),
          scheduler,
          openRouterApiKey: apiKey,
          totalPosts,
          sitemapSource,
          onStatus: setStatusLine,
          onHarnessSection,
          onResolvedTopic: setResolvedTopic,
          onPreview: (preview) => setPreviewForSite(target.id, preview),
          onSlotIndex: setBulkSlotIndex,
          notifyOnSlotFailure: true,
        });

        if (result.inventoryHosted) {
          setInventoryHostedLinkForSite(target.id, result.inventoryHosted);
        }

        const { published, queued, failed, lastError } = result;
        const hasOutcome = published + queued + failed > 0;
        if (hasOutcome) {
          setBulkSummary({ published, queued, failed, lastError });
        }
        if (failed === 0) {
          notify.success(
            isMultiSlot
              ? NOTIFY_GBP_POST_PUBLISHED
              : queued > 0
                ? NOTIFY_GBP_POST_QUEUED
                : NOTIFY_GBP_POST_PUBLISHED,
          );
        } else if (published + queued === 0 && failed > 0) {
          notify.error(lastError ?? (failed === 1 ? NOTIFY_GBP_POST_FAILED : `${failed} GBP posts failed`));
        }
        if (failed > 0) {
          setStatusLine(
            lastError?.trim() ||
              (failed === 1 ? NOTIFY_GBP_POST_FAILED : `${failed} GBP posts failed`),
          );
        } else if (hasOutcome) {
          setStatusLine(
            `Done: ${published} published, ${queued} queued${failed > 0 ? `, ${failed} failed` : ""}.`,
          );
        }
      } else {
        setMultiPropertyRun(true);
        setHarnessSectionsBySiteId({});
        setStatusLine(`Posting ${targets.length} sites sequentially…`);

        const result = await runGbpMultiSiteBatch({
          sites: targets,
          resolveKeyword: (s) => roster.topicForSite(s.id),
          resolveLandingPageUrl: (s) => roster.landingPageForSite(s.id),
          scheduler,
          openRouterApiKey: apiKey,
          sitemapSource,
          onProgress: (line) => {
            setStatusLine(line);
          },
          onHarnessSection: (activeSite, payload) => {
            setHarnessSectionsBySiteId((prev) => ({
              ...prev,
              [activeSite.id]: reduceHarnessSectionList(prev[activeSite.id] ?? [], payload),
            }));
          },
          onPreview: (activeSite, preview) => setPreviewForSite(activeSite.id, preview),
          onPropertyStart: (activeSite, index) => {
            setActiveSiteId(activeSite.id);
            setActivePropertyIndex(index);
            setPostingSiteIds(new Set([activeSite.id]));
            setExpandedSiteId(activeSite.id);
            setHarnessSectionsBySiteId((prev) => ({ ...prev, [activeSite.id]: [] }));
            setPreviewBySiteId((prev) => ({ ...prev, [activeSite.id]: null }));
          },
          onPropertyComplete: (_activeSite, propertyResult) => {
            if (propertyResult.inventoryHosted) {
              setInventoryHostedLinkForSite(_activeSite.id, propertyResult.inventoryHosted);
            }
          },
        });

        const hasOutcome = result.published + result.queued + result.failed > 0;
        if (hasOutcome) {
          setBulkSummary({
            published: result.published,
            queued: result.queued,
            failed: result.failed,
            lastError: result.lastError,
          });
          if (result.lastError?.trim()) {
            setStatusLine(result.lastError.trim());
          } else if (result.failed > 0) {
            setStatusLine(
              result.failed === 1 ? NOTIFY_GBP_POST_FAILED : `${result.failed} GBP posts failed`,
            );
          } else {
            const skipped = result.skippedIneligible;
            setStatusLine(
              `Done: ${result.published} published, ${result.queued} queued${result.failed > 0 ? `, ${result.failed} failed` : ""}${skipped > 0 ? `, ${skipped} skipped` : ""}.`,
            );
          }
        } else if (result.skippedIneligible > 0) {
          setBulkSummary({ published: 0, queued: 0, failed: 0 });
          setStatusLine(`${result.skippedIneligible} sites skipped (missing credentials or sitemap).`);
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "GBP post failed";
      notifyHeaderError("GBP post failed", e);
      setStatusLine(errMsg);
      setBulkSummary({ published: 0, queued: 0, failed: 1, lastError: errMsg });
    } finally {
      setIsPosting(false);
      setMultiPropertyRun(false);
      setPostingSiteIds(new Set());
      setActiveSiteId(null);
      setActivePropertyIndex(0);
    }
  };

  const postLabel = isPosting
    ? multiPropertyRun
      ? `Posting ${activePropertyIndex + 1}/${selectedCount}…`
      : isMultiSlot
        ? `Posting ${bulkSlotIndex + 1}/${totalPosts}…`
        : "Posting…"
    : isMultiSlot && selectedCount === 1
      ? `Schedule ${totalPosts}`
      : "Post";

  const setNumberOfPosts = useCallback((n: number) => {
    const count = clampNumberOfGbpPosts(n);
    setScheduler((prev) => ({
      ...prev,
      numberOfPosts: count,
      rowOrder: Array.from({ length: count }, (_, i) => i),
    }));
  }, []);

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

  return (
    <div className={SEO_WORKSPACE_INNER_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <GbpPostWorkspaceHeader
          workspaceBusy={isBusy}
          isProcessing={isBusy}
          canOpenDetails={canOpenDetails}
          onPlatformChange={onPlatformChange ?? (() => undefined)}
          sitemapSource={sitemapSource}
          onSitemapSourceChange={setSitemapSource}
          sitemapPillsDisabled={isBusy}
          postsSourceAvailable={postsSourceAvailable}
          sapSourceAvailable={sapSourceAvailable}
          headerProgressArgs={{
            statusLine:
              multiSiteDrawer && isPosting && activePropertyIndex >= 0
                ? `Posting ${activePropertyIndex + 1}/${selectedCount} · ${statusLine.trim()}`
                : statusLine,
            harnessSections:
              multiSiteDrawer && isPosting && activeSiteId
                ? (harnessSectionsBySiteId[activeSiteId] ?? [])
                : harnessSections,
            harnessPlannedCount,
            bulkSlotIndex: multiSiteDrawer ? activePropertyIndex : bulkSlotIndex,
            harnessTotalRows: multiSiteDrawer ? selectedCount : harnessTotalRows,
          }}
          toolbarProps={{
            disabled,
            isBusy,
            isPosting,
            postLabel,
            selectedCount,
            rosterSiteCount,
            allClientsSelected,
            someClientsSelected,
            onSelectAllChange: (selectAll) => {
              if (selectAll) roster.loadAllClients();
              else roster.selectNoClients();
            },
            numberOfPosts: totalPosts,
            onNumberOfPostsChange: setNumberOfPosts,
            onPost: () => void handlePostSelected(),
            onShuffleLandingPages: landingPages.shuffleLandingPages,
            shuffleDisabled: !landingPages.canShuffle,
          }}
          detailsProps={detailsProps}
        />
      </div>

      <GbpPostClientRoster
        sites={roster.rosterSites}
        selectedSiteIds={roster.selectedSiteIds}
        topicBySiteId={roster.topicBySiteId}
        landingPageUrlBySiteId={roster.landingPageUrlBySiteId}
        expandedSiteId={expandedSiteId}
        previewBySiteId={previewBySiteId}
        postingSiteIds={postingSiteIds}
        isPosting={isPosting}
        disabled={disabled}
        gmbConnected={gmbConnected}
        onTopicChange={roster.setTopicForSite}
        onLandingPageChange={roster.setLandingPageUrlForSite}
        onToggleSite={roster.toggleSiteSelected}
        onToggleExpandedSiteId={toggleExpandedSiteId}
        className="h-0 min-h-0 flex-1 w-full"
      />
    </div>
  );
};
