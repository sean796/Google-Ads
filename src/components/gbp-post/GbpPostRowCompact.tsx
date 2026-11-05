import type { MouseEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { WordPressSite } from "@/components/integrations/types";
import {
  contentOptimizerRowStripeClass,
  contentOptimizerRowStripeHoverClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { GoogleAdsRowEndRail } from "@/components/ppc/google/GoogleAdsRowEndRail";
import { PPC_DETAIL_INPUT_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import {
  GBP_POST_ROW_FIELD_CELL,
  GBP_POST_ROW_GRID_CLASS,
  GBP_POST_ROW_PROPERTY_FIELD,
  GBP_POST_ROW_PROPERTY_TEXT,
} from "@/components/gbp-post/gbp-post-row-constants";
import { gbpRosterSiteDisplayName } from "@/lib/gbp-post/gbp-roster-site-display-name";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

export type GbpPostRowCompactProps = {
  site: WordPressSite;
  keyword: string;
  landingPageUrl: string;
  isSelected: boolean;
  isExpanded: boolean;
  embedded?: boolean;
  panelId?: string;
  stripeIndex?: number;
  rowBusy?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onToggleSelected: (checked: boolean) => void;
  onKeywordChange: (keyword: string) => void;
  onLandingPageChange: (url: string) => void;
};

export function GbpPostRowCompact({
  site,
  keyword,
  landingPageUrl,
  isSelected,
  isExpanded,
  embedded = false,
  panelId,
  stripeIndex = 0,
  rowBusy = false,
  disabled = false,
  onToggle,
  onToggleSelected,
  onKeywordChange,
  onLandingPageChange,
}: GbpPostRowCompactProps) {
  const displayName = gbpRosterSiteDisplayName(site);

  const handleRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, [role='combobox'], input, textarea, label")) return;
    onToggle();
  };

  return (
    <div
      className={cn(
        !embedded && contentOptimizerRowStripeClass(stripeIndex),
        !embedded && contentOptimizerRowStripeHoverClass,
        GBP_POST_ROW_GRID_CLASS,
        !embedded && "cursor-pointer",
      )}
      role={embedded ? undefined : "button"}
      tabIndex={embedded ? undefined : 0}
      aria-expanded={embedded ? undefined : isExpanded}
      aria-controls={panelId}
      onClick={embedded ? undefined : handleRowClick}
      onKeyDown={
        embedded
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }
      }
    >
      <div className="flex items-center justify-center self-start pt-0.5">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(v) => onToggleSelected(v === true)}
          aria-label={`Select ${site.name}`}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className={GBP_POST_ROW_PROPERTY_FIELD}>
        <span className={GBP_POST_ROW_PROPERTY_TEXT}>{displayName}</span>
      </div>

      <div className={GBP_POST_ROW_FIELD_CELL}>
        <Field
          value={keyword}
          disabled={disabled}
          placeholder="Keyword"
          aria-label={`Keyword for ${site.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onKeywordChange(e.target.value)}
        />
      </div>

      <div className={GBP_POST_ROW_FIELD_CELL}>
        <Field
          value={landingPageUrl}
          disabled={disabled}
          placeholder="Landing page URL"
          aria-label={`Landing page URL for ${site.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onLandingPageChange(e.target.value)}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end">
        <GoogleAdsRowEndRail
          leading={
            rowBusy ? (
              null
            ) : undefined
          }
          chevron={
            <Button
              variant="quiet"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              aria-label={isExpanded ? "Collapse post details" : "Expand post details"}
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
      </div>
    </div>
  );
}
