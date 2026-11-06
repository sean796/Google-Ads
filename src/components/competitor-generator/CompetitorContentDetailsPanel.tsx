import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import type { CompetitorGenerationProgress } from "@/components/competitor-generation/types";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { buildCompetitorBulkGeneratorDetailsProps } from "@/lib/competitor-research/competitor-bulk-details-bindings";

export type CompetitorContentDetailsPanelProps = {
  workspaceBusy: boolean;
  progress: CompetitorGenerationProgress | null;
  displayRows: CSVRow[];
  keyword: string;
  sitemapInventoryLinks: PromptBulkSitemapInventoryLink[];
  gscHostedLink: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading: boolean;
};

export function CompetitorContentDetailsPanel({
  workspaceBusy,
  progress,
  displayRows,
  keyword,
  sitemapInventoryLinks,
  gscHostedLink,
  sitemapInventoryLoading,
}: CompetitorContentDetailsPanelProps) {
  const props = buildCompetitorBulkGeneratorDetailsProps({
    workspaceBusy,
    progress,
    displayRows,
    keyword,
  });

  return (
    <BulkGeneratorDetailsDrawer
      {...props}
      variant="prompt"
      sitemapInventoryLinks={sitemapInventoryLinks}
      siteKwHostedLink={gscHostedLink}
      sitemapInventoryLoading={sitemapInventoryLoading}
      prepAccordionTitle="Sitemap inventory"
    />
  );
}
