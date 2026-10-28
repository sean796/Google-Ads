import { useMemo } from "react";
import { getStoredSites, type WordPressSite } from "@/components/IntegrationsTab";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import type { WordPressPostDestination } from "@/lib/bulk-auto-generate";
import {
  defaultBulkSitemapMode,
  normalizeBulkSitemapScopeTags,
  type BulkSitemapMode,
  type BulkSitemapScopeTag,
} from "@/lib/bulk/bulk-sitemap-mode";
import { SitemapScopeDropdown } from "@/components/shared/SitemapScopeDropdown";
import { generatorTitleRowPrimarySelectSlotProps } from "@/components/blog-generator/generator-title-row-select-width";
import { listSitemapScopeOptions } from "@/lib/sitemap-child-tags";

export type BulkSiteSitemapConfig = {
  sitemapType: BulkSitemapMode;
  scopeTags?: BulkSitemapScopeTag[];
  /** WP REST collection for blog uploads when sitemapType is post (Pages vs Posts dock). */
  wordpressRestEndpoint?: "posts" | "pages";
};

export type BulkGeneratorSitemapMenuProps = {
  postDestination: WordPressPostDestination;
  connectedSite?: ConnectedSiteSummary | null;
  selectedWordPressSites: Set<string>;
  siteConfigs: Record<string, BulkSiteSitemapConfig>;
  setSiteConfigs: (
    value:
      | Record<string, BulkSiteSitemapConfig>
      | ((
          prev: Record<string, BulkSiteSitemapConfig>,
        ) => Record<string, BulkSiteSitemapConfig>),
  ) => void;
  isDisabled?: boolean;
  showWhenLocal?: boolean;
};

function resolveTargetSite(connectedSite?: ConnectedSiteSummary | null): WordPressSite | null {
  if (!connectedSite) return null;
  const sites = getStoredSites();
  if (sites.length === 0) return null;
  const normalize = (url: string) =>
    url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");
  return sites.find((s) => normalize(s.siteUrl) === normalize(connectedSite.siteUrl)) ?? null;
}

export function BulkGeneratorSitemapMenu({
  postDestination,
  connectedSite,
  selectedWordPressSites,
  siteConfigs,
  setSiteConfigs,
  isDisabled = false,
  showWhenLocal = false,
}: BulkGeneratorSitemapMenuProps) {
  const targetSite = resolveTargetSite(connectedSite);
  const options = useMemo(
    () =>
      targetSite
        ? listSitemapScopeOptions(targetSite).map((o) => ({
            id: o.id,
            label: o.label,
            disabled: !o.enabled,
          }))
        : [],
    [targetSite],
  );

  if ((postDestination === "local" && !showWhenLocal) || !targetSite) {
    const reserve = generatorTitleRowPrimarySelectSlotProps();
    return <div className={reserve.className} style={reserve.style} aria-hidden />;
  }

  const selectedId = Array.from(selectedWordPressSites)[0] ?? targetSite.id;
  const scopeTags = normalizeBulkSitemapScopeTags(siteConfigs[selectedId]?.scopeTags);
  const activeScope = scopeTags[0] ?? "pages";

  const setScope = (tag: string) => {
    if (isDisabled) return;
    const opt = options.find((o) => o.id === tag);
    if (opt?.disabled) return;
    setSiteConfigs((prev) => ({
      ...prev,
      [selectedId]: {
        ...prev[selectedId],
        sitemapType: prev[selectedId]?.sitemapType ?? defaultBulkSitemapMode(),
        scopeTags: [tag as BulkSitemapScopeTag],
      },
    }));
  };

  return (
    <SitemapScopeDropdown
      options={options}
      value={activeScope}
      onChange={setScope}
      ariaLabel="Sitemap bucket"
      disabled={isDisabled}
    />
  );
}
