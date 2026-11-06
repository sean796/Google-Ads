import { SelectField } from "@/ui";
import {
  multiSiteSourceLabel,
  type MultiSiteUrlSource,
} from "@/lib/content-optimization/multi-site-source-urls";

export const SITEMAP_MIXED_SENTINEL = "__ms_sitemap_mixed__" as const;

export type SitemapSelectValue = MultiSiteUrlSource | typeof SITEMAP_MIXED_SENTINEL;

export type MultiSiteSitemapModeSelectProps = {
  value: SitemapSelectValue;
  onSelect: (next: MultiSiteUrlSource) => void;
  /** When set, Entity / Both options respect post + entity sitemap presence (per-row). Omit for "all sites". */
  availability?: { post: boolean; entity: boolean };
  disabled?: boolean;
  ariaLabel: string;
  showMixedSentinel: boolean;
};

export function MultiSiteSitemapModeSelect({
  value,
  onSelect,
  availability,
  disabled,
  ariaLabel,
  showMixedSentinel,
}: MultiSiteSitemapModeSelectProps) {
  const entityDisabled = availability ? !availability.entity : false;
  const bothDisabled = availability ? !availability.post || !availability.entity : false;

  return (
    <SelectField
      placeholder={ariaLabel}
      value={value}
      onValueChange={(v) => {
        if (v === SITEMAP_MIXED_SENTINEL) return;
        onSelect(v as MultiSiteUrlSource);
      }}
      options={[
        ...(showMixedSentinel && value === SITEMAP_MIXED_SENTINEL
          ? [{ value: SITEMAP_MIXED_SENTINEL, label: "Mixed (per site)", disabled: true }]
          : []),
        { value: "post", label: multiSiteSourceLabel("post") },
        { value: "entity", label: multiSiteSourceLabel("entity"), disabled: entityDisabled },
        { value: "both", label: multiSiteSourceLabel("both"), disabled: bothDisabled },
      ]}
      disabled={disabled}
    />
  );
}