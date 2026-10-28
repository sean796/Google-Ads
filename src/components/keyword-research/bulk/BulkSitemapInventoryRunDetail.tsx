import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSiteKwHostedLink } from "@/lib/bulk/prompt-bulk-site-kw-scrape";
import type { SiteWarmInventoryDisplayRow } from "@/lib/overview/site-warm-inventory-display-rows";
import {
  SitemapInventoryLinksList,
  downloadAllHostedInventoryFiles,
  hostedInventoryDownloads,
} from "@/components/keyword-research/bulk/SitemapInventoryLinksList";
import { META_FIELD_END_RAIL_BTN } from "@/components/overview/MetaOptimizerPageRowDetails";

export type BulkSitemapInventoryRunDetailProps = {
  links: PromptBulkSitemapInventoryLink[];
  gscHostedLink?: BulkGscKeywordsHostedLink | PromptBulkSiteKwHostedLink | null;
  inventoryRows?: SiteWarmInventoryDisplayRow[];
  loading?: boolean;
  pinned?: boolean;
};

/** Shared Run detail block: sitemap + GSC hosted JSON links. */
export function BulkSitemapInventoryRunDetail({
  links,
  gscHostedLink = null,
  inventoryRows,
  loading = false,
  pinned = false,
}: BulkSitemapInventoryRunDetailProps) {
  const hasDisplayRows = Boolean(inventoryRows?.length);
  const hasSitemapLinks = links.length > 0;
  const hasGscLink = Boolean(gscHostedLink);
  if (!pinned) {
    if (!hasDisplayRows && !hasSitemapLinks && !hasGscLink) return null;
    if (loading) return null;
  }

  const downloadCount = hostedInventoryDownloads(links, gscHostedLink).length;
  return (
    <>
      <div className="flex h-8 items-center gap-2 px-2.5 sm:px-3">
        <p className="min-w-0 flex-1 text-base font-medium text-white">Sitemap inventory</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          {downloadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={META_FIELD_END_RAIL_BTN}
              title="Download all"
              onClick={() => downloadAllHostedInventoryFiles(links, gscHostedLink)}
            >
              <Download className="h-4 w-4 shrink-0" />
            </Button>
          ) : null}
        </div>
      </div>
      <SitemapInventoryLinksList
        links={links}
        gscLink={gscHostedLink}
        inventoryRows={pinned ? inventoryRows : inventoryRows}
      />
    </>
  );
}
