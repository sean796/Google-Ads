import { useState, useCallback } from "react";
import type { GSCQueryClusterAnalysis } from "@/lib/gsc-query-clustering";

export function useKeywordSelection() {
  // Use lazy initialization to prevent React queue issues during concurrent rendering
  const [gscQueriesForSelection, setGscQueriesForSelection] = useState<Record<string, Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>>>(() => ({}));
  const [isKeywordSelectionOpen, setIsKeywordSelectionOpen] = useState<Record<string, boolean>>(() => ({}));
  const [gscClusterAnalysis, setGscClusterAnalysis] = useState<Record<string, GSCQueryClusterAnalysis>>(() => ({}));
  const [isAnalyzingClusters, setIsAnalyzingClusters] = useState<Record<string, boolean>>(() => ({}));
  const [selectedCluster, setSelectedCluster] = useState<Record<string, number | null>>(() => ({}));

  const closeKeywordSelection = useCallback((siteId: string) => {
    setIsKeywordSelectionOpen(prev => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });
    setGscQueriesForSelection(prev => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });
    setGscClusterAnalysis(prev => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });
    setIsAnalyzingClusters(prev => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });
    setSelectedCluster(prev => {
      const updated = { ...prev };
      delete updated[siteId];
      return updated;
    });
  }, []);

  return {
    gscQueriesForSelection,
    setGscQueriesForSelection,
    isKeywordSelectionOpen,
    setIsKeywordSelectionOpen,
    gscClusterAnalysis,
    setGscClusterAnalysis,
    isAnalyzingClusters,
    setIsAnalyzingClusters,
    selectedCluster,
    setSelectedCluster,
    closeKeywordSelection,
  };
}

