import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { MultiSiteContentOptimizerWorkspaceHeader } from "@/components/content-optimizer/MultiSiteContentOptimizerWorkspaceHeader";
import { MultiSiteRowDatePicker } from "@/components/content-optimizer/MultiSiteRowDatePicker";
import {
  MultiSiteSitemapModeSelect,
} from "@/components/content-optimizer/MultiSiteSitemapModeSelect";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ContentOptimizerGeneratorChrome } from "@/components/content-optimizer/content-optimizer-generator-chrome";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useOptimizationActivityCounts } from "@/hooks/use-optimization-activity-counts";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import type { WordPressSite } from "@/components/integrations/types";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_BATCH_CLEARED_FROM_VIEW, NOTIFY_BOTH_NEEDS_POST_AND_ENTITY_IN_INTEGRATIO, NOTIFY_DETECT_POSTS_FOR_THIS_PROPERTY_IN_INTEGR, NOTIFY_ENTITY_BATCH_DID_NOT_FINISH, NOTIFY_NO_POST_OR_ENTITY_URLS_FOR_THIS_SITE, NOTIFY_NO_SELECTED_SITES_ARE_READY_TO_OPTIMIZE, NOTIFY_NO_URLS_FOR_THIS_SOURCE_ON_THIS_SITE, NOTIFY_POST_BATCH_DID_NOT_FINISH_ENTITY_WAS_NOT, NOTIFY_SAVE_AN_ENTITY_URL_FOR_THIS_SITE_IN_INTE, NOTIFY_STILL_INITIALIZING_THIS_ROW_TRY_AGAIN, notifyBothEntityXUrlSOnX, notifyBothPostFirstXUrlSOnX, notifyOptimizingXUrlSOnX, notifySkippedXSiteSNotConfiguredForCurr } from "@/lib/notify-messages";
import { buildMultiSiteHeaderMicroSnapshot } from "@/lib/content-optimization/multi-site-header-progress";
import { cn } from "@/lib/utils";
import {
  readMultiSiteLastCompletedMap,
  persistMultiSiteLastCompleted,
  readMultiSiteManualRowDateMap,
  persistMultiSiteManualRowDate,
  resolveMultiSiteRowActivityIso,
  type MultiSiteLastCompletedBySite,
  type MultiSiteManualRowDateBySite,
} from "@/lib/content-optimization/multi-site-last-completed-at";
import {
  loadUrlsForMultiSiteSource,
  pickPostSitemapUrlForSite,
  type MultiSiteUrlSource,
} from "@/lib/content-optimization/multi-site-source-urls";
import { OptimizationActivityStrip } from "@/components/integrations/wordpress/WordPressSiteList";
import { optimizationStatsForSite } from "@/components/integrations/wordpress/wordpress-site-list-stats";
import { CompactWordPressTile } from "@/components/integrations/wordpress/CompactWordPressTile";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import {
  CONTENT_OPTIMIZER_BODY_INSET_CLASS,
  CONTENT_OPTIMIZER_COMPACT_ROW_INNER_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL,
  CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER,
  CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL,
  CONTENT_OPTIMIZER_MULTI_SITE_OPT_COUNT_SLOT,
  CONTENT_OPTIMIZER_MULTI_SITE_OPTIMIZE_ROW_BTN,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
  CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { Button, Checkbox } from "@/ui";

type SiteRowConfig = {
  source: MultiSiteUrlSource;
};

const PACKAGE_OPTIMIZATION_OVERRIDE = { seoExtraTextFieldOnly: false as const };
const BOTH_MODE_PREP_OVERRIDE = { prepEntitySitemap: true as const };

/** Match Dashboard → Properties list checkboxes (`WordPressSiteList`), including indeterminate. */
const MULTI_SITE_CHECKBOX_CLASS =
  "border-border/60 data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover data-[state=checked]:text-muted-foreground data-[state=indeterminate]:border-border data-[state=indeterminate]:bg-ui-field-hover data-[state=indeterminate]:text-muted-foreground";

/** Flush stack; only the first row gets top inset below the progress band. */
const MULTI_SITE_LIST_STACK = CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS;

function MultiSiteOptimizeLogoButtonContent({ busy }: { busy: boolean }) {
  if (busy) {
    return null;
  }
  return <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-foreground sm:h-4 sm:w-4" aria-hidden />;
}

export type MultiSiteContentOptimizerPanelProps = {
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  paginationLayoutTotal: number;
  generatorChrome?: ContentOptimizerGeneratorChrome;
};

export const MultiSiteContentOptimizerPanel: React.FC<MultiSiteContentOptimizerPanelProps> = ({
  optimizerSection,
  onOptimizerSectionChange,
  paginationLayoutTotal,
  generatorChrome,
}) => {
  const { sites } = useWordPressSites();
  /** Every property under Integrations */
  const propertySites = sites;

  const { bySiteId: optimizationStatsBySite } = useOptimizationActivityCounts(propertySites);

  const {
    handleOptimizeMultipleContentClick,
    resetBulkBatch,
    bulkOptimizationState,
    isOptimizingContent,
    optimizationProgress,
    optimizationFileManagers,
    gscPerformancePreview,
  } = useWordPressOptimization();
  const { scope } = useAgentRunOptimizerScope();

  const [rowConfigs, setRowConfigs] = useState<Record<string, SiteRowConfig>>({});
  const [optimizeMode, setOptimizeMode] = useState<"update" | "draft">("update");
  const [optimizeBusySiteId, setOptimizeBusySiteId] = useState<string | null>(null);
  const [optimizeQueueBusy, setOptimizeQueueBusy] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(() => new Set());
  const [lastCompletedBySite, setLastCompletedBySite] = useState<MultiSiteLastCompletedBySite>(() =>
    readMultiSiteLastCompletedMap(),
  );
  const [manualRowDateBySite, setManualRowDateBySite] = useState<MultiSiteManualRowDateBySite>(() =>
    readMultiSiteManualRowDateMap(),
  );
  const [pinnedDetailsBatchKey, setPinnedDetailsBatchKey] = useState<string | null>(null);

  const siteIdsKey = useMemo(() => propertySites.map((s) => s.id).join("\u0001"), [propertySites]);

  useEffect(() => {
    setSelectedSiteIds((prev) => {
      const valid = new Set(siteIdsKey ? siteIdsKey.split("\u0001") : []);
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }, [siteIdsKey]);

  const multiSiteRunOriginRef = useRef<{ siteId: string; source: MultiSiteUrlSource } | null>(null);
  const bothSequenceRef = useRef<{ siteId: string } | null>(null);
  const prevBatchOptimizingRef = useRef<Record<string, boolean>>({});
  const latestBulkRef = useRef(bulkOptimizationState);
  latestBulkRef.current = bulkOptimizationState;

  const markSiteSitemapOptimized = useCallback(
    (siteId: string, source: MultiSiteUrlSource, batchKey: string): boolean => {
      const step = latestBulkRef.current[batchKey]?.currentStep;
      if (step !== "Batch complete") return false;
      const iso = new Date().toISOString();
      setLastCompletedBySite(persistMultiSiteLastCompleted(siteId, source, iso));
      if (multiSiteRunOriginRef.current?.siteId === siteId) {
        multiSiteRunOriginRef.current = null;
      }
      return true;
    },
    [],
  );

  useEffect(() => {
    setRowConfigs((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of propertySites) {
        if (!next[s.id]) {
          changed = true;
          next[s.id] = { source: "post" };
        }
      }
      return changed ? next : prev;
    });
  }, [propertySites]);

  useEffect(() => {
    for (const s of propertySites) {
      const bk = `${s.id}-batch`;
      const wasOptimizing = prevBatchOptimizingRef.current[bk] === true;
      const nowOptimizing = Boolean(isOptimizingContent[bk]);
      prevBatchOptimizingRef.current[bk] = nowOptimizing;

      if (nowOptimizing) continue;
      if (bothSequenceRef.current?.siteId === s.id) continue;

      const origin = multiSiteRunOriginRef.current;
      if (origin?.siteId === s.id) {
        markSiteSitemapOptimized(s.id, origin.source, bk);
      }
    }
  }, [propertySites, isOptimizingContent, bulkOptimizationState, markSiteSitemapOptimized]);

  const setRowSource = useCallback((siteId: string, source: MultiSiteUrlSource) => {
    setRowConfigs((prev) => {
      const cur = prev[siteId];
      if (!cur) return prev;
      return { ...prev, [siteId]: { ...cur, source } };
    });
  }, []);

  const handleManualRowDatePick = useCallback(
    (siteId: string, source: MultiSiteUrlSource, iso: string) => {
      setManualRowDateBySite(persistMultiSiteManualRowDate(siteId, source, iso));
    },
    [],
  );

  const bulkRunBatchKey = useMemo(() => {
    if (scope?.batchKey) return scope.batchKey;
    for (const s of propertySites) {
      const bk = `${s.id}-batch`;
      if (isOptimizingContent[bk]) return bk;
    }
    for (const key of Object.keys(isOptimizingContent)) {
      if (key.startsWith("agent-run-") && isOptimizingContent[key]) return key;
    }
    if (optimizeBusySiteId) {
      const busyKey = `${optimizeBusySiteId}-batch`;
      if (isOptimizingContent[busyKey] || bulkOptimizationState[busyKey]) return busyKey;
    }
    for (const key of Object.keys(bulkOptimizationState)) {
      if (key.startsWith("agent-run-") && bulkOptimizationState[key]) return key;
    }
    if (pinnedDetailsBatchKey && bulkOptimizationState[pinnedDetailsBatchKey]) {
      return pinnedDetailsBatchKey;
    }
    return null;
  }, [
    scope?.batchKey,
    propertySites,
    bulkOptimizationState,
    isOptimizingContent,
    optimizeBusySiteId,
    pinnedDetailsBatchKey,
  ]);

  const batchSiteId = scope?.siteId
    ?? (bulkRunBatchKey?.endsWith("-batch") ? bulkRunBatchKey.replace(/-batch$/, "") : "");
  const batchSite = propertySites.find((s) => s.id === batchSiteId);
  const batchBulkState = bulkRunBatchKey ? bulkOptimizationState[bulkRunBatchKey] : null;
  const batchProgress = bulkRunBatchKey ? optimizationProgress[bulkRunBatchKey] : undefined;
  const isBatchRunning = bulkRunBatchKey ? Boolean(isOptimizingContent[bulkRunBatchKey]) : false;
  const bulkActiveUrlDs =
    batchBulkState?.urls?.length && typeof batchBulkState.currentIndex === "number"
      ? batchBulkState.urls[batchBulkState.currentIndex] ?? null
      : null;
  const gscMap = batchSiteId ? gscPerformancePreview[batchSiteId] || {} : {};
  const gscSnapshotDs = bulkActiveUrlDs ? gscMap[bulkActiveUrlDs] : undefined;
  const rowProgressDs = batchSite ? optimizationProgress[batchSite.id] ?? batchProgress : batchProgress;
  const progressTextDs = `${rowProgressDs?.step || ""} ${rowProgressDs?.message || ""}`.toLowerCase();
  const isBusyDs =
    Boolean(batchSite && isOptimizingContent[batchSite.id]) ||
    Boolean(bulkRunBatchKey && isOptimizingContent[bulkRunBatchKey]);
  const gscPreviewLoadingDs =
    Boolean(isBusyDs) &&
    Boolean(bulkActiveUrlDs) &&
    !gscSnapshotDs?.queries?.length &&
    (progressTextDs.includes("gsc") ||
      progressTextDs.includes("search console") ||
      progressTextDs.includes("page performance"));

  const anyBatchBlocking = Boolean(bulkRunBatchKey && isBatchRunning);
  const actionsBlocked = anyBatchBlocking || optimizeQueueBusy;

  const allSitesSelected =
    propertySites.length > 0 && propertySites.every((s) => selectedSiteIds.has(s.id));
  const someSitesSelected = propertySites.some((s) => selectedSiteIds.has(s.id));

  const universalSourceShared = useMemo((): MultiSiteUrlSource | null => {
    if (propertySites.length === 0) return null;
    const first = rowConfigs[propertySites[0]!.id]?.source;
    if (!first) return null;
    return propertySites.every((s) => rowConfigs[s.id]?.source === first) ? first : null;
  }, [propertySites, rowConfigs]);

  const applyUniversalSitemap = useCallback(
    (source: MultiSiteUrlSource) => {
      setRowConfigs((prev) => {
        const next = { ...prev };
        for (const s of propertySites) {
          const cur = next[s.id];
          next[s.id] = { ...(cur || { source: "post" }), source };
        }
        return next;
      });
    },
    [propertySites],
  );

  const optimizeSite = useCallback(
    async (site: WordPressSite): Promise<boolean> => {
      const cfg = rowConfigs[site.id];
      if (!cfg) {
        notify.error(NOTIFY_STILL_INITIALIZING_THIS_ROW_TRY_AGAIN);
        return false;
      }
      const entityMissing = !site.entitySitemapUrl?.trim();
      const resolvedPostSitemap = pickPostSitemapUrlForSite(site);
      const batchKey = `${site.id}-batch`;

      if (cfg.source === "entity" && entityMissing) {
        notify.error(NOTIFY_SAVE_AN_ENTITY_URL_FOR_THIS_SITE_IN_INTE);
        return false;
      }
      if (cfg.source === "post" && !resolvedPostSitemap) {
        notify.error(NOTIFY_DETECT_POSTS_FOR_THIS_PROPERTY_IN_INTEGR);
        return false;
      }
      if (cfg.source === "both" && (!resolvedPostSitemap || entityMissing)) {
        notify.error(NOTIFY_BOTH_NEEDS_POST_AND_ENTITY_IN_INTEGRATIO);
        return false;
      }

      setOptimizeBusySiteId(site.id);
      try {
        resetBulkBatch(batchKey);
        setPinnedDetailsBatchKey(batchKey);
        const runClick = async (
          urls: string[],
          inventorySitemapSource?: "posts" | "pages" | "sap",
        ) => {
          await handleOptimizeMultipleContentClick(
            site,
            urls,
            optimizeMode,
            {
              ...PACKAGE_OPTIMIZATION_OVERRIDE,
              ...(cfg.source === "both" ? BOTH_MODE_PREP_OVERRIDE : {}),
              ...(inventorySitemapSource ? { inventorySitemapSource } : {}),
            },
          );
        };

        if (cfg.source === "both") {
          bothSequenceRef.current = { siteId: site.id };

          const postRes = await loadUrlsForMultiSiteSource(site, "post", resolvedPostSitemap);
          if (postRes.ok === false) {
            notify.error(postRes.error);
            return false;
          }
          const entRes = await loadUrlsForMultiSiteSource(site, "entity", null);
          if (entRes.ok === false) {
            notify.error(entRes.error);
            return false;
          }

          if (postRes.urls.length === 0 && entRes.urls.length === 0) {
            notify.error(NOTIFY_NO_POST_OR_ENTITY_URLS_FOR_THIS_SITE);
            return false;
          }

          if (postRes.urls.length > 0) {
            notify.info(notifyBothPostFirstXUrlSOnX(postRes.urls.length, site.name));
            await runClick(postRes.urls, "posts");
            if (latestBulkRef.current[batchKey]?.currentStep !== "Batch complete") {
              notify.error(NOTIFY_POST_BATCH_DID_NOT_FINISH_ENTITY_WAS_NOT);
              return false;
            }
          }

          if (entRes.urls.length > 0) {
            notify.info(notifyBothEntityXUrlSOnX(entRes.urls.length, site.name));
            await runClick(entRes.urls, "sap");
            if (latestBulkRef.current[batchKey]?.currentStep !== "Batch complete") {
              notify.error(NOTIFY_ENTITY_BATCH_DID_NOT_FINISH);
              return false;
            }
          }

          markSiteSitemapOptimized(site.id, "both", batchKey);
          return true;
        }

        const postUrl = cfg.source === "post" ? resolvedPostSitemap : null;
        const res = await loadUrlsForMultiSiteSource(site, cfg.source, postUrl);
        if (res.ok === false) {
          notify.error(res.error);
          return false;
        }
        if (res.urls.length === 0) {
          notify.error(NOTIFY_NO_URLS_FOR_THIS_SOURCE_ON_THIS_SITE);
          return false;
        }
        notify.info(notifyOptimizingXUrlSOnX(res.urls.length, site.name));
        multiSiteRunOriginRef.current = { siteId: site.id, source: cfg.source };
        await runClick(
          res.urls,
          cfg.source === "post" ? "posts" : cfg.source === "entity" ? "sap" : undefined,
        );
        markSiteSitemapOptimized(site.id, cfg.source, batchKey);
        return true;
      } catch (e) {
        console.error(e);
        notify.error(e instanceof Error ? e.message : "Optimization failed");
        return false;
      } finally {
        bothSequenceRef.current = null;
        setOptimizeBusySiteId((id) => (id === site.id ? null : id));
      }
    },
    [
      rowConfigs,
      optimizeMode,
      handleOptimizeMultipleContentClick,
      resetBulkBatch,
      markSiteSitemapOptimized,
    ],
  );

  const optimizeSelectedSites = useCallback(async () => {
    const ordered = propertySites.filter((s) => selectedSiteIds.has(s.id));
    const runnable: WordPressSite[] = [];
    let skipped = 0;
    for (const site of ordered) {
      const cfg = rowConfigs[site.id];
      const entityMissing = !site.entitySitemapUrl?.trim();
      const resolvedPostSitemap = pickPostSitemapUrlForSite(site);
      const canPost = cfg?.source === "post" && Boolean(resolvedPostSitemap);
      const canEntity = cfg?.source === "entity" && !entityMissing;
      const canBoth =
        cfg?.source === "both" && Boolean(resolvedPostSitemap) && !entityMissing;
      const canRun = Boolean(cfg) && (canPost || canEntity || canBoth);
      if (!canRun) skipped += 1;
      else runnable.push(site);
    }
    if (skipped > 0) {
      notify.info(notifySkippedXSiteSNotConfiguredForCurr(skipped));
    }
    if (runnable.length === 0) {
      notify.error(NOTIFY_NO_SELECTED_SITES_ARE_READY_TO_OPTIMIZE);
      return;
    }
    setOptimizeQueueBusy(true);
    try {
      for (const site of runnable) {
        const ok = await optimizeSite(site);
        if (!ok) break;
      }
    } finally {
      setOptimizeQueueBusy(false);
    }
  }, [propertySites, selectedSiteIds, rowConfigs, optimizeSite]);

  const runnableSelectedCount = useMemo(() => {
    let n = 0;
    for (const site of propertySites) {
      if (!selectedSiteIds.has(site.id)) continue;
      const cfg = rowConfigs[site.id];
      const entityMissing = !site.entitySitemapUrl?.trim();
      const resolvedPostSitemap = pickPostSitemapUrlForSite(site);
      const canPost = cfg?.source === "post" && Boolean(resolvedPostSitemap);
      const canEntity = cfg?.source === "entity" && !entityMissing;
      const canBoth =
        cfg?.source === "both" && Boolean(resolvedPostSitemap) && !entityMissing;
      const canRun = Boolean(cfg) && (canPost || canEntity || canBoth);
      if (canRun) n += 1;
    }
    return n;
  }, [propertySites, selectedSiteIds, rowConfigs]);

  const workspaceBusy = actionsBlocked || Boolean(optimizeBusySiteId);
  const progressSnapshot = useMemo(
    () =>
      buildMultiSiteHeaderMicroSnapshot({
        optimizeQueueBusy,
        optimizeBusySiteId,
        isBatchRunning,
        batchBulkState,
        batchSiteName: batchSite?.name,
      }),
    [optimizeQueueBusy, optimizeBusySiteId, isBatchRunning, batchBulkState, batchSite?.name],
  );
  const handleBatchClose = useCallback(
    (abortingRun: boolean) => {
      if (!bulkRunBatchKey) return;
      resetBulkBatch(bulkRunBatchKey);
      setPinnedDetailsBatchKey(null);
      if (abortingRun) {
        notify.info(NOTIFY_BATCH_CLEARED_FROM_VIEW);
      }
    },
    [bulkRunBatchKey, resetBulkBatch],
  );

  return (
    <div className={CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <MultiSiteContentOptimizerWorkspaceHeader
          optimizerSection={optimizerSection}
          onOptimizerSectionChange={onOptimizerSectionChange}
          workspaceBusy={workspaceBusy}
          actionsBlocked={actionsBlocked}
          optimizeMode={optimizeMode}
          onOptimizeModeChange={setOptimizeMode}
          progressSnapshot={progressSnapshot}
          isProcessing={isBatchRunning}
          selectedSiteCount={selectedSiteIds.size}
          toolbarProps={{
            actionsBlocked,
            optimizeQueueBusy,
            runnableSelectedCount,
            propertySiteCount: propertySites.length,
            allSitesSelected,
            someSitesSelected,
            universalSourceShared,
            onSelectAllChange: (selectAll) => {
              if (selectAll) {
                setSelectedSiteIds(new Set(propertySites.map((s) => s.id)));
              } else {
                setSelectedSiteIds(new Set());
              }
            },
            onOptimizeSelected: () => void optimizeSelectedSites(),
            onUniversalSitemapSelect: applyUniversalSitemap,
          }}
          batchBulkState={batchBulkState}
          bulkRunBatchKey={bulkRunBatchKey ?? ""}
          batchSite={batchSite}
          batchSiteName={batchSite?.name}
          rowProgressDs={rowProgressDs}
          isOptimizingContent={isOptimizingContent}
          optimizationFileManagers={optimizationFileManagers}
          onBatchClose={handleBatchClose}
          paginationLayoutTotal={paginationLayoutTotal}
          generatorChrome={generatorChrome}
        />
      </div>

      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, CONTENT_OPTIMIZER_BODY_INSET_CLASS)}>
        <div className={MULTI_SITE_LIST_STACK}>
        {propertySites.map((site, stripeIndex) => {
          const cfg = rowConfigs[site.id];
          const entityMissing = !site.entitySitemapUrl?.trim();
          const resolvedPostSitemap = pickPostSitemapUrlForSite(site);
          const canPost = cfg?.source === "post" && Boolean(resolvedPostSitemap);
          const canEntity = cfg?.source === "entity" && !entityMissing;
          const canBoth =
            cfg?.source === "both" && Boolean(resolvedPostSitemap) && !entityMissing;
          const canRun = Boolean(cfg) && (canPost || canEntity || canBoth);
          const rowBusy = optimizeBusySiteId === site.id;
          const rowSelected = selectedSiteIds.has(site.id);
          const bySourceDone = cfg ? lastCompletedBySite[site.id] : undefined;
          const bySourceManual = cfg ? manualRowDateBySite[site.id] : undefined;
          const lastIso = cfg
            ? resolveMultiSiteRowActivityIso(
                bySourceDone,
                bySourceManual,
                cfg.source,
                site,
                resolvedPostSitemap,
              )
            : undefined;

          const sitemapModeErrorTitle =
            cfg?.source === "post" && !resolvedPostSitemap
              ? "Detect posts in Integrations."
              : cfg?.source === "entity" && entityMissing
                ? "Entity not set in Integrations."
                : cfg?.source === "both" && (!resolvedPostSitemap || entityMissing)
                  ? "Both needs post and entity in Integrations."
                  : null;

          const lastRunFallback = sitemapModeErrorTitle ? "N/A" : "Not optimized";
          const lastRunTitle =
            sitemapModeErrorTitle ??
            (lastIso ? undefined : "No optimization date yet. Pick a date or run optimize.");

          return (
            <div key={site.id} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
              <div
                className={cn(
                  contentOptimizerRowStripeClass(stripeIndex),
                  "hover:bg-ui-field",
                  CONTENT_OPTIMIZER_COMPACT_ROW_INNER_CLASS,
                  "items-center",
                )}
              >
              <div className="flex shrink-0 items-center justify-center">
                <Checkbox
                  id={`ms-row-${site.id}`}
                  checked={rowSelected}
                  onCheckedChange={(c) => {
                    setSelectedSiteIds((prev) => {
                      const next = new Set(prev);
                      if (c === true) next.add(site.id);
                      else next.delete(site.id);
                      return next;
                    });
                  }}
                  className={MULTI_SITE_CHECKBOX_CLASS}
                  aria-label={`Select ${site.name}`}
                />
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 items-center border-0 bg-transparent px-0 py-0">
                <CompactWordPressTile
                  variant="listRow"
                  site={site}
                  isTesting={false}
                  isExpanded={false}
                  onToggle={() => {}}
                  propertyRowDisplay="compact"
                  hideCopyUrl
                  linkTitleToSite
                />
              </div>

              <div
                className={cn(
                  "flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2",
                )}
              >
                <div className={CONTENT_OPTIMIZER_MULTI_SITE_OPT_COUNT_SLOT}>
                  <OptimizationActivityStrip
                    site={site}
                    stats={optimizationStatsForSite(site, optimizationStatsBySite)}
                    rowDisplay="compact"
                  />
                </div>

                {!cfg ? (
                  <>
                    <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER}>
                      <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL}>
                        <div
                          className="h-full w-full shrink-0 rounded-none bg-ui-field/90"
                          aria-hidden
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center self-stretch">
                        <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL}>
                          <span className="break-words !text-white">Initializing…</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="run"
                      type="button"
                      disabled
                      aria-label="Optimize with AI"
                    >
                      <MultiSiteOptimizeLogoButtonContent busy={false} />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER}>
                      <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL}>
                        <MultiSiteSitemapModeSelect
                          value={cfg.source}
                          onSelect={(next) => setRowSource(site.id, next)}
                          availability={{
                            post: Boolean(resolvedPostSitemap),
                            entity: !entityMissing,
                          }}
                          disabled={actionsBlocked}
                          ariaLabel={`Source for ${site.name}`}
                          showMixedSentinel={false}
                        />
                      </div>
                      <MultiSiteRowDatePicker
                        siteId={site.id}
                        source={cfg.source}
                        activityIso={lastIso}
                        fallbackLabel={lastRunFallback}
                        title={lastRunTitle}
                        disabled={Boolean(sitemapModeErrorTitle) || actionsBlocked}
                        onPick={handleManualRowDatePick}
                      />
                    </div>

                    <Button
                      variant="run"
                      type="button"
                      disabled={!canRun || rowBusy || actionsBlocked}
                      onClick={() => void optimizeSite(site)}
                      aria-label={rowBusy ? `Optimizing ${site.name}` : `Optimize ${site.name} with AI`}
                    >
                      <MultiSiteOptimizeLogoButtonContent busy={rowBusy} />
                    </Button>
                  </>
                )}
              </div>
            </div>
            </div>
          );
        })}
        </div>
      </div>

    </div>
  );
};
