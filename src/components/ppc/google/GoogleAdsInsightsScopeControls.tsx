
import { BULK_HEADER_SELECT_TRIGGER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import type { PpcCampaignInsights } from "@/lib/ppc/ppc-campaign-insights-types";
import type { PpcInsightsScope } from "@/lib/ppc/ppc-campaign-insights-scope";
import { ppcAdDailySeriesKey, ppcKeywordDailySeriesKey } from "@/lib/ppc/ppc-campaign-insights-scope";
import { cn } from "@/lib/utils";
import { SelectField } from "@/ui";

export type GoogleAdsInsightsScopeControlsProps = {
  insights: PpcCampaignInsights;
  scope: PpcInsightsScope;
  onScopeChange: (scope: PpcInsightsScope) => void;
  className?: string;
};

type ScopeLevel = PpcInsightsScope["level"];

const LEVELS: { id: ScopeLevel; label: string }[] = [
  { id: "campaign", label: "Campaign" },
  { id: "ad_group", label: "Ad group" },
  { id: "ad", label: "Ad" },
  { id: "keyword", label: "Keyword" },
];

export function GoogleAdsInsightsScopeControls({
  insights,
  scope,
  onScopeChange,
  className,
}: GoogleAdsInsightsScopeControlsProps) {
  const adGroupOptions =
    insights.structureAdGroups.length > 0
      ? insights.structureAdGroups
      : insights.adGroups.map((row) => ({ id: row.id, name: row.name, status: "" }));

  const selectedAdGroupId =
    scope.level === "ad_group" || scope.level === "keyword" || scope.level === "ad"
      ? scope.adGroupId
      : adGroupOptions[0]?.id ?? "";

  const adOptions = insights.structureAds.filter((row) =>
    selectedAdGroupId ? row.adGroupId === selectedAdGroupId : true,
  );

  const keywordOptions = (() => {
    if (!selectedAdGroupId) return [];
    const fromInsights = insights.keywords
      .filter((row) => {
        const ag = insights.adGroups.find((g) => g.id === selectedAdGroupId);
        return ag ? row.adGroupName === ag.name : true;
      })
      .map((row) => row.text);
    const keys = Object.keys(insights.keywordDailySeriesByKey)
      .filter((key) => key.startsWith(`${selectedAdGroupId}|`))
      .map((key) => key.slice(selectedAdGroupId.length + 1));
    return [...new Set([...fromInsights, ...keys])];
  })();

  const setLevel = (level: ScopeLevel) => {
    if (level === "campaign") {
      onScopeChange({ level: "campaign" });
      return;
    }
    const ag = adGroupOptions.find((row) => row.id === selectedAdGroupId) ?? adGroupOptions[0];
    if (!ag?.id) return;
    if (level === "ad_group") {
      onScopeChange({ level: "ad_group", adGroupId: ag.id, label: ag.name });
      return;
    }
    if (level === "ad") {
      const ad = insights.structureAds.find((row) => row.adGroupId === ag.id) ?? insights.structureAds[0];
      if (ad) {
        onScopeChange({ level: "ad", adGroupId: ad.adGroupId, adId: ad.adId, label: ad.label });
      } else {
        onScopeChange({ level: "ad_group", adGroupId: ag.id, label: ag.name });
      }
      return;
    }
    const kw = keywordOptions[0] ?? "";
    if (!kw) {
      onScopeChange({ level: "ad_group", adGroupId: ag.id, label: ag.name });
      return;
    }
    onScopeChange({ level: "keyword", adGroupId: ag.id, keywordText: kw, label: kw });
  };

  return (
    <div className={cn("flex w-full min-w-0 flex-wrap items-center justify-between gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {LEVELS.map((level) => (
          <WorkspacePill
            key={level.id}
            label={level.label}
            active={scope.level === level.id}
            onClick={() => setLevel(level.id)}
          />
        ))}
      </div>

      {scope.level !== "campaign" && adGroupOptions.length > 0 ? (
        <SelectField placeholder="Ad group" value={selectedAdGroupId} onValueChange={(adGroupId) => {
            const ag = adGroupOptions.find((row) => row.id === adGroupId);
            if (!ag) return;
            if (scope.level === "keyword" || scope.level === "ad") {
              const keys = Object.keys(insights.keywordDailySeriesByKey)
                .filter((key) => key.startsWith(`${adGroupId}|`))
                .map((key) => key.slice(adGroupId.length + 1));
              const kw = keys[0] ?? insights.keywords.find((k) => k.adGroupName === ag.name)?.text ?? "";
              if (kw) {
                onScopeChange({ level: "keyword", adGroupId, keywordText: kw, label: kw });
              } else {
                onScopeChange({ level: "ad_group", adGroupId, label: ag.name });
              }
            } else {
              onScopeChange({ level: "ad_group", adGroupId, label: ag.name });
            }
          }} options={adGroupOptions.map((row) => ({ value: row.id || row.name, label: row.name }))} />
      ) : null}

      {scope.level === "ad" && adOptions.length > 0 ? (
        <SelectField placeholder="Ad" value={scope.level === "ad" ? ppcAdDailySeriesKey(scope.adGroupId, scope.adId) : undefined} onValueChange={(key) => {
            const ad = adOptions.find((row) => ppcAdDailySeriesKey(row.adGroupId, row.adId) === key);
            if (!ad) return;
            onScopeChange({
              level: "ad",
              adGroupId: ad.adGroupId,
              adId: ad.adId,
              label: ad.label,
            });
          }} options={adOptions.map((row) => ({ value: ppcAdDailySeriesKey(row.adGroupId, row.adId), label: row.label }))} />
      ) : null}

      {scope.level === "keyword" && keywordOptions.length > 0 ? (
        <SelectField placeholder="Keyword" value={scope.level === "keyword" ? scope.keywordText : keywordOptions[0]} onValueChange={(keywordText) => {
            if (scope.level !== "keyword") return;
            onScopeChange({
              level: "keyword",
              adGroupId: scope.adGroupId,
              keywordText,
              label: keywordText,
            });
          }} options={keywordOptions.map((text) => ({ value: text, label: text }))} />
      ) : null}
    </div>
  );
}
