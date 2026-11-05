import React from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button, DialogShell } from "@/ui";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_INVALID_KEYWORD_SELECTED_PLEASE_TRY_AGAI } from "@/lib/notify-messages";
interface KeywordQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ClusterAnalysis {
  clusters?: Array<{
    name: string;
    description?: string;
    queries?: KeywordQuery[];
    characteristics: {
      intent: string;
      isLocal: boolean;
      avgPosition: number;
      totalClicks: number;
      totalImpressions: number;
      avgCtr: number;
    };
    recommendation: {
      priority: string;
      reasoning?: string;
      suggestedKeyword: string;
    };
  }>;
  overallRecommendation?: {
    recommendedKeyword: string;
    reasoning: string;
    alternativeOptions?: Array<{
      keyword: string;
      reason: string;
    }>;
  };
}

interface KeywordSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queries: KeywordQuery[];
  clusterAnalysis?: ClusterAnalysis;
  isAnalyzingClusters: boolean;
  selectedCluster: number | null;
  onSelectCluster: (clusterIdx: number) => void;
  onSelectKeyword: (keyword: KeywordQuery, clusterKeywords?: string[]) => void;
  onCancel: () => void;
}

const ROW = "flex flex-col gap-1.5 bg-ui-field p-3";
const STAT = "bg-ui-field-hover px-2 py-1 text-base";

const normalize = (s: string) => s.toLowerCase().trim();

