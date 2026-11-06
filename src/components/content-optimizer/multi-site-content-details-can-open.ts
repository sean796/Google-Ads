import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";

export function multiSiteContentDetailsCanOpen(
  batchBulkState: BulkOptimizationState | null | undefined,
  warmInventory?: {
    sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
    gscHostedLink: BulkGscKeywordsHostedLink | null;
    sitemapInventoryLoading: boolean;
  },
): boolean {
  if (batchBulkState?.urls?.length) return true;
  return Boolean(warmInventory);
}
