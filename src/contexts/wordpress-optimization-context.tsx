/* @refresh reset */
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

export type WordPressOptimizationContextValue = ReturnType<typeof useContentOptimization> &
  ReturnType<typeof useKeywordSelection> & {
    optimizeUrl: Record<string, string | string[]>;
    setOptimizeUrl: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>;
    optimizeUpdateMode: Record<string, "update" | "draft">;
    setOptimizeUpdateMode: React.Dispatch<React.SetStateAction<Record<string, "update" | "draft">>>;
    optimizationSettings: Record<string, OptimizationSettings>;
    optimizationHistory: Record<string, OptimizationHistoryEntry[]>;
    optimizationOptions: Record<
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
    >;
    inContentImageTypes: Record<string, ImageType | "">;
    inContentImagePrompts: Record<string, string>;
    registerIntegrationSites: (sites: WordPressSite[]) => void;
    integrationSites: WordPressSite[];
    /** Persisted; shared with header and Content Optimizer */
    activeWordPressSiteId: string | null;
    setActiveWordPressSiteId: (id: string | null) => void;
    handleOptimizationSettingsChange: (siteId: string, settings: OptimizationSettings) => void;
    handleClearHistory: (siteId: string) => void;
    handleOptimizeContentClick: (
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
      } | null,
    ) => Promise<void>;
    handleOptimizeMultipleContentClick: (
      site: WordPressSite,
      urls: string[],
      updateMode: "update" | "draft",
      /** Merged on top of `optimizationOptions[site.id]` (e.g. Overview SEO extra-text-only bulk). */
      optionsOverride?: Partial<OptimizationOptions> & {
        prefilledUrlKeywords?: Record<string, string>;
        prefilledOverviewTargets?: Record<string, PrefilledOverviewTarget>;
        useSiteWarmCacheOnly?: boolean;
      },
    ) => Promise<void>;
    handleContinueOptimization: (
      siteId: string,
      selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number },
      clusterKeywords?: string[],
    ) => Promise<void>;
    handleKeywordSelectionCancel: (siteId: string) => void;
    handleOptimize: (
      site: WordPressSite,
      postData?: { id: number; subtype: string; link: string; slug?: string } | null,
    ) => void;
    setOptimizationOptions: React.Dispatch<
      React.SetStateAction<
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
      >
    >;
    setInContentImageTypes: React.Dispatch<React.SetStateAction<Record<string, ImageType | "">>>;
    setInContentImagePrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  };

export const WordPressOptimizationContext = createContext<WordPressOptimizationContextValue | null>(null);

export function useWordPressOptimization(): WordPressOptimizationContextValue {
  const ctx = useContext(WordPressOptimizationContext);
  if (!ctx) {
    throw new Error("useWordPressOptimization must be used within WordPressOptimizationProvider");
  }
  return ctx;
}




