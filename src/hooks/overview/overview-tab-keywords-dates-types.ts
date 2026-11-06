import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

export type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "setRows"
  | "deriveEntityKeyword"
  | "deriveFocusKeywordFromPageContext"
  | "deriveFocusKeywordsFromPageContextBatch"
  | "deriveEntityKeywordsBatch"
  | "updateRow"
  | "setBulkActionProgress"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bindings: OverviewTabBase["bindings"];
  resolveBindings: OverviewTabBase["resolveBindings"];
  resolvePostBodyHtmlForSentiment: OverviewTabBase["resolvePostBodyHtmlForSentiment"];
  bulkScopeUrlKeys: Set<string>;
};

