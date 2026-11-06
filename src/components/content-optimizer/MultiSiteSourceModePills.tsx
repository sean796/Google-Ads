import { WorkspacePill } from "@/components/shared/WorkspacePill";
import {
  multiSiteSourceLabel,
  type MultiSiteUrlSource,
} from "@/lib/content-optimization/multi-site-source-urls";
import { cn } from "@/lib/utils";

export const SITEMAP_MIXED_SENTINEL = "__ms_sitemap_mixed__" as const;

export type SitemapSelectValue = MultiSiteUrlSource | typeof SITEMAP_MIXED_SENTINEL;

const MULTI_SITE_SOURCES: MultiSiteUrlSource[] = ["post", "entity", "both"];

export type MultiSiteSourceModePillsProps = {
  value: SitemapSelectValue;
  onSelect: (next: MultiSiteUrlSource) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
};

export function MultiSiteSourceModePills({
  value,
  onSelect,
  disabled,
  ariaLabel,
  className,
}: MultiSiteSourceModePillsProps) {
  const selected = value === SITEMAP_MIXED_SENTINEL ? null : value;

  return (
    <div
      className={cn("flex min-w-0 flex-nowrap items-center gap-1", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {MULTI_SITE_SOURCES.map((source) => (
        <WorkspacePill
          key={source}
          label={multiSiteSourceLabel(source)}
          active={selected === source}
          disabled={disabled}
          square
          onClick={() => onSelect(source)}
        />
      ))}
    </div>
  );
}
