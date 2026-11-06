import { useEffect, useMemo, useRef, useState } from "react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { metaDisplayTitle } from "@/lib/overview/overview-tab-display";
import { resolveOverviewGridPaginationLayoutTotal } from "@/lib/overview/overview-grid-pagination-layout-total";
import { overviewRowIndexMatchesSemrushFilter } from "@/lib/overview/parse-semrush-error-csv";
import {
  overviewRowMatchesErrorFilters,
  type OverviewRowErrorFilterKey,
} from "@/lib/overview/overview-row-error-filters";
import { useOverviewRowSelection } from "@/hooks/overview/use-overview-row-selection";
import { resolveOverviewBulkScopeUrlKeys } from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { WordPressSite } from "@/components/integrations/types";
import type { useOverviewWordPressBinding } from "@/hooks/overview/use-overview-wordpress-binding";

export function useOverviewTabDisplayRows({
  rows,
  semrushFilterUrlKeys,
  activeErrorFilters,
  wpTitlesByUrl,
  site,
  sitemapSource,
  studioRowSource,
  setExpandedPageUrl,
}: {
  rows: OverviewRow[];
  semrushFilterUrlKeys: Set<string> | null;
  activeErrorFilters: Set<OverviewRowErrorFilterKey>;
  wpTitlesByUrl: ReturnType<typeof useOverviewWordPressBinding>["wpTitlesByUrl"];
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  studioRowSource: "sitemap" | "bulk-generator" | undefined;
  setExpandedPageUrl: (next: string | null) => void;
}) {
  const [sortColumn, setSortColumn] = useState<"title" | "date" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [gridPageIndex, setGridPageIndex] = useState(0);
  const visibleRows = rows;

  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;

  const displayRows = useMemo(() => {
    let base = visibleRows.filter((row) => Boolean(row.url?.trim()));
    if (semrushFilterUrlKeys) {
      base = base.filter((row) =>
        overviewRowIndexMatchesSemrushFilter(row.url, semrushFilterUrlKeys),
      );
    }
    if (activeErrorFilters.size > 0) {
      base = base.filter((row) => overviewRowMatchesErrorFilters(row, activeErrorFilters, visibleRows));
    }
    if (!sortColumn) return base;
    const copy = [...base];
    if (sortColumn === "title") {
      copy.sort((a, b) => {
        const c = metaDisplayTitle(a, wpTitlesByUrl).localeCompare(metaDisplayTitle(b, wpTitlesByUrl), undefined, {
          sensitivity: "base",
        });
        return sortDir === "asc" ? c : -c;
      });
    } else {
      copy.sort((a, b) => {
        const ta = a.wpDateGmt?.trim() ? Date.parse(a.wpDateGmt) : 0;
        const tb = b.wpDateGmt?.trim() ? Date.parse(b.wpDateGmt) : 0;
        const aVal = Number.isNaN(ta) ? 0 : ta;
        const bVal = Number.isNaN(tb) ? 0 : tb;
        const c = aVal - bVal;
        return sortDir === "asc" ? c : -c;
      });
    }
    return copy;
  }, [visibleRows, semrushFilterUrlKeys, activeErrorFilters, sortColumn, sortDir, wpTitlesByUrl]);

  const {
    selectedUrlKeys,
    selectedCount,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
  } = useOverviewRowSelection({
    siteId: site?.id,
    sitemapSource,
    displayRows,
  });
  const bulkScopeUrlKeys = useMemo(
    () => resolveOverviewBulkScopeUrlKeys(selectedUrlKeys, displayRows),
    [selectedUrlKeys, displayRows],
  );
  const bulkScopeUrlKeysRef = useRef(bulkScopeUrlKeys);
  bulkScopeUrlKeysRef.current = bulkScopeUrlKeys;

  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;

  useEffect(() => {
    setGridPageIndex(0);
  }, [sitemapSource, site?.id, displayRows.length, semrushFilterUrlKeys, activeErrorFilters]);

  useEffect(() => {
    if (studioRowSource === "bulk-generator") return;
    setExpandedPageUrl(null);
  }, [site?.id, sitemapSource, gridPageIndex, studioRowSource, setExpandedPageUrl]);

  const gridPaginationLayoutTotal = useMemo(() => {
    if (!site?.id) return displayRows.length;
    return resolveOverviewGridPaginationLayoutTotal([site.id], displayRows.length);
  }, [site?.id, displayRows.length]);

  return {
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    gridPageIndex,
    setGridPageIndex,
    visibleRows,
    visibleRowsRef,
    displayRows,
    displayRowsRef,
    selectedUrlKeys,
    selectedCount,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
    bulkScopeUrlKeys,
    bulkScopeUrlKeysRef,
    gridPaginationLayoutTotal,
  };
}
