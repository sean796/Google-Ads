import { Download, ExternalLink, RefreshCw, Sparkles, Upload } from "lucide-react";
import { ActionButton, Button, FilterRow } from "@/ui";
import { GoogleAdsCampaignSetupFlyout } from "@/components/ppc/google/GoogleAdsCampaignSetupFlyout";
import { useGoogleAdsConnectionStatus } from "@/hooks/use-google-ads-connection-status";
import {
  formatGoogleAdsCustomerId,
  googleAdsAccountUrl,
  normalizeGoogleAdsCustomerId,
} from "@/lib/ads-reporting/ads-reporting-metrics";
import type { PpcGoogleWorkspaceController } from "@/hooks/ppc/use-ppc-google-workspace";

export type GoogleAdsGenerateToolbarProps = {
  ctrl: PpcGoogleWorkspaceController;
  disabled?: boolean;
};

const ADS_ACCOUNT_UNSET_LABEL = "Ads account";

export function GoogleAdsGenerateToolbar({ ctrl, disabled = false }: GoogleAdsGenerateToolbarProps) {
  const {
    handleGenerateCampaign,
    handleExportGoogleAdsCsv,
    canExportGoogleAdsCsv,
    handlePublishCampaigns,
    canPublish,
    handlePullFromGoogleAds,
    canPullFromGoogleAds,
    isImportingFromAds,
    isGenerating,
    isPublishing,
  } = ctrl;
  const toolbarDisabled = disabled || isGenerating || isPublishing || isImportingFromAds;
  const { mccId } = useGoogleAdsConnectionStatus();
  const adsCustomerId = normalizeGoogleAdsCustomerId(ctrl.site.googleAdsCustomerId ?? "");
  const adsAccountHref = googleAdsAccountUrl(adsCustomerId, mccId);
  const adsAccountLabel =
    adsCustomerId.length === 10 ? formatGoogleAdsCustomerId(adsCustomerId) : ADS_ACCOUNT_UNSET_LABEL;

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
      <GoogleAdsCampaignSetupFlyout ctrl={ctrl} disabled={toolbarDisabled} />

      <FilterRow align="end">
        <ActionButton
          variant="tool"
          icon={ExternalLink}
          states={[adsAccountLabel, ADS_ACCOUNT_UNSET_LABEL]}
          state={adsAccountLabel}
          disabled={!adsAccountHref}
          onClick={() => {
            if (adsAccountHref) window.open(adsAccountHref, "_blank", "noopener,noreferrer");
          }}
        />

        <Button
          variant="tool"
          icon={RefreshCw}
          disabled={toolbarDisabled || !canPullFromGoogleAds}
          onClick={() => void handlePullFromGoogleAds()}
        >
          Pull
        </Button>

        <Button
          variant="run"
          icon={Sparkles}
          disabled={toolbarDisabled}
          onClick={() => void handleGenerateCampaign()}
        >
          Generate
        </Button>

        <Button
          variant="tool"
          icon={Upload}
          disabled={toolbarDisabled || !canPublish}
          onClick={() => void handlePublishCampaigns()}
        >
          Publish
        </Button>

        <Button
          variant="tool"
          icon={Download}
          disabled={toolbarDisabled || !canExportGoogleAdsCsv}
          onClick={handleExportGoogleAdsCsv}
        >
          CSV
        </Button>
      </FilterRow>
    </div>
  );
}
