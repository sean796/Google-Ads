import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ContentOptimizerGeneratorChrome } from "@/components/content-optimizer/content-optimizer-generator-chrome";
import type { WordPressSite } from "@/components/integrations/types";
import type { useOptimizationActivityCounts } from "@/hooks/use-optimization-activity-counts";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import type {
  MultiSiteLastCompletedBySite,
  MultiSiteManualRowDateBySite,
} from "@/lib/content-optimization/multi-site-last-completed-at";
import type { MultiSiteUrlSource } from "@/lib/content-optimization/multi-site-source-urls";

export type SiteRowConfig = {
  source: MultiSiteUrlSource;
};

export const PACKAGE_OPTIMIZATION_OVERRIDE = { seoExtraTextFieldOnly: false as const };
export const BOTH_MODE_PREP_OVERRIDE = { prepEntitySitemap: true as const };

/** Match Dashboard → Properties list checkboxes (`WordPressSiteList`), including indeterminate. */
export const MULTI_SITE_CHECKBOX_CLASS =
  "border-border/60 data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover data-[state=checked]:text-muted-foreground data-[state=indeterminate]:border-border data-[state=indeterminate]:bg-ui-field-hover data-[state=indeterminate]:text-muted-foreground";

/** Flush stack; only the first row gets top inset below the progress band. */
export const MULTI_SITE_LIST_STACK = CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS;

export type MultiSiteContentOptimizerPanelProps = {
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  paginationLayoutTotal: number;
  generatorChrome?: ContentOptimizerGeneratorChrome;
};

export type MultiSiteOptimizerSiteRowProps = {
  site: WordPressSite;
  stripeIndex: number;
  cfg: SiteRowConfig | undefined;
  rowSelected: boolean;
  rowBusy: boolean;
  actionsBlocked: boolean;
  optimizationStatsBySite: ReturnType<typeof useOptimizationActivityCounts>["bySiteId"];
  lastCompletedBySite: MultiSiteLastCompletedBySite;
  manualRowDateBySite: MultiSiteManualRowDateBySite;
  onToggleSelected: (siteId: string, checked: boolean | "indeterminate") => void;
  onSetRowSource: (siteId: string, source: MultiSiteUrlSource) => void;
  onManualRowDatePick: (siteId: string, source: MultiSiteUrlSource, iso: string) => void;
  onOptimizeSite: (site: WordPressSite) => Promise<boolean>;
};
