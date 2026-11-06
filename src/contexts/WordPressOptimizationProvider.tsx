import { logger } from "@/lib/logger";
import { NOTIFY_FAILED_TO_CONTINUE_OPTIMIZATION_PLEASE_T, NOTIFY_KEYWORD_SELECTION_CANCELLED, NOTIFY_PLEASE_SELECT_A_POST_OR_ENTER_A_URL_TO_O } from "@/lib/notify-messages";
import { notify } from "@/lib/app-notifications";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PrefilledOverviewTarget } from "@/hooks/content-optimization/bulk-optimization-params";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KeywordSelectionDialog } from "@/components/integrations/wordpress/KeywordSelectionDialog";
import type { WordPressSite } from "@/components/integrations/types";
import type { ImageType } from "@/lib/image-section-analyzer";
import type { OptimizationSettings } from "@/components/integrations/wordpress/OptimizationSettingsPanel";
import type { OptimizationHistoryEntry } from "@/components/integrations/wordpress/OptimizationHistoryPanel";
import { useContentOptimization } from "@/hooks/use-content-optimization";
import { useKeywordSelection } from "@/hooks/use-keyword-selection";
import {
  useActiveWordPressSite,
} from "@/contexts/active-wordpress-site-context";
import { getOptimizationSettings, saveOptimizationSettings } from "@/lib/optimization-settings-storage";
import { getOptimizationHistory, clearOptimizationHistory } from "@/lib/optimization-history-storage";
import {
  registerAgentRunOptimizationBridge,
  unregisterAgentRunOptimizationBridge,
} from "@/lib/agent-runs/agent-run-optimization-bridge";
import type { OptimizationOptions } from "@/hooks/use-optimization-options";
import { Button } from "@/ui";

import {
  WordPressOptimizationContext,
  type WordPressOptimizationContextValue,
} from "./wordpress-optimization-context";

