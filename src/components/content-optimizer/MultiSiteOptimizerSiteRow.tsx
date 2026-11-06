import { Sparkles } from "lucide-react";
import { MultiSiteRowDatePicker } from "@/components/content-optimizer/MultiSiteRowDatePicker";
import { MultiSiteSitemapModeSelect } from "@/components/content-optimizer/MultiSiteSitemapModeSelect";
import { OptimizationActivityStrip } from "@/components/integrations/wordpress/WordPressSiteListMetrics";
import { optimizationStatsForSite } from "@/components/integrations/wordpress/wordpress-site-list-stats";
import { CompactWordPressTile } from "@/components/integrations/wordpress/CompactWordPressTile";
import {
  CONTENT_OPTIMIZER_COMPACT_ROW_INNER_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL,
  CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER,
  CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL,
  CONTENT_OPTIMIZER_MULTI_SITE_OPT_COUNT_SLOT,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  pickPostSitemapUrlForSite,
} from "@/lib/content-optimization/multi-site-source-urls";
import {
  resolveMultiSiteRowActivityIso,
} from "@/lib/content-optimization/multi-site-last-completed-at";
import { cn } from "@/lib/utils";
import { Button, Checkbox } from "@/ui";
import {
  MULTI_SITE_CHECKBOX_CLASS,
  type MultiSiteOptimizerSiteRowProps,
} from "@/components/content-optimizer/multi-site-content-optimizer-panel-types";

function MultiSiteOptimizeLogoButtonContent({ busy }: { busy: boolean }) {
  if (busy) {
    return null;
  }
  return <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-foreground sm:h-4 sm:w-4" aria-hidden />;
}

export function MultiSiteOptimizerSiteRow({
  site,
  stripeIndex,
  cfg,
  rowSelected,
  rowBusy,
  actionsBlocked,
  optimizationStatsBySite,
  lastCompletedBySite,
  manualRowDateBySite,
  onToggleSelected,
  onSetRowSource,
  onManualRowDatePick,
  onOptimizeSite,
}: MultiSiteOptimizerSiteRowProps) {
  const entityMissing = !site.entitySitemapUrl?.trim();
  const resolvedPostSitemap = pickPostSitemapUrlForSite(site);
  const canPost = cfg?.source === "post" && Boolean(resolvedPostSitemap);
          const canEntity = cfg?.source === "entity" && !entityMissing;
          const canBoth =
            cfg?.source === "both" && Boolean(resolvedPostSitemap) && !entityMissing;
          const canRun = Boolean(cfg) && (canPost || canEntity || canBoth);
          const bySourceDone = cfg ? lastCompletedBySite[site.id] : undefined;
          const bySourceManual = cfg ? manualRowDateBySite[site.id] : undefined;
          const lastIso = cfg
            ? resolveMultiSiteRowActivityIso(
                bySourceDone,
                bySourceManual,
                cfg.source,
                site,
                resolvedPostSitemap,
              )
            : undefined;

          const sitemapModeErrorTitle =
            cfg?.source === "post" && !resolvedPostSitemap
              ? "Detect posts in Integrations."
              : cfg?.source === "entity" && entityMissing
                ? "Entity not set in Integrations."
                : cfg?.source === "both" && (!resolvedPostSitemap || entityMissing)
                  ? "Both needs post and entity in Integrations."
                  : null;

          const lastRunFallback = sitemapModeErrorTitle ? "N/A" : "Not optimized";
          const lastRunTitle =
            sitemapModeErrorTitle ??
            (lastIso ? undefined : "No optimization date yet. Pick a date or run optimize.");


  return (
            <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
              <div
                className={cn(
                  contentOptimizerRowStripeClass(stripeIndex),
                  "hover:bg-ui-field",
                  CONTENT_OPTIMIZER_COMPACT_ROW_INNER_CLASS,
                  "items-center",
                )}
              >
              <div className="flex shrink-0 items-center justify-center">
                <Checkbox
                  id={`ms-row-${site.id}`}
                  checked={rowSelected}
                  onCheckedChange={(c) => onToggleSelected(site.id, c)}
                  className={MULTI_SITE_CHECKBOX_CLASS}
                  aria-label={`Select ${site.name}`}
                />
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 items-center border-0 bg-transparent px-0 py-0">
                <CompactWordPressTile
                  variant="listRow"
                  site={site}
                  isTesting={false}
                  isExpanded={false}
                  onToggle={() => {}}
                  propertyRowDisplay="compact"
                  hideCopyUrl
                  linkTitleToSite
                />
              </div>

              <div
                className={cn(
                  "flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2",
                )}
              >
                <div className={CONTENT_OPTIMIZER_MULTI_SITE_OPT_COUNT_SLOT}>
                  <OptimizationActivityStrip
                    site={site}
                    stats={optimizationStatsForSite(site, optimizationStatsBySite)}
                    rowDisplay="compact"
                  />
                </div>

                {!cfg ? (
                  <>
                    <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER}>
                      <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL}>
                        <div
                          className="h-full w-full shrink-0 rounded-none bg-ui-field/90"
                          aria-hidden
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center self-stretch">
                        <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL}>
                          <span className="break-words !text-white">Initializing…</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="run"
                      type="button"
                      disabled
                      aria-label="Optimize with AI"
                    >
                      <MultiSiteOptimizeLogoButtonContent busy={false} />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_OUTER}>
                      <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_LEFT_CELL}>
                        <MultiSiteSitemapModeSelect
                          value={cfg.source}
                          onSelect={(next) => onSetRowSource(site.id, next)}
                          availability={{
                            post: Boolean(resolvedPostSitemap),
                            entity: !entityMissing,
                          }}
                          disabled={actionsBlocked}
                          ariaLabel={`Source for ${site.name}`}
                          showMixedSentinel={false}
                        />
                      </div>
                      <MultiSiteRowDatePicker
                        siteId={site.id}
                        source={cfg.source}
                        activityIso={lastIso}
                        fallbackLabel={lastRunFallback}
                        title={lastRunTitle}
                        disabled={Boolean(sitemapModeErrorTitle) || actionsBlocked}
                        onPick={onManualRowDatePick}
                      />
                    </div>

                    <Button
                      variant="run"
                      type="button"
                      disabled={!canRun || rowBusy || actionsBlocked}
                      onClick={() => void onOptimizeSite(site)}
                      aria-label={rowBusy ? `Optimizing ${site.name}` : `Optimize ${site.name} with AI`}
                    >
                      <MultiSiteOptimizeLogoButtonContent busy={rowBusy} />
                    </Button>
                  </>
                )}
              </div>
            </div>
            </div>
  );
}
