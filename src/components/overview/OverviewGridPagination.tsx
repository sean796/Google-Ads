import React from "react";
import { cn } from "@/lib/utils";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageCount,
} from "@/lib/content-optimizer/content-optimizer-bulk-page-size";
import { Button } from "@/ui";

type Props = {
  pageIndex: number;
  totalCount: number;
  /** Widest row total across sources; reserves count + page button width. */
  layoutTotalCount?: number;
  pageSize?: number;
  onPageChange: (pageIndex: number) => void;
  className?: string;
};

/** Min `ch` width for the `end/total` label at a given layout total. */
export function overviewGridCountLabelMinCh(layoutTotal: number): number {
  if (layoutTotal <= 0) return 3;
  return String(layoutTotal).length * 2 + 1;
}

/** Numbered page controls for Overview grid (100 rows per page; always visible to avoid layout shift). */
export function OverviewGridPagination({
  pageIndex,
  totalCount,
  layoutTotalCount,
  pageSize = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  onPageChange,
  className,
}: Props) {
  const layoutTotal = Math.max(totalCount, layoutTotalCount ?? 0);
  const pageCount = Math.max(1, contentOptimizerBulkPageCount(totalCount));
  const layoutPageCount = Math.max(1, contentOptimizerBulkPageCount(layoutTotal));
  const safePageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const end = totalCount > 0 ? Math.min((safePageIndex + 1) * pageSize, totalCount) : 0;
  const countMinCh = overviewGridCountLabelMinCh(layoutTotal);

  return (
    <nav
      aria-label={`Overview grid pagination, ${end} of ${totalCount} rows`}
      className={cn(
        "flex min-h-11 flex-wrap items-center justify-start gap-2 rounded-none border border-border bg-ui-field px-3 py-2",
        className,
      )}
    >
      <span
        className="inline-block shrink-0 text-left text-base tabular-nums text-muted-foreground"
        style={{ minWidth: `${countMinCh}ch` }}
      >
        <span className="text-foreground">{end}</span>/<span className="text-foreground">{totalCount}</span>
      </span>
      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        {Array.from({ length: layoutPageCount }, (_, i) => {
          const pageButtonClass =
            "h-8 min-w-[2.5rem] rounded-none px-2 text-base tabular-nums";
          if (i >= pageCount) {
            return (
              <Button
                key={`page-slot-${i}`}
                type="button"
                aria-hidden
                tabIndex={-1}
              >
                {i + 1}
              </Button>
            );
          }
          return (
            <Button
              pressed={i === safePageIndex}
              key={i}
              type="button"
              aria-current={i === safePageIndex ? "page" : undefined}
              onClick={() => onPageChange(i)}
            >
              {i + 1}
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

export function overviewGridPageSlice<T>(
  items: T[],
  pageIndex: number,
  pageSize: number = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
): T[] {
  if (items.length <= 0) return items;
  const start = pageIndex * pageSize;
  return items.slice(start, start + pageSize);
}