export function WordPressOptimizationProvider({ children }: { children: ReactNode }) {
  const optimization = useContentOptimization();
  const keyword = useKeywordSelection();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();

  useEffect(() => {
    registerAgentRunOptimizationBridge({
      setIsOptimizingContent: optimization.setIsOptimizingContent,
      setOptimizationProgress: optimization.setOptimizationProgress,
      setBulkOptimizationState: optimization.setBulkOptimizationState,
      setOptimizationFileManagers: optimization.setOptimizationFileManagers,
      optimizationFileManagers: optimization.optimizationFileManagers,
      continueOptimizationRef: optimization.continueOptimizationRef,
    });
    return () => unregisterAgentRunOptimizationBridge();
  }, [
    optimization.continueOptimizationRef,
    optimization.optimizationFileManagers,
    optimization.setBulkOptimizationState,
    optimization.setIsOptimizingContent,
    optimization.setOptimizationFileManagers,
    optimization.setOptimizationProgress,
  ]);

  const [integrationSites, setIntegrationSites] = useState<WordPressSite[]>([]);
  const registerIntegrationSites = useCallback((sites: WordPressSite[]) => {
    setIntegrationSites(sites);
  }, []);

  const [optimizeUrl, setOptimizeUrl] = useState<Record<string, string | string[]>>({});
  const [optimizeUpdateMode, setOptimizeUpdateMode] = useState<Record<string, "update" | "draft">>({});
  const [optimizationSettings, setOptimizationSettings] = useState<Record<string, OptimizationSettings>>({});
  const [optimizationHistory, setOptimizationHistory] = useState<Record<string, OptimizationHistoryEntry[]>>({});
  const [optimizationOptions, setOptimizationOptions] = useState<
    Record<
      string,
      {
        optimizeTitle: boolean;
        optimizeMeta: boolean;
        optimizeExcerpt: boolean;
        optimizeContent: boolean;
        optimizeFeaturedImage: boolean;
        autoOptimize?: boolean;
        testMode?: boolean;
        stagingSite?: boolean;
      }
    >
  >({});
  const [inContentImageTypes, setInContentImageTypes] = useState<Record<string, ImageType | "">>({});
  const [inContentImagePrompts, setInContentImagePrompts] = useState<Record<string, string>>({});

  const siteIdsKey = integrationSites.map((s) => s.id).join(",");

  useEffect(() => {
    const settings: Record<string, OptimizationSettings> = {};
    const history: Record<string, OptimizationHistoryEntry[]> = {};
    const siteIds = siteIdsKey ? siteIdsKey.split(",") : [];
    siteIds.forEach((siteId) => {
      settings[siteId] = getOptimizationSettings(siteId);
      history[siteId] = getOptimizationHistory(siteId);
    });
    setOptimizationSettings(settings);
    setOptimizationHistory(history);
  }, [siteIdsKey]);

  const handleOptimizationSettingsChange = useCallback((siteId: string, settings: OptimizationSettings) => {
    saveOptimizationSettings(siteId, settings);
    setOptimizationSettings((prev) => ({ ...prev, [siteId]: settings }));
  }, []);

  const handleClearHistory = useCallback((siteId: string) => {
    clearOptimizationHistory(siteId);
    setOptimizationHistory((prev) => ({ ...prev, [siteId]: [] }));
  }, []);

  const handleOptimizeContentClick = useCallback(
    async (
      site: WordPressSite,
      url: string,
      updateMode: "update" | "draft",
      resolvedPost?: {
        id: number;
        subtype: string;
        link: string;
        slug?: string;
        endpoint?: string;
        title?: string;
        content?: string;
        excerpt?: string;
        focusKeyword?: string;
        seoResearch?: string;
      } | null,
    ) => {
      try {
        const opts = optimizationOptions[site.id] || {
          optimizeTitle: true,
          optimizeMeta: true,
          optimizeExcerpt: true,
          optimizeContent: true,
          optimizeFeaturedImage: false,
          autoOptimize: true,
          testMode: false,
          stagingSite: false,
        };
        const sheetKeyword = (resolvedPost?.focusKeyword ?? "").trim();
        const runOpts = {
          ...opts,
          ...(sheetKeyword
            ? { useAcfKeyword: false as const, manualKeyword: sheetKeyword }
            : resolvedPost?.content
              ? { useAcfKeyword: false as const }
              : {}),
        };
        const inContentImageType = inContentImageTypes[site.id];
        const inContentImagePrompt = inContentImagePrompts[site.id];
        await optimization.handleOptimizeContent(
          site,
          url,
          updateMode,
          keyword.setGscQueriesForSelection,
          keyword.setIsKeywordSelectionOpen,
          keyword.setGscClusterAnalysis,
          keyword.setIsAnalyzingClusters,
          false,
          runOpts,
          inContentImageType ? { imageType: inContentImageType as ImageType, userPrompt: inContentImagePrompt } : undefined,
          resolvedPost || undefined,
          runOpts.testMode === true,
        );
      } catch (error) {
        logger.error("[Optimize Content] Error:", error);
        notify.error(error instanceof Error ? error.message : "Failed to optimize content", { duration: 5000 });
        try {
          keyword.setIsAnalyzingClusters((prev: Record<string, boolean>) => ({ ...prev, [site.id]: false }));
        } catch {
          /* ignore */
        }
      }
    },
    [
      optimization,
      keyword,
      optimizationOptions,
      inContentImageTypes,
      inContentImagePrompts,
    ],
  );

  const handleOptimizeMultipleContentClick = useCallback(
    async (
      site: WordPressSite,
      urls: string[],
      updateMode: "update" | "draft",
      optionsOverride?: Partial<OptimizationOptions> & {
        prefilledUrlKeywords?: Record<string, string>;
        prefilledOverviewTargets?: Record<string, PrefilledOverviewTarget>;
        useSiteWarmCacheOnly?: boolean;
      },
    ) => {
      try {
        const {
          prefilledUrlKeywords,
          prefilledOverviewTargets,
          useSiteWarmCacheOnly,
          ...optionsOnly
        } = optionsOverride ?? {};
        const base = optimizationOptions[site.id] || {
          optimizeTitle: true,
          optimizeMeta: true,
          optimizeExcerpt: true,
          optimizeContent: true,
          optimizeFeaturedImage: false,
          autoOptimize: true,
          testMode: false,
          stagingSite: false,
        };
        const opts: OptimizationOptions = { ...base, ...optionsOnly } as OptimizationOptions;
        const inContentImageType = inContentImageTypes[site.id];
        const inContentImagePrompt = inContentImagePrompts[site.id];
        const seoOnly = opts.seoExtraTextFieldOnly === true;
        await optimization.handleOptimizeMultipleContent(
          site,
          urls,
          updateMode,
          keyword.setGscQueriesForSelection,
          keyword.setIsKeywordSelectionOpen,
          keyword.setGscClusterAnalysis,
          keyword.setIsAnalyzingClusters,
          opts,
          seoOnly
            ? undefined
            : inContentImageType
              ? { imageType: inContentImageType as ImageType, userPrompt: inContentImagePrompt }
              : undefined,
          prefilledUrlKeywords,
          prefilledOverviewTargets,
          useSiteWarmCacheOnly,
        );
      } catch (error) {
        logger.error("[Batch Optimize] Error:", error);
        notify.error(error instanceof Error ? error.message : "Failed to optimize multiple posts", { duration: 5000 });
      }
    },
    [
      optimization,
      keyword.setGscQueriesForSelection,
      keyword.setIsKeywordSelectionOpen,
      keyword.setGscClusterAnalysis,
      keyword.setIsAnalyzingClusters,
      optimizationOptions,
      inContentImageTypes,
      inContentImagePrompts,
    ],
  );

  const handleContinueOptimization = useCallback(
    async (
      siteId: string,
      selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number },
      clusterKeywords?: string[],
    ) => {
      try {
        await optimization.continueOptimizationWithKeyword(
          siteId,
          selectedKeyword,
          clusterKeywords,
          keyword.setIsKeywordSelectionOpen,
        );
      } catch (error) {
        logger.error("[Optimize] Error:", error);
        notify.error(error instanceof Error ? error.message : "Failed to continue optimization");
      }
    },
    [optimization, keyword.setIsKeywordSelectionOpen],
  );

  const handleKeywordSelectionCancel = useCallback(
    (siteId: string) => {
      keyword.closeKeywordSelection(siteId);
      optimization.clearOptimization(siteId);
      notify.info(NOTIFY_KEYWORD_SELECTION_CANCELLED);
    },
    [keyword, optimization],
  );

  const handleOptimize = useCallback(
    (site: WordPressSite, postData?: { id: number; subtype: string; link: string; slug?: string } | null) => {
      const urlToOptimize = optimizeUrl[site.id] || "";
      const mode = optimizeUpdateMode[site.id] || "update";
      optimization.setOptimizationFileManagers((prev) => {
        const updated = { ...prev };
        delete updated[site.id];
        return updated;
      });

      const finalUrl = typeof urlToOptimize === "string" && urlToOptimize ? urlToOptimize : postData?.link || "";

      if (Array.isArray(urlToOptimize) && urlToOptimize.length > 0) {
        void handleOptimizeMultipleContentClick(site, urlToOptimize, mode);
      } else if (finalUrl) {
        void handleOptimizeContentClick(site, finalUrl, mode, postData);
      } else {
        notify.error(NOTIFY_PLEASE_SELECT_A_POST_OR_ENTER_A_URL_TO_O);
      }
    },
    [optimizeUrl, optimizeUpdateMode, handleOptimizeMultipleContentClick, handleOptimizeContentClick, optimization],
  );

  const value = useMemo(
    () =>
      ({
        ...optimization,
        ...keyword,
        optimizeUrl,
        setOptimizeUrl,
        optimizeUpdateMode,
        setOptimizeUpdateMode,
        optimizationSettings,
        optimizationHistory,
        optimizationOptions,
        inContentImageTypes,
        inContentImagePrompts,
        registerIntegrationSites,
        integrationSites,
        activeWordPressSiteId,
        setActiveWordPressSiteId,
        handleOptimizationSettingsChange,
        handleClearHistory,
        handleOptimizeContentClick,
        handleOptimizeMultipleContentClick,
        handleContinueOptimization,
        handleKeywordSelectionCancel,
        handleOptimize,
        setOptimizationOptions,
        setInContentImageTypes,
        setInContentImagePrompts,
      }) satisfies WordPressOptimizationContextValue,
    [
      optimization,
      keyword,
      optimizeUrl,
      optimizeUpdateMode,
      optimizationSettings,
      optimizationHistory,
      optimizationOptions,
      inContentImageTypes,
      inContentImagePrompts,
      registerIntegrationSites,
      integrationSites,
      activeWordPressSiteId,
      setActiveWordPressSiteId,
      handleOptimizationSettingsChange,
      handleClearHistory,
      handleOptimizeContentClick,
      handleOptimizeMultipleContentClick,
      handleContinueOptimization,
      handleKeywordSelectionCancel,
      handleOptimize,
    ],
  );

  return (
    <WordPressOptimizationContext.Provider value={value}>
      {children}
      <KeywordSelectionPortals
        sites={integrationSites}
        gscQueriesForSelection={keyword.gscQueriesForSelection}
        isKeywordSelectionOpen={keyword.isKeywordSelectionOpen}
        gscClusterAnalysis={keyword.gscClusterAnalysis}
        isAnalyzingClusters={keyword.isAnalyzingClusters}
        selectedCluster={keyword.selectedCluster}
        onSelectCluster={(siteId, clusterIdx) =>
          keyword.setSelectedCluster((prev) => ({ ...prev, [siteId]: clusterIdx }))
        }
        onSelectKeyword={(siteId, kw, clusterKeywords) => {
          void handleContinueOptimization(
            siteId,
            kw as { query: string; clicks: number; impressions: number; ctr: number; position: number },
            clusterKeywords,
          );
        }}
        onCancelKeywordSelection={handleKeywordSelectionCancel}
      />
    </WordPressOptimizationContext.Provider>
  );
}

