import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MultiSiteContentOptimizerWorkspaceHeader } from "@/components/content-optimizer/MultiSiteContentOptimizerWorkspaceHeader";
import type { WordPressSite } from "@/components/integrations/types";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useOptimizationActivityCounts } from "@/hooks/use-optimization-activity-counts";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_BATCH_CLEARED_FROM_VIEW, NOTIFY_BOTH_NEEDS_POST_AND_ENTITY_IN_INTEGRATIO, NOTIFY_DETECT_POSTS_FOR_THIS_PROPERTY_IN_INTEGR, NOTIFY_ENTITY_BATCH_DID_NOT_FINISH, NOTIFY_NO_POST_OR_ENTITY_URLS_FOR_THIS_SITE, NOTIFY_NO_SELECTED_SITES_ARE_READY_TO_OPTIMIZE, NOTIFY_NO_URLS_FOR_THIS_SOURCE_ON_THIS_SITE, NOTIFY_POST_BATCH_DID_NOT_FINISH_ENTITY_WAS_NOT, NOTIFY_SAVE_AN_ENTITY_URL_FOR_THIS_SITE_IN_INTE, NOTIFY_STILL_INITIALIZING_THIS_ROW_TRY_AGAIN, notifyBothEntityXUrlSOnX, notifyBothPostFirstXUrlSOnX, notifyOptimizingXUrlSOnX, notifySkippedXSiteSNotConfiguredForCurr } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";
import {
  readMultiSiteLastCompletedMap,
  persistMultiSiteLastCompleted,
  readMultiSiteManualRowDateMap,
  persistMultiSiteManualRowDate,
  type MultiSiteLastCompletedBySite,
  type MultiSiteManualRowDateBySite,
} from "@/lib/content-optimization/multi-site-last-completed-at";
import {
  loadUrlsForMultiSiteSource,
  pickPostSitemapUrlForSite,
  type MultiSiteUrlSource,
} from "@/lib/content-optimization/multi-site-source-urls";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import {
  CONTENT_OPTIMIZER_BODY_INSET_CLASS,
  CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  BOTH_MODE_PREP_OVERRIDE,
  MULTI_SITE_LIST_STACK,
  PACKAGE_OPTIMIZATION_OVERRIDE,
  type MultiSiteContentOptimizerPanelProps,
  type SiteRowConfig,
} from "@/components/content-optimizer/multi-site-content-optimizer-panel-types";
import { useMultiSiteBatchProgress } from "@/components/content-optimizer/use-multi-site-batch-progress";
import { MultiSiteOptimizerSiteRow } from "@/components/content-optimizer/MultiSiteOptimizerSiteRow";
import { logger } from "@/lib/logger";

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
        logger.error(e);
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


  const {
    bulkRunBatchKey,
    batchSite,
    batchBulkState,
    rowProgressDs,
    isBatchRunning,
    actionsBlocked,
    progressSnapshot,
  } = useMultiSiteBatchProgress({
    scope,
    propertySites,
    isOptimizingContent,
    optimizeBusySiteId,
    bulkOptimizationState,
    pinnedDetailsBatchKey,
    optimizeQueueBusy,
    gscPerformancePreview,
    optimizationProgress,
  });

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

  const handleToggleSelected = (siteId: string, checked: boolean | "indeterminate") => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (checked === true) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  };

  const workspaceBusy = actionsBlocked || Boolean(optimizeBusySiteId);

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
        {propertySites.map((site, stripeIndex) => (
          <MultiSiteOptimizerSiteRow
            key={site.id}
            site={site}
            stripeIndex={stripeIndex}
            cfg={rowConfigs[site.id]}
            rowSelected={selectedSiteIds.has(site.id)}
            rowBusy={optimizeBusySiteId === site.id}
            actionsBlocked={actionsBlocked}
            optimizationStatsBySite={optimizationStatsBySite}
            lastCompletedBySite={lastCompletedBySite}
            manualRowDateBySite={manualRowDateBySite}
            onToggleSelected={handleToggleSelected}
            onSetRowSource={setRowSource}
            onManualRowDatePick={handleManualRowDatePick}
            onOptimizeSite={optimizeSite}
          />
        ))}
        </div>
      </div>

    </div>
  );
};
