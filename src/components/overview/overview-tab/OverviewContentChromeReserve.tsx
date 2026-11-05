import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import { WORKSPACE_PILL_INACTIVE, WORKSPACE_PILL_SQUARE_BASE } from "@/components/shared/workspace-pill-styles";
import { OVERVIEW_SITEMAP_SOURCE_LABELS, type OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { cn } from "@/lib/utils";

export const CONTENT_PAGINATION_SLOT_CLASS =
  "min-h-0 shrink-0 justify-start gap-2 rounded-none border-0 bg-ui-field p-0 [&_button]:rounded-none";

const CONTENT_CHROME_RESERVE = "invisible pointer-events-none";

/** Matches single-site sitemap menu width when multi-site hides Pages/Posts/SAP. */
export function OverviewContentSitemapMenuReserve() {
  return (
    <div className={cn("flex min-w-0 flex-nowrap items-center gap-1", CONTENT_CHROME_RESERVE)} aria-hidden>
      {(Object.keys(OVERVIEW_SITEMAP_SOURCE_LABELS) as OverviewSitemapSource[]).map((source) => (
        <span
          key={source}
          className={cn(WORKSPACE_PILL_SQUARE_BASE, WORKSPACE_PILL_INACTIVE, "h-8 min-w-[4.5rem]")}
          aria-hidden
        >
          {OVERVIEW_SITEMAP_SOURCE_LABELS[source]}
        </span>
      ))}
    </div>
  );
}

export function OverviewContentPaginationReserve({
  layoutTotalCount,
}: {
  layoutTotalCount: number;
}) {
  return (
    <OverviewGridPagination
      pageIndex={0}
      totalCount={0}
      layoutTotalCount={layoutTotalCount}
      onPageChange={() => {}}
      className={cn(CONTENT_PAGINATION_SLOT_CLASS, CONTENT_CHROME_RESERVE)}
      aria-hidden
    />
  );
}
