import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  contentOptimizerRowStripeClass,
  contentOptimizerRowStripeHoverClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { GoogleAdsCampaignRowGenerateButton } from "@/components/ppc/google/GoogleAdsCampaignRowGenerateButton";
import { GoogleAdsLandingPageField } from "@/components/ppc/google/GoogleAdsLandingPageField";
import { GoogleAdsRowEndRail } from "@/components/ppc/google/GoogleAdsRowEndRail";
import {
  PPC_CAMPAIGN_ROW_FIELD_CELL,
  PPC_CAMPAIGN_ROW_GRID_CLASS,
  PPC_ROW_CONTENT_SPAN_CLASS,
} from "@/components/ppc/google/google-ads-row-constants";
import { PPC_DETAIL_INPUT_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import {
  resolvePpcRowCampaignName,
  resolvePpcRowFocusKeyword,
  resolvePpcRowLandingPageUrl,
  type PpcCampaignRow,
  type PpcWpPageContext,
} from "@/lib/ppc/google-ads-types";
import { useGoogleAdsConnectionStatus } from "@/hooks/use-google-ads-connection-status";
import { googleAdsCampaignUrl } from "@/lib/ads-reporting/ads-reporting-metrics";
import { GoogleAdsEntityStatusIcon } from "@/components/ppc/google/GoogleAdsEntityStatusIcon";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

export type GoogleAdsCampaignRowCompactProps = {
  row: PpcCampaignRow;
  isExpanded: boolean;
  panelId?: string;
  embedded?: boolean;
  stripeIndex?: number;
  deleteDisabled?: boolean;
  nameReadOnly?: boolean;
  keywordReadOnly?: boolean;
  landingPageReadOnly?: boolean;
  wpPages?: PpcWpPageContext[];
  wpPagesLoading?: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  onNameChange?: (name: string) => void;
  onKeywordChange?: (keyword: string) => void;
  onLandingPageChange?: (url: string) => void;
  onDailyBudgetChange?: (budget: number | undefined) => void;
  onLoadWpPages?: () => void;
  generateDisabled?: boolean;
  isRowGenerating?: boolean;
  onGenerate?: () => void;
  adsCustomerId?: string;
  googleAdsCampaignStatus?: string;
};

function GoogleAdsCampaignIdCell({
  customerId,
  campaignId,
  campaignStatus,
}: {
  customerId?: string;
  campaignId?: string;
  campaignStatus?: string;
}) {
  const { mccId } = useGoogleAdsConnectionStatus();
  const id = campaignId?.trim() ?? "";
  const href = id ? googleAdsCampaignUrl(customerId ?? "", id, mccId) : null;

  const statusSlot =
    id && campaignStatus ? (
      <GoogleAdsEntityStatusIcon status={campaignStatus} className="mr-1.5" />
    ) : id ? (
      <span className="mr-1.5 inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
    ) : null;

  if (href) {
    return (
      <a
        className={cn(
          PPC_DETAIL_INPUT_CLASS,
          "flex h-9 w-full min-w-0 items-center break-words tabular-nums text-foreground underline-offset-2 hover:underline",
        )}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open campaign ${id} in Google Ads`}
        onClick={(e) => e.stopPropagation()}
      >
        {statusSlot}
        <span className="min-w-0 break-words">{id}</span>
      </a>
    );
  }

  return (
    <div className={cn(PPC_DETAIL_INPUT_CLASS, "flex h-9 w-full min-w-0 items-center")}>
      {statusSlot}
      <Field
        readOnly
        value=""
        placeholder="Campaign ID"
        aria-label="Campaign ID"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function GoogleAdsCampaignRowActions({
  isExpanded,
  deleteDisabled,
  generateDisabled,
  isRowGenerating,
  onDelete,
  onGenerate,
  onToggle,
}: {
  isExpanded: boolean;
  deleteDisabled?: boolean;
  generateDisabled?: boolean;
  isRowGenerating?: boolean;
  onDelete?: () => void;
  onGenerate?: () => void;
  onToggle: () => void;
}) {
  return (
    <GoogleAdsRowEndRail
      generate={
        onGenerate ? (
          <GoogleAdsCampaignRowGenerateButton
            busy={isRowGenerating}
            disabled={generateDisabled}
            onClick={onGenerate}
          />
        ) : undefined
      }
      onDelete={onDelete}
      deleteDisabled={deleteDisabled}
      deleteLabel="Delete campaign"
      chevron={
        <Button
          variant="quiet"
          aria-label={isExpanded ? "Collapse campaign" : "Expand campaign"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
        </Button>
      }
    />
  );
}

export function GoogleAdsCampaignRowCompact({
  row,
  isExpanded,
  panelId,
  embedded = false,
  stripeIndex = 0,
  deleteDisabled = false,
  nameReadOnly = false,
  keywordReadOnly = false,
  landingPageReadOnly = false,
  wpPages = [],
  wpPagesLoading = false,
  onToggle,
  onDelete,
  onNameChange,
  onKeywordChange,
  onLandingPageChange,
  onDailyBudgetChange,
  onLoadWpPages,
  generateDisabled = false,
  isRowGenerating = false,
  onGenerate,
  adsCustomerId,
  googleAdsCampaignStatus,
}: GoogleAdsCampaignRowCompactProps) {
  const nameValue = resolvePpcRowCampaignName(row);
  const keywordValue = resolvePpcRowFocusKeyword(row);
  const landingPageValue = resolvePpcRowLandingPageUrl(row);
  const displayName = nameValue.trim() || (row.status === "generating" ? "Generating…" : "");
  const canEditName = !nameReadOnly && Boolean(onNameChange);
  const canEditKeyword = !keywordReadOnly && Boolean(onKeywordChange);
  const canEditLandingPage = !landingPageReadOnly && Boolean(onLandingPageChange);
  const budgetReadOnly = row.status === "generating";

  const campaignIdCell = (
    <GoogleAdsCampaignIdCell
      customerId={adsCustomerId}
      campaignId={row.adsCampaignId}
      campaignStatus={googleAdsCampaignStatus}
    />
  );

  const budgetField = (
    <Field
      type="number"
      min={1}
      step={1}
      value={row.dailyBudget ?? ""}
      placeholder="Daily budget"
      aria-label="Daily budget"
      disabled={budgetReadOnly}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onDailyBudgetChange?.(undefined);
          return;
        }
        const next = Number(raw);
        if (Number.isFinite(next)) onDailyBudgetChange?.(next);
      }}
    />
  );

  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, [role='combobox'], input, textarea, [data-landing-page-picker]")) return;
    onToggle();
  };

  const landingPageField = canEditLandingPage ? (
    <GoogleAdsLandingPageField
      value={landingPageValue}
      wpPages={wpPages}
      wpPagesLoading={wpPagesLoading}
      disabled={landingPageReadOnly}
      onOpen={onLoadWpPages}
      onChange={(url) => onLandingPageChange?.(url)}
    />
  ) : (
    <span className="block min-w-0 break-words text-base text-foreground">
      {landingPageValue || "Landing page"}
    </span>
  );

  return (
    <div
      className={cn(
        !embedded && contentOptimizerRowStripeClass(stripeIndex),
        !embedded && contentOptimizerRowStripeHoverClass(stripeIndex),
        PPC_CAMPAIGN_ROW_GRID_CLASS,
        "cursor-pointer",
      )}
      aria-controls={panelId}
      onClick={handleRowClick}
    >
      {!isExpanded ? (
        <>
          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>{campaignIdCell}</div>

          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>
            {canEditName ? (
              <Field
                value={nameValue}
                placeholder="Campaign name"
                aria-label="Campaign name"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onNameChange?.(e.target.value)}
              />
            ) : (
              <span className="whitespace-normal break-words text-base font-bold leading-snug text-foreground">
                {displayName}
              </span>
            )}
          </div>

          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>{landingPageField}</div>

          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>
            {canEditKeyword ? (
              <Field
                value={keywordValue}
                placeholder="Keyword"
                aria-label="Keyword"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onKeywordChange?.(e.target.value)}
              />
            ) : (
              <span className="whitespace-normal break-words text-base leading-snug text-foreground">
                {keywordValue}
              </span>
            )}
          </div>

          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>{budgetField}</div>

          <GoogleAdsCampaignRowActions
            isExpanded={false}
            deleteDisabled={deleteDisabled}
            generateDisabled={generateDisabled}
            isRowGenerating={isRowGenerating}
            onDelete={onDelete}
            onGenerate={onGenerate}
            onToggle={onToggle}
          />
        </>
      ) : embedded ? (
        <>
          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>{campaignIdCell}</div>

          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>
            {canEditName ? (
              <Field
                value={nameValue}
                placeholder="Campaign name"
                aria-label="Campaign name"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onNameChange?.(e.target.value)}
              />
            ) : (
              <span className="block min-w-0 break-words text-base font-bold text-foreground">
                {displayName}
              </span>
            )}
          </div>
          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>{landingPageField}</div>
          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>
            {canEditKeyword ? (
              <Field
                value={keywordValue}
                placeholder="Keyword"
                aria-label="Keyword"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => onKeywordChange?.(e.target.value)}
              />
            ) : (
              <span className="block min-w-0 break-words text-base text-foreground">{keywordValue}</span>
            )}
          </div>
          <div className={PPC_CAMPAIGN_ROW_FIELD_CELL}>{budgetField}</div>
          <GoogleAdsCampaignRowActions
            isExpanded
            deleteDisabled={deleteDisabled}
            generateDisabled={generateDisabled}
            isRowGenerating={isRowGenerating}
            onDelete={onDelete}
            onGenerate={onGenerate}
            onToggle={onToggle}
          />
        </>
      ) : (
        <>
          <div className={PPC_ROW_CONTENT_SPAN_CLASS} aria-hidden />
          <GoogleAdsCampaignRowActions
            isExpanded
            deleteDisabled={deleteDisabled}
            generateDisabled={generateDisabled}
            isRowGenerating={isRowGenerating}
            onDelete={onDelete}
            onGenerate={onGenerate}
            onToggle={onToggle}
          />
        </>
      )}
    </div>
  );
}
