import { Download } from "lucide-react";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSiteKwHostedLink } from "@/lib/bulk/prompt-bulk-site-kw-scrape";
import type { SiteWarmInventoryDisplayRow } from "@/lib/overview/site-warm-inventory-display-rows";

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

const ROW_CLASS = "flex min-h-9 min-w-0 items-center gap-2 text-base";

function InventoryDisplayRow({ row }: { row: SiteWarmInventoryDisplayRow }) {
  return (
    <li className={ROW_CLASS}>
      <span className="min-w-0 flex-1 font-medium text-white">{row.label}</span>
      <span className="w-[7.5rem] shrink-0 tabular-nums text-right text-muted-foreground">
        {row.count} {row.unit}
      </span>
      <span className="inline-flex h-7 w-[4.25rem] shrink-0 items-center justify-end">
        {row.download ? (
          <a
            href={row.download.href}
            download={row.download.filename}
            aria-label={`Download ${row.label}`}
            className="inline-flex h-7 items-center gap-1 px-2 text-base text-white hover:bg-white/10 hover:text-white"
          >
            <Download className="h-4 w-4" aria-hidden />
            File
          </a>
        ) : null}
      </span>
    </li>
  );
}

function InventoryHostedLinkRow({
  label,
  href,
  filename,
  count,
  unit,
}: {
  label: string;
  href: string;
  filename: string;
  count: number;
  unit: string;
}) {
  return (
    <li className={ROW_CLASS}>
      <span className="min-w-0 flex-1 font-medium text-white">{label}</span>
      <span className="w-[7.5rem] shrink-0 tabular-nums text-right text-muted-foreground">
        {count} {unit}
      </span>
      <span className="inline-flex h-7 w-[4.25rem] shrink-0 items-center justify-end">
        <a
          href={href}
          download={filename}
          aria-label={`Download ${label}`}
          className="inline-flex h-7 items-center gap-1 px-2 text-base text-white hover:bg-white/10 hover:text-white"
        >
          <Download className="h-4 w-4" aria-hidden />
          File
        </a>
      </span>
    </li>
  );
}

export function SitemapInventoryLinksList({
  links,
  gscLink,
  inventoryRows,
}: {
  links: PromptBulkSitemapInventoryLink[];
  gscLink?: BulkGscKeywordsHostedLink | PromptBulkSiteKwHostedLink | null;
  inventoryRows?: SiteWarmInventoryDisplayRow[];
}) {
  if (inventoryRows?.length) {
    return (
      <ul className="space-y-1 px-2.5 py-2 sm:px-3">
        {inventoryRows.map((row) => (
          <InventoryDisplayRow key={row.key} row={row} />
        ))}
      </ul>
    );
  }
  if (!links.length && !gscLink) return null;
  return (
    <ul className="space-y-1 px-2.5 py-2 sm:px-3">
      {links.map((link) => (
        <InventoryHostedLinkRow
          key={link.href}
          label={link.label}
          href={link.href}
          filename={link.filename}
          count={link.rowCount}
          unit="URLs"
        />
      ))}
      {gscLink ? (
        <InventoryHostedLinkRow
          key={gscLink.href}
          label={gscLink.label}
          href={gscLink.href}
          filename={gscLink.filename}
          count={gscLink.rowCount}
          unit="keywords"
        />
      ) : null}
    </ul>
  );
}
