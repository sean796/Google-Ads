import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TrendingUp, CheckCircle2, Check, ChevronDown, ChevronRight, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CLUSTERING_REMOVED, notifyDeselectedAllXKeywordsInX, notifyDeselectedAllXSemanticKeywords, notifySelectedAllXKeywordsInX, notifySelectedAllXSemanticKeywords } from "@/lib/notify-messages";
import type { KeywordData } from "@/lib/keyword-types";
import { clusterKeywordsWithAI, type KeywordCluster } from "@/lib/keyword-clustering";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { Button } from "@/ui";

interface SemanticKeywordsListProps {
  keywords: KeywordData[];
  selectedKeywords: Set<string>;
  onKeywordToggle: (keyword: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  openRouterApiKey?: string;
  onClustersChange?: (clusters: KeywordCluster[]) => void;
}

export function SemanticKeywordsList({
  keywords,
  selectedKeywords,
  onKeywordToggle,
  onSelectAll,
  onDeselectAll,
  openRouterApiKey,
  onClustersChange,
}: SemanticKeywordsListProps) {
  const [clusters, setClusters] = useState<KeywordCluster[] | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [isClustering, setIsClustering] = useState(false);
  const [keywordsKey, setKeywordsKey] = useState<string>('');
  const [isLoadingPanelOpen, setIsLoadingPanelOpen] = useState(false);

  // Handle clustering (automatic, no user interaction needed)
  const handleClusterKeywords = useCallback(async () => {
    if (!openRouterApiKey || !openRouterApiKey.trim()) {
      return; // Silently fail if no API key
    }

    setIsClustering(true);
    try {
      const newClusters = await clusterKeywordsWithAI(keywords, {
        apiKey: openRouterApiKey,
        model: getResearchModel(),
        temperature: 1.0,
        maxTokens: 4000,
        topP: 0.9,
      });

      setClusters(newClusters);
      // Clusters start collapsed by default - expandedClusters remains empty
      setExpandedClusters(new Set());
      onClustersChange?.(newClusters);
      // Silent success - no toast for automatic clustering
    } catch (error) {
      console.error("Error clustering keywords:", error);
      // Silently fail and show unclustered list
      setClusters(null);
    } finally {
      setIsClustering(false);
    }
  }, [keywords, openRouterApiKey, onClustersChange]);

  // Automatically cluster keywords when they're available and API key is present
  useEffect(() => {
    // Create a key from keywords to detect changes
    const currentKey = keywords.map(k => k.keyword).join('|');
    
    // Only cluster if:
    // 1. We have keywords
    // 2. We have an API key
    // 3. Keywords have changed (different key)
    // 4. We're not already clustering
    // 5. We don't already have clusters for these keywords
    if (
      keywords &&
      keywords.length > 0 &&
      openRouterApiKey &&
      openRouterApiKey.trim() &&
      currentKey !== keywordsKey &&
      !isClustering &&
      !clusters
    ) {
      setKeywordsKey(currentKey);
      handleClusterKeywords();
    }
  }, [keywords, openRouterApiKey, keywordsKey, isClustering, clusters, handleClusterKeywords]);

  if (!keywords || keywords.length === 0) {
    return null;
  }

  const allSemantic = keywords.map(kw => kw.keyword);
  const allSelected = allSemantic.every(kw => selectedKeywords.has(kw));
  const selectedSemanticCount = keywords.filter(
    kw => selectedKeywords.has(kw.keyword)
  ).length;

  // Toggle cluster expansion
  const toggleCluster = useCallback((clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }, []);

  // Expand all clusters
  const expandAll = useCallback(() => {
    if (clusters) {
      const allClusterIds = new Set(clusters.map(c => c.id));
      setExpandedClusters(allClusterIds);
    }
  }, [clusters]);

  // Collapse all clusters
  const collapseAll = useCallback(() => {
    setExpandedClusters(new Set());
  }, []);

  // Determine if we should show clustered or unclustered view
  const displayClusters = clusters && clusters.length > 0;
  const allClustersExpanded = clusters ? clusters.every(c => expandedClusters.has(c.id)) : false;
  const allClustersCollapsed = clusters ? clusters.every(c => !expandedClusters.has(c.id)) : false;

  // Render keyword item
  const renderKeywordItem = useCallback((keyword: KeywordData, index: number) => {
    const isSelected = selectedKeywords.has(keyword.keyword);
    return (
      <div
        key={index}
        className={`flex items-center justify-between p-2 rounded border transition-colors cursor-pointer ${
          isSelected
            ? "border-primary border-2 bg-primary/5"
            : "bg-card hover:border-primary/50"
        }`}
        onClick={() => onKeywordToggle(keyword.keyword)}
      >
        <div className="flex items-center gap-2 flex-1">
          {isSelected && (
            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="font-medium text-sm">{keyword.keyword}</div>
            <div className="text-xs text-muted-foreground">
              Vol: {keyword.searchVolume.toLocaleString()} | Difficulty:{" "}
              {keyword.difficulty}
            </div>
          </div>
        </div>
        <Badge
          variant={
            keyword.difficulty < 30
              ? "default"
              : keyword.difficulty < 70
              ? "secondary"
              : "outline"
          }
          className="ml-2 flex-shrink-0"
        >
          {keyword.difficulty}
        </Badge>
      </div>
    );
  }, [selectedKeywords, onKeywordToggle]);

  return (
    <Card variant="neonFlat" className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Semantic Keywords</h3>
          <Badge variant="secondary">
            {keywords.length}
          </Badge>
          {displayClusters && (
            <Badge variant="outline" className="ml-2">
              {clusters.length} clusters
            </Badge>
          )}
          {selectedSemanticCount > 0 && (
            <Badge variant="default" className="ml-2">
              {selectedSemanticCount} selected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {displayClusters && (
            <>
              <Button
                variant="quiet"
                onClick={allClustersExpanded ? collapseAll : expandAll}
                title={allClustersExpanded ? "Collapse All" : "Expand All"}
              >
                {allClustersExpanded ? (
                  <Minimize2 className="w-3 h-3 mr-1" />
                ) : (
                  <Maximize2 className="w-3 h-3 mr-1" />
                )}
                {allClustersExpanded ? "Collapse All" : "Expand All"}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setClusters(null);
                  setExpandedClusters(new Set());
                  setKeywordsKey('');
                  onClustersChange?.([]);
                  notify.info(NOTIFY_CLUSTERING_REMOVED);
                }}
              >
                Clear Clusters
              </Button>
            </>
          )}
          <Button
            variant="quiet"
            onClick={() => {
              if (allSelected) {
                onDeselectAll();
                notify.info(notifyDeselectedAllXSemanticKeywords(allSemantic.length));
              } else {
                onSelectAll();
                notify.success(notifySelectedAllXSemanticKeywords(allSemantic.length));
              }
            }}
          >
            <Check className="w-3 h-3 mr-1" />
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
        </div>
      </div>

      {/* AI Progress Loading Panel - Collapsed by default */}
      {isClustering && (
        <Collapsible open={isLoadingPanelOpen} onOpenChange={setIsLoadingPanelOpen} className="mb-4">
          <CollapsibleTrigger asChild>
            <Button
            >
              <div className="flex items-center gap-2">
                
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-medium">AI Clustering in Progress</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${isLoadingPanelOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card variant="neonFlat" className="mt-2 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Analyzing keywords with AI...</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    Processing
                  </Badge>
                </div>
                <Progress value={undefined} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Grouping {keywords.length} keywords into semantic clusters based on topic similarity and relevance.
                </p>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {displayClusters ? (
        <div className="space-y-3">
          {clusters.map((cluster) => {
            const isExpanded = expandedClusters.has(cluster.id);
            const clusterSelectedCount = cluster.keywords.filter(
              kw => selectedKeywords.has(kw.keyword)
            ).length;
            const allClusterKeywordsSelected = cluster.keywords.every(
              kw => selectedKeywords.has(kw.keyword)
            );
            const clusterKeywordStrings = cluster.keywords.map(kw => kw.keyword);

            const handleSelectCluster = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (allClusterKeywordsSelected) {
                // Deselect all keywords in cluster
                clusterKeywordStrings.forEach(kw => {
                  if (selectedKeywords.has(kw)) {
                    onKeywordToggle(kw);
                  }
                });
                notify.info(notifyDeselectedAllXKeywordsInX(cluster.keywords.length, cluster.name));
              } else {
                // Select all keywords in cluster
                clusterKeywordStrings.forEach(kw => {
                  if (!selectedKeywords.has(kw)) {
                    onKeywordToggle(kw);
                  }
                });
                notify.success(notifySelectedAllXKeywordsInX(cluster.keywords.length, cluster.name));
              }
            };

            return (
              <div
                key={cluster.id}
                className="border rounded-lg bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="quiet"
                    onClick={() => toggleCluster(cluster.id)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-sm">{cluster.name}</div>
                        {cluster.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {cluster.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {cluster.keywords.length} keywords
                        </Badge>
                        {clusterSelectedCount > 0 && (
                          <Badge variant="default" className="text-xs">
                            {clusterSelectedCount} selected
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Button>
                  <Button
                    pressed={Boolean(allClusterKeywordsSelected)}
                    onClick={handleSelectCluster}
                    title={allClusterKeywordsSelected ? "Deselect all keywords in this cluster" : "Select all keywords in this cluster"}
                  >
                    {allClusterKeywordsSelected ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Deselect Cluster
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Select Cluster
                      </>
                    )}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    {cluster.keywords.map((keyword, idx) =>
                      renderKeywordItem(keyword, idx)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {keywords.map((keyword, index) => renderKeywordItem(keyword, index))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Click to select keywords. Selected keywords will be included in blog template generation and analysis.
      </p>
    </Card>
  );
}

