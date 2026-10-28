import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { EntitySiteWarmBundle } from "@/lib/local-analysis/entity-site-warm-cache";

export type SiteWarmInventoryDisplayRow = {
  key: string;
  label: string;
  count: number;
  unit: string;
  download?: { href: string; filename: string };
};

const PINNED_INVENTORY_SPECS = [
  { key: "pages", label: "Pages", countKey: "pages" as const, unit: "URLs" },
  { key: "posts", label: "Posts", countKey: "posts" as const, unit: "URLs" },
  { key: "sap", label: "SAP", countKey: "sap" as const, unit: "URLs" },
  { key: "gsc", label: "GSC (28 days)", countKey: "gscQueries" as const, unit: "keywords" },
];

export function buildSiteWarmInventoryDisplayRows(
  warm: EntitySiteWarmBundle | null,
  links: PromptBulkSitemapInventoryLink[],
  gscHostedLink: BulkGscKeywordsHostedLink | null,
): SiteWarmInventoryDisplayRow[] {
  const linkByLabel = new Map(links.map((l) => [l.label, l]));
  return PINNED_INVENTORY_SPECS.map((spec) => {
    if (spec.key === "gsc") {
      const count = warm?.counts.gscQueries ?? gscHostedLink?.rowCount ?? 0;
      return {
        key: spec.key,
        label: spec.label,
        count,
        unit: spec.unit,
        download: gscHostedLink
          ? { href: gscHostedLink.href, filename: gscHostedLink.filename }
          : undefined,
      };
    }
    const count = warm?.counts[spec.countKey] ?? 0;
    const link = linkByLabel.get(spec.label);
    return {
      key: spec.key,
      label: spec.label,
      count: link?.rowCount ?? count,
      unit: spec.unit,
      download: link ? { href: link.href, filename: link.filename } : undefined,
    };
  });
}
