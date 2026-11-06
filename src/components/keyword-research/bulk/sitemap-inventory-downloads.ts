import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSiteKwHostedLink } from "@/lib/bulk/prompt-bulk-site-kw-scrape";

export const HOSTED_INVENTORY_DOWNLOAD_STAGGER_MS = 300;

export type HostedInventoryDownload = { href: string; filename: string };

export function hostedInventoryDownloads(
  links: PromptBulkSitemapInventoryLink[],
  gscLink?: BulkGscKeywordsHostedLink | PromptBulkSiteKwHostedLink | null,
): HostedInventoryDownload[] {
  const out: HostedInventoryDownload[] = links.map((link) => ({
    href: link.href,
    filename: link.filename,
  }));
  if (gscLink) out.push({ href: gscLink.href, filename: gscLink.filename });
  return out;
}

export function downloadHostedInventoryFile(file: HostedInventoryDownload): void {
  const a = document.createElement("a");
  a.href = file.href;
  a.download = file.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadAllHostedInventoryFiles(
  links: PromptBulkSitemapInventoryLink[],
  gscLink?: BulkGscKeywordsHostedLink | PromptBulkSiteKwHostedLink | null,
): void {
  hostedInventoryDownloads(links, gscLink).forEach((file, index) => {
    setTimeout(() => downloadHostedInventoryFile(file), index * HOSTED_INVENTORY_DOWNLOAD_STAGGER_MS);
  });
}
