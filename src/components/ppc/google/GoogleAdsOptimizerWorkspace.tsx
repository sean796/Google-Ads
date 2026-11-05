import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_SELECT_TRIGGER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { GoogleAdsCampaignInsightsPanel } from "@/components/ppc/google/GoogleAdsCampaignInsightsPanel";
import { computeMomCompareRanges } from "@/lib/gsc-reporting/gsc-fetch-date-presets";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";
import { loadPpcCampaignInsights } from "@/lib/ppc/load-ppc-campaign-insights";
import { ppcCampaignInsightsDateRangeLabel } from "@/lib/ppc/ppc-campaign-insights-display";
import type { PpcCampaignInsights } from "@/lib/ppc/ppc-campaign-insights-types";
import {
  PPC_INSIGHTS_SCOPE_CAMPAIGN,
  type PpcInsightsScope,
} from "@/lib/ppc/ppc-campaign-insights-scope";
import type { PpcGoogleWorkspaceController } from "@/hooks/ppc/use-ppc-google-workspace";
import { cn } from "@/lib/utils";
import { Button, SelectField } from "@/ui";

export type GoogleAdsOptimizerWorkspaceProps = {
  ctrl: PpcGoogleWorkspaceController;
};

export function GoogleAdsOptimizerWorkspace({ ctrl }: GoogleAdsOptimizerWorkspaceProps) {
  const customerId = normalizeGoogleAdsCustomerId(ctrl.site.googleAdsCustomerId ?? "");
  const linkedRows = useMemo(
    () => ctrl.displayCampaigns.filter((row) => row.adsCampaignId),
    [ctrl.displayCampaigns],
  );

  const [selectedRowId, setSelectedRowId] = useState<string>(() => linkedRows[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [insights, setInsights] = useState<PpcCampaignInsights | null>(null);
  const [insightsScope, setInsightsScope] = useState<PpcInsightsScope>(PPC_INSIGHTS_SCOPE_CAMPAIGN);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (linkedRows.length === 0) {
      setSelectedRowId("");
      return;
    }
    if (!linkedRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(linkedRows[0]!.id);
    }
  }, [linkedRows, selectedRowId]);

  const selectedRow = linkedRows.find((row) => row.id === selectedRowId);

  const refresh = useCallback(async () => {
    if (!customerId || !selectedRow?.adsCampaignId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setErrorMessage(null);

    const ranges = computeMomCompareRanges();

    try {
      const result = await loadPpcCampaignInsights({
        customerId,
        campaignId: selectedRow.adsCampaignId,
        startDate: ranges.primary.startDate,
        endDate: ranges.primary.endDate,
        compareStartDate: ranges.compare.startDate,
        compareEndDate: ranges.compare.endDate,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setInsights(result);
      setStatus("ready");
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(err instanceof Error ? err.message : "Failed to load campaign insights.");
      setInsights(null);
      setStatus("error");
    }
  }, [customerId, selectedRow?.adsCampaignId]);

  useEffect(() => {
    if (!selectedRow?.adsCampaignId || !customerId) {
      setStatus("idle");
      setInsights(null);
      return;
    }
    setInsightsScope(PPC_INSIGHTS_SCOPE_CAMPAIGN);
    void refresh();
  }, [selectedRow?.adsCampaignId, customerId, refresh]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!customerId) {
    return (
      <p className="text-base text-muted-foreground">
        Set a Google Ads customer ID on this site to use Optimizer.
      </p>
    );
  }

  if (linkedRows.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        Publish a campaign to Google Ads first. Optimizer needs a linked campaign ID on a row.
      </p>
    );
  }

  const periodHint = insights ? ppcCampaignInsightsDateRangeLabel(insights) : "Last full month vs previous month";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelectField placeholder="Linked campaign" value={selectedRowId} onValueChange={setSelectedRowId} options={linkedRows.map((row) => ({ value: row.id, label: row.campaignName || row.adsCampaignId }))} />

        <span className="text-base text-muted-foreground">{periodHint}</span>

        <Button
          variant="run"
          type="button"
          disabled={status === "loading"}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("h-4 w-4", status === "loading" && "")} aria-hidden />
          Refresh
        </Button>
      </div>

      <div className="min-h-[14rem] flex-1 rounded-none bg-black px-3 py-3">
        {status === "loading" ? (
          <p className="text-base text-muted-foreground">Loading campaign insights…</p>
        ) : null}
        {status === "error" && errorMessage ? (
          <p className="text-base text-ui-danger-hover">{errorMessage}</p>
        ) : null}

        {status === "ready" && insights ? (
          <GoogleAdsCampaignInsightsPanel
            insights={insights}
            scope={insightsScope}
            onScopeChange={setInsightsScope}
            showCompare
            tableLimit={50}
          />
        ) : null}
      </div>
    </div>
  );
}