function KeywordSelectionPortals({
  sites,
  gscQueriesForSelection,
  isKeywordSelectionOpen,
  gscClusterAnalysis,
  isAnalyzingClusters,
  selectedCluster,
  onSelectCluster,
  onSelectKeyword,
  onCancelKeywordSelection,
}: {
  sites: WordPressSite[];
  gscQueriesForSelection: Record<string, unknown[]>;
  isKeywordSelectionOpen: Record<string, boolean>;
  gscClusterAnalysis: Record<string, unknown>;
  isAnalyzingClusters: Record<string, boolean>;
  selectedCluster: Record<string, number | null>;
  onSelectCluster: (siteId: string, clusterIdx: number) => void;
  onSelectKeyword: (siteId: string, keyword: unknown, clusterKeywords?: string[]) => void;
  onCancelKeywordSelection: (siteId: string) => void;
}) {
  return (
    <>
      {sites.map((site) => {
        try {
          const queries = Array.isArray(gscQueriesForSelection[site.id]) ? gscQueriesForSelection[site.id] : [];
          const isOpen = Boolean(isKeywordSelectionOpen[site.id]);
          if (!isOpen || queries.length === 0) return null;

          return (
            <ErrorBoundary
              key={site.id}
              fallback={
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="bg-card border border-border rounded-lg p-4 max-w-md">
                    <p className="text-sm text-muted-foreground">
                      Error displaying keyword selection dialog. Please try again.
                    </p>
                    <Button onClick={() => onCancelKeywordSelection(site.id)}>
                      Close
                    </Button>
                  </div>
                </div>
              }
            >
              <KeywordSelectionDialog
                open={isOpen}
                onOpenChange={(open) => {
                  if (!open) onCancelKeywordSelection(site.id);
                }}
                queries={queries as never}
                clusterAnalysis={gscClusterAnalysis[site.id] as never}
                isAnalyzingClusters={Boolean(isAnalyzingClusters[site.id])}
                selectedCluster={selectedCluster[site.id] ?? null}
                onSelectCluster={(clusterIdx) => {
                  try {
                    onSelectCluster(site.id, clusterIdx);
                  } catch (e) {
                    logger.error("[KeywordPortals] select cluster:", e);
                  }
                }}
                onSelectKeyword={(keyword, clusterKeywords) => {
                  try {
                    onSelectKeyword(site.id, keyword, clusterKeywords);
                  } catch (e) {
                    logger.error("[KeywordPortals] select keyword:", e);
                    notify.error(NOTIFY_FAILED_TO_CONTINUE_OPTIMIZATION_PLEASE_T);
                  }
                }}
                onCancel={() => {
                  try {
                    onCancelKeywordSelection(site.id);
                  } catch (e) {
                    logger.error("[KeywordPortals] cancel:", e);
                  }
                }}
              />
            </ErrorBoundary>
          );
        } catch (e) {
          logger.error("[KeywordPortals] site:", site.id, e);
          return null;
        }
      })}
    </>
  );
}
