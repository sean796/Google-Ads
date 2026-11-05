import React from "react";
import { ChevronDown, ChevronUp, ImageIcon } from "lucide-react";
import {
  contentOptimizerRowStripeClass,
  contentOptimizerRowStripeHoverClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { GoogleAdsCampaignRowGenerateButton } from "@/components/ppc/google/GoogleAdsCampaignRowGenerateButton";
import { GoogleAdsRowEndRail } from "@/components/ppc/google/GoogleAdsRowEndRail";
import {
  PPC_META_ROW_FIELD_CELL,
  PPC_META_ROW_GRID_CLASS,
} from "@/components/ppc/meta/meta-ads-row-constants";
import { PPC_DETAIL_INPUT_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import { MetaAdsRowVisualDialog } from "@/components/ppc/meta/MetaAdsRowVisualDialog";
import { MetaAdsContextSourceField } from "@/components/ppc/meta/MetaAdsContextSourceField";
import {
  resolveMetaRowAdName,
  resolveMetaRowContextSource,
  resolveMetaRowFocusKeyword,
  resolveMetaRowLandingPageUrl,
  type MetaAdContextSource,
  type MetaAdRow,
  type MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

export type MetaAdsAdRowCompactProps = {
  row: MetaAdRow;
  isExpanded: boolean;
  embedded?: boolean;
  panelId?: string;
  stripeIndex?: number;
  deleteDisabled?: boolean;
  nameReadOnly?: boolean;
  keywordReadOnly?: boolean;
  fieldsReadOnly?: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  onNameChange?: (name: string) => void;
  onKeywordChange?: (keyword: string) => void;
  onContextSourceChange?: (source: MetaAdContextSource) => void;
  onContextUrlChange?: (url: string) => void;
  onLandingPageChange?: (url: string) => void;
  generateDisabled?: boolean;
  isRowGenerating?: boolean;
  onGenerate?: () => void;
  generateConfig: MetaGenerateConfig;
  onUpdateAd: (patch: Partial<MetaAdRow>) => void;
};

function MetaAdThumbnail({ row }: { row: MetaAdRow }) {
  const src = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64 ?? null;
  if (!src) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-ui-field text-muted-foreground">
        <ImageIcon className="h-4 w-4" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-12 w-12 shrink-0 object-cover bg-ui-field"
    />
  );
}

export function MetaAdsAdRowCompact({
  row,
  isExpanded,
  embedded = false,
  panelId,
  stripeIndex = 0,
  deleteDisabled,
  nameReadOnly,
  keywordReadOnly,
  fieldsReadOnly,
  onToggle,
  onDelete,
  onNameChange,
  onKeywordChange,
  onContextSourceChange,
  onContextUrlChange,
  onLandingPageChange,
  generateDisabled,
  isRowGenerating,
  onGenerate,
  generateConfig,
  onUpdateAd,
}: MetaAdsAdRowCompactProps) {
  const adName = resolveMetaRowAdName(row);
  const focusKeyword = resolveMetaRowFocusKeyword(row);
  const landingPageUrl = resolveMetaRowLandingPageUrl(row);
  const contextSource = resolveMetaRowContextSource(row);

  return (
    <div
      className={cn(
        !embedded && contentOptimizerRowStripeClass(stripeIndex),
        !embedded && contentOptimizerRowStripeHoverClass,
        PPC_META_ROW_GRID_CLASS,
      )}
    >
      <div className={PPC_META_ROW_FIELD_CELL}>
        <MetaAdThumbnail row={row} />
      </div>

      <div className={PPC_META_ROW_FIELD_CELL}>
        <Field
          value={adName}
          readOnly={nameReadOnly}
          disabled={nameReadOnly}
          placeholder="Ad name"
          aria-label="Ad name"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onNameChange?.(e.target.value)}
        />
      </div>

      <div className={PPC_META_ROW_FIELD_CELL}>
        <MetaAdsContextSourceField
          contextSource={contextSource}
          contextUrl={row.contextUrl}
          disabled={fieldsReadOnly}
          onContextSourceChange={onContextSourceChange}
          onContextUrlChange={onContextUrlChange}
        />
      </div>

      <div className={PPC_META_ROW_FIELD_CELL}>
        <Field
          value={landingPageUrl}
          readOnly={fieldsReadOnly}
          disabled={fieldsReadOnly}
          placeholder="Landing page URL"
          aria-label="Landing page URL"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onLandingPageChange?.(e.target.value)}
        />
      </div>

      <div className={PPC_META_ROW_FIELD_CELL}>
        <Field
          value={focusKeyword}
          readOnly={keywordReadOnly}
          disabled={keywordReadOnly}
          placeholder="Keyword (defines image)"
          aria-label="Focus keyword"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onKeywordChange?.(e.target.value)}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end">
        <GoogleAdsRowEndRail
          leading={
            <MetaAdsRowVisualDialog
              row={row}
              generateConfig={generateConfig}
              disabled={fieldsReadOnly}
              onUpdateAd={onUpdateAd}
            />
          }
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
          deleteLabel="Delete ad"
          chevron={
            <Button
              variant="quiet"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              aria-label={isExpanded ? "Collapse ad details" : "Expand ad details"}
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

      {row.errorMessage ? (
        <p className="col-span-full px-2 pb-1 text-base text-destructive">{row.errorMessage}</p>
      ) : null}
    </div>
  );
}
