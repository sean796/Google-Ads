import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export function overviewRowSelectionKey(url: string): string {
  return normalizePageUrlKey(url);
}

export function overviewDisplayRowSelectionKeys(rows: readonly { url: string }[]): string[] {
  const keys: string[] = [];
  for (const row of rows) {
    const key = overviewRowSelectionKey(row.url);
    if (key) keys.push(key);
  }
  return keys;
}

export function toggleOverviewRowSelectionKey(selected: Set<string>, url: string): Set<string> {
  const key = overviewRowSelectionKey(url);
  if (!key) return selected;
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function pruneOverviewRowSelection(
  selected: Set<string>,
  liveKeys: ReadonlySet<string>,
): Set<string> {
  let changed = false;
  const next = new Set<string>();
  for (const key of selected) {
    if (liveKeys.has(key)) next.add(key);
    else changed = true;
  }
  return changed ? next : selected;
}

export function overviewPageSelectionState(
  selected: Set<string> | undefined,
  pageKeys: readonly string[],
): { allSelected: boolean; someSelected: boolean } {
  if (!selected || pageKeys.length === 0) return { allSelected: false, someSelected: false };
  let selectedCount = 0;
  for (const key of pageKeys) {
    if (selected.has(key)) selectedCount += 1;
  }
  return {
    allSelected: selectedCount === pageKeys.length,
    someSelected: selectedCount > 0 && selectedCount < pageKeys.length,
  };
}

/** Inclusive range from `fromKey` to `toKey` in display order. Sets those keys to the target state of `toKey`. */
export function applyOverviewRangeSelection(
  selected: Set<string>,
  displayKeys: readonly string[],
  fromKey: string,
  toKey: string,
): Set<string> {
  const from = displayKeys.indexOf(fromKey);
  const to = displayKeys.indexOf(toKey);
  if (from < 0 || to < 0) return toggleOverviewRowSelectionKey(selected, toKey);
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const shouldSelect = !selected.has(toKey);
  const next = new Set(selected);
  for (let i = start; i <= end; i += 1) {
    const key = displayKeys[i];
    if (!key) continue;
    if (shouldSelect) next.add(key);
    else next.delete(key);
  }
  return next;
}

export function applyOverviewPageSelection(
  selected: Set<string>,
  pageKeys: readonly string[],
  selectAll: boolean,
): Set<string> {
  const next = new Set(selected);
  if (selectAll) {
    for (const key of pageKeys) next.add(key);
  } else {
    for (const key of pageKeys) next.delete(key);
  }
  return next;
}
