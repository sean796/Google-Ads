import { RefreshCw } from "lucide-react";
import { GoogleAdsCampaignInsightsPanel } from "@/components/ppc/google/GoogleAdsCampaignInsightsPanel";
import { GoogleAdsLiveAdsSelect } from "@/components/ppc/google/GoogleAdsLiveAdsSelect";
import {
  GoogleAdsDetailsSection,
  PPC_DETAILS_ACCORDION_STACK,
} from "@/components/ppc/google/google-ads-details-accordion";
import { usePpcCampaignInsights } from "@/hooks/ppc/use-ppc-campaign-insights";
import type { PpcInsightsScope } from "@/lib/ppc/ppc-campaign-insights-scope";
import { PPC_INSIGHTS_SCOPE_CAMPAIGN } from "@/lib/ppc/ppc-campaign-insights-scope";
import type { PpcCampaign } from "@/lib/ppc/google-ads-types";
import type {
  PpcCampaignInsights,
  PpcCampaignStructureAd,
  PpcCampaignStructureAdGroup,
} from "@/lib/ppc/ppc-campaign-insights-types";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { Button } from "@/ui";

const SHELL_CLASS = "min-h-[14rem] w-full min-w-0 rounded-none bg-black px-3 py-3";

type GoogleAdsCampaignLiveInsightsSectionProps = {
  customerId: string;
  campaignId: string;
  campaignName: string;
  scope?: PpcInsightsScope;
  campaign?: PpcCampaign;
  selectedLiveAdKey?: string | null;
  onSelectedLiveAdKeyChange?: (key: string | null, ad: PpcCampaignStructureAd | null) => void;
  onStructureAdGroups?: (groups: PpcCampaignStructureAdGroup[]) => void;
  onInsightsReady?: (insights: PpcCampaignInsights) => void;
};

export function GoogleAdsCampaignLiveInsightsSection({
  customerId,
  campaignId,
  campaignName,
  scope = PPC_INSIGHTS_SCOPE_CAMPAIGN,
  campaign,
  selectedLiveAdKey = null,
  onSelectedLiveAdKeyChange,
  onStructureAdGroups,
  onInsightsReady,
}: GoogleAdsCampaignLiveInsightsSectionProps) {
  const { status, insights, errorMessage, refresh, fetchOnceOnOpen } = usePpcCampaignInsights({
    customerId,
    campaignId,
  });

  useEffect(() => {
    if (status === "ready" && insights?.structureAdGroups) {
      onStructureAdGroups?.(insights.structureAdGroups);
    }
  }, [insights?.structureAdGroups, onStructureAdGroups, status]);

  useEffect(() => {
    if (status === "ready" && insights) {
      onInsightsReady?.(insights);
    }
  }, [insights, onInsightsReady, status]);

  const headerAction = (
    <Button
      variant="quiet"
      type="button"
      disabled={status === "loading"}
      onClick={(e) => {
        e.stopPropagation();
        void refresh();
      }}
    >
      <RefreshCw className={cn("mr-1 h-4 w-4", status === "loading" && "")} aria-hidden />
      Refresh
    </Button>
  );

  return (
    <GoogleAdsDetailsSection
      icon={<span className="text-base font-semibold text-semantic-analysis-foreground tabular-nums">Live</span>}
      title="Google Ads performance"
      badge={campaignName}
      defaultOpen={false}
      headerAction={headerAction}
      onOpenChange={fetchOnceOnOpen}
      contentClassName={PPC_DETAILS_ACCORDION_STACK}
    >
      <div className={SHELL_CLASS}>
        {status === "idle" ? (
          <p className="text-base text-muted-foreground">Open this section to load live metrics from Google Ads.</p>
        ) : null}

        {status === "loading" ? (
          <p className="text-base text-muted-foreground">Loading campaign insights…</p>
        ) : null}

        {status === "error" && errorMessage ? (
          <p className="text-base text-ui-danger-hover">{errorMessage}</p>
        ) : null}

        {status === "ready" && insights ? (
          <>
            <div className="mb-3 w-full min-w-0">
              <GoogleAdsLiveAdsSelect
                insights={insights}
                campaign={campaign}
                selectedLiveAdKey={selectedLiveAdKey}
                onSelectedLiveAdKeyChange={(key, ad) => onSelectedLiveAdKeyChange?.(key, ad)}
              />
            </div>
            <GoogleAdsCampaignInsightsPanel insights={insights} scope={scope} periodHint="Last 30 days" />
          </>
        ) : null}
      </div>
    </GoogleAdsDetailsSection>
  );
}