export const KeywordSelectionDialog: React.FC<KeywordSelectionDialogProps> = ({
  open,
  onOpenChange,
  queries,
  clusterAnalysis,
  isAnalyzingClusters,
  selectedCluster,
  onSelectCluster,
  onSelectKeyword,
  onCancel,
}) => {
  if (!open) return null;

  const safeQueries = (Array.isArray(queries) ? queries : [])
    .filter((q) => q && typeof q.query === "string" && q.query.trim().length > 0)
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0) || (b.clicks || 0) - (a.clicks || 0));
  const clusters = clusterAnalysis?.clusters ?? [];
  const recommendation = clusterAnalysis?.overallRecommendation;
  const recommendedKeyword = recommendation?.recommendedKeyword?.trim() ?? "";

  const useRecommendation = () => {
    const match = safeQueries.find((q) => normalize(q.query) === normalize(recommendedKeyword));
    if (!match) {
      onSelectKeyword({ query: recommendedKeyword, clicks: 0, impressions: 0, ctr: 0, position: 0 }, []);
      return;
    }
    const cluster = clusters.find((cl) => cl.queries?.some((q) => normalize(q.query) === normalize(recommendedKeyword)));
    const clusterKeywords = (cluster?.queries ?? [])
      .map((q) => q.query.trim())
      .filter((kw) => kw && kw !== recommendedKeyword);
    onSelectKeyword(match, clusterKeywords);
  };

  const selectKeyword = (item: KeywordQuery) => {
    if (!item.query?.trim()) {
      notify.error(NOTIFY_INVALID_KEYWORD_SELECTED_PLEASE_TRY_AGAI);
      return;
    }
    onSelectKeyword(item);
  };

  const clusterTopKeyword = (list: KeywordQuery[]): KeywordQuery | null =>
    [...list].sort((a, b) => (b.clicks || 0) - (a.clicks || 0) || (b.impressions || 0) - (a.impressions || 0))[0] ?? null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Select Keyword Cluster for Optimization
        </span>
      }
      description={
        isAnalyzingClusters
          ? "Analyzing keyword clusters and generating AI recommendations"
          : "Select a keyword cluster to optimize. The top keyword from the cluster will be used for research, and all cluster keywords will be included in the optimization plan."
      }
      actions={
        <Button variant="tool" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      {!isAnalyzingClusters && recommendation ? (
        <div className={ROW}>
          <h3 className="text-base font-semibold">AI Recommendation, best choice</h3>
          <p className="text-base font-semibold text-primary">{recommendedKeyword || "N/A"}</p>
          <p className="whitespace-pre-wrap text-base text-muted-foreground">{recommendation.reasoning || "No reasoning provided"}</p>
          {recommendation.alternativeOptions?.map((alt, idx) => (
            <p key={idx} className="text-base">
              <span className="font-semibold">{alt.keyword}</span>
              <span className="ml-2 text-muted-foreground">{alt.reason}</span>
            </p>
          ))}
          <div className="flex">
            <Button variant="run" icon={Sparkles} reserved={!recommendedKeyword} onClick={useRecommendation}>
              Use AI Recommendation
            </Button>
          </div>
        </div>
      ) : null}

      {!isAnalyzingClusters && clusters.length > 0 ? (
        <>
          <h3 className="pt-1.5 text-base font-semibold">Keyword Clusters</h3>
          {clusters.map((cluster, clusterIdx) => {
            const isSelected = selectedCluster === clusterIdx;
            const list = cluster.queries ?? [];
            const topKeyword = clusterTopKeyword(list);
            const clusterKeywords = list.map((q) => q.query.trim()).filter((q) => q && q !== (topKeyword?.query ?? ""));
            const stats = cluster.characteristics;
            return (
              <div
                key={clusterIdx}
                role="button"
                tabIndex={0}
                onClick={() => onSelectCluster(clusterIdx)}
                onKeyDown={(e) => e.key === "Enter" && onSelectCluster(clusterIdx)}
                className={`${ROW} cursor-pointer ${isSelected ? "bg-ui-field-hover" : "hover:bg-ui-field-hover"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">{cluster.name || "Unknown Cluster"}</span>
                  <span className="text-base text-muted-foreground">
                    {cluster.recommendation?.priority || "medium"} priority
                    {stats?.isLocal ? ", local" : ""}, {stats?.intent || "mixed"}
                  </span>
                  <CheckCircle2 className={`ml-auto h-4 w-4 text-primary ${isSelected ? "" : "invisible"}`} aria-hidden />
                </div>
                {cluster.description ? <p className="text-base text-muted-foreground">{cluster.description}</p> : null}
                {cluster.recommendation?.reasoning ? (
                  <p className="text-base text-muted-foreground">{cluster.recommendation.reasoning}</p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <span className={STAT}>{list.length} queries</span>
                  <span className={STAT}>{stats?.totalClicks || 0} clicks</span>
                  <span className={STAT}>{stats?.totalImpressions || 0} impressions</span>
                  <span className={STAT}>
                    Avg position {(stats?.avgPosition || 0) > 0 ? stats.avgPosition.toFixed(1) : "N/A"}
                  </span>
                </div>
                {topKeyword ? (
                  <p className="text-base">
                    <span className="text-muted-foreground">Top keyword (for research) </span>
                    <span className="font-semibold text-primary">{topKeyword.query}</span>
                    <span className="ml-2 text-muted-foreground">
                      {topKeyword.clicks || 0} clicks, {topKeyword.impressions || 0} impressions, pos{" "}
                      {(topKeyword.position || 0) > 0 ? topKeyword.position.toFixed(1) : "N/A"}
                    </span>
                  </p>
                ) : null}
                {clusterKeywords.length > 0 ? (
                  <p className="text-base text-muted-foreground">
                    + {clusterKeywords.length} additional keywords: {clusterKeywords.slice(0, 10).join(", ")}
                    {clusterKeywords.length > 10 ? `, +${clusterKeywords.length - 10} more` : ""}
                  </p>
                ) : null}
                <div className="flex">
                  <Button
                    variant="run"
                    icon={Sparkles}
                    reserved={!isSelected || !topKeyword}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (topKeyword) onSelectKeyword(topKeyword, clusterKeywords);
                    }}
                  >
                    Optimize with This Cluster
                  </Button>
                </div>
              </div>
            );
          })}
        </>
      ) : null}

      {!isAnalyzingClusters && clusters.length === 0 ? (
        <>
          <h3 className="text-base font-semibold">All Keywords ({safeQueries.length} total)</h3>
          <div className="flex max-h-[25rem] flex-col gap-px overflow-y-auto">
            {safeQueries.slice(0, 50).map((item, index) => {
              const isRecommended = recommendedKeyword !== "" && normalize(recommendedKeyword) === normalize(item.query);
              return (
                <Button
                  key={index}
                  onClick={() => selectKeyword(item)}
                >
                  <span className="text-base font-semibold">
                    {item.query}
                    {isRecommended ? <span className="ml-2 text-primary">AI Recommended</span> : null}
                  </span>
                  <span className="text-base text-muted-foreground">
                    {item.clicks > 0 ? `${item.clicks} clicks, ` : ""}
                    {item.impressions} impressions
                    {item.position > 0 ? `, position ${item.position.toFixed(1)}` : ""}
                  </span>
                </Button>
              );
            })}
            {safeQueries.length > 50 ? (
              <p className="bg-ui-field p-3 text-base text-muted-foreground">Showing top 50 of {safeQueries.length} keywords</p>
            ) : null}
          </div>
        </>
      ) : null}
    </DialogShell>
  );
};