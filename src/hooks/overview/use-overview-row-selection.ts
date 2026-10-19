import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  applyOverviewPageSelection,
  applyOverviewRangeSelection,
  overviewDisplayRowSelectionKeys,
  overviewPageSelectionState,
  overviewRowSelectionKey,
  pruneOverviewRowSelection,
  toggleOverviewRowSelectionKey,
} from "@/lib/overview/overview-row-selection";

export function useOverviewRowSelection({
  siteId,
  sitemapSource,
  displayRows,
}: {
  siteId: string | undefined;
  sitemapSource: OverviewSitemapSource;
  displayRows: readonly { url: string }[];
}) {
  const [selectedUrlKeys, setSelectedUrlKeys] = useState<Set<string>>(() => new Set());
  const lastAnchorKeyRef = useRef<string | null>(null);

  const displayKeys = useMemo(() => overviewDisplayRowSelectionKeys(displayRows), [displayRows]);
  const displayKeySet = useMemo(() => new Set(displayKeys), [displayKeys]);

  useEffect(() => {
    lastAnchorKeyRef.current = null;
    setSelectedUrlKeys(new Set());
  }, [siteId, sitemapSource]);

  useEffect(() => {
    setSelectedUrlKeys((prev) => pruneOverviewRowSelection(prev, displayKeySet));
  }, [displayKeySet]);

  const toggleSelectedUrlKey = useCallback(
    (url: string, shiftKey = false, orderedKeys?: readonly string[]) => {
      const key = overviewRowSelectionKey(url);
      if (!key) return;
      const keysForRange = orderedKeys?.length ? orderedKeys : displayKeys;
      if (shiftKey && lastAnchorKeyRef.current) {
        const fromKey = lastAnchorKeyRef.current;
        setSelectedUrlKeys((prev) => applyOverviewRangeSelection(prev, keysForRange, fromKey, key));
        return;
      }
      lastAnchorKeyRef.current = key;
      setSelectedUrlKeys((prev) => toggleOverviewRowSelectionKey(prev, url));
    },
    [displayKeys],
  );

  const toggleSelectPageRows = useCallback((pageRows: readonly { url: string }[]) => {
    const pageKeys = overviewDisplayRowSelectionKeys(pageRows);
    setSelectedUrlKeys((prev) => {
      const { allSelected } = overviewPageSelectionState(prev, pageKeys);
      return applyOverviewPageSelection(prev, pageKeys, !allSelected);
    });
  }, []);

  return {
    selectedUrlKeys,
    selectedCount: selectedUrlKeys.size,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
  };
}
