import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  buildOverviewBulkSeoItem,
  normalizeOverviewBindingSubtype,
  type OverviewBulkSeoApiItem,
} from "@/lib/overview/overview-bulk-seo-payload-item";

/** Find binding when the grid URL changed but postId is still known. */
export function findOverviewBindingByPostId(
  bindings: Record<string, OverviewBinding | undefined>,
  postId: number,
): OverviewBinding | undefined {
  for (const binding of Object.values(bindings)) {
    if (binding?.postId === postId) return binding;
  }
  return undefined;
}

/** URL-keyed binding lookup (exact, then normalized key). */
export function overviewBindingFromUrlMap(
  url: string,
  bindings: Record<string, OverviewBinding | undefined>,
): OverviewBinding | undefined {
  const direct = bindings[url];
  if (direct?.postId) return direct;
  const target = normalizePageUrlKey(url);
  if (!target) return undefined;
  const byKey = bindings[target];
  if (byKey?.postId) return byKey;
  for (const [key, binding] of Object.entries(bindings)) {
    if (binding?.postId && normalizePageUrlKey(key) === target) return binding;
  }
  return undefined;
}

/** Binding from URL map, or from row fields after inventory hydrate. */
export function overviewBindingForRow(
  row: OverviewRow,
  bindings: Record<string, OverviewBinding | undefined>,
): OverviewBinding | undefined {
  const direct = overviewBindingFromUrlMap(row.url, bindings);
  if (direct?.postId) return direct;
  const postId = row.postId;
  if (postId != null && Number.isFinite(postId) && postId > 0) {
    const fromMap = findOverviewBindingByPostId(bindings, postId);
    const subtype = normalizeOverviewBindingSubtype(fromMap?.subtype, row.postType);
    return {
      postId,
      subtype,
      date_gmt: fromMap?.date_gmt ?? (row.wpDateGmt?.trim() || undefined),
    };
  }
  return undefined;
}

type InventoryBindingHit = {
  row: { id?: number | null; date_gmt?: string | null };
  subtype: string;
};

/** Grid row + optional cached inventory match; no live REST bind step. */
export function resolveOverviewBindingForRow(
  row: OverviewRow,
  bindings: Record<string, OverviewBinding | undefined>,
  invMatch?: InventoryBindingHit | null,
): OverviewBinding | undefined {
  const fromUrlMap = overviewBindingFromUrlMap(row.url, bindings);
  const fromInv =
    invMatch?.row?.id != null && Number.isFinite(invMatch.row.id) && invMatch.row.id > 0
      ? {
          postId: invMatch.row.id,
          subtype: invMatch.subtype,
          date_gmt: invMatch.row.date_gmt?.trim() || undefined,
        }
      : undefined;

  // URL inventory wins over a stale row.postId / mismatched map entry.
  if (fromInv?.postId) {
    if (fromUrlMap?.postId && fromUrlMap.postId !== fromInv.postId) return fromInv;
    if (
      row.postId != null &&
      Number.isFinite(row.postId) &&
      row.postId > 0 &&
      row.postId !== fromInv.postId
    ) {
      return fromInv;
    }
    if (fromUrlMap?.postId) return fromUrlMap;
    return fromInv;
  }

  if (fromUrlMap?.postId) return fromUrlMap;

  const fromRowFields = overviewBindingForRow(row, bindings);
  if (!fromRowFields?.postId) return undefined;

  // Same postId may still be keyed under a prior URL (canonical permalink sync).
  // Reuse that binding; do not drop the known postId.
  const rowKey = normalizePageUrlKey(row.url);
  for (const [key, binding] of Object.entries(bindings)) {
    if (!binding?.postId || binding.postId !== fromRowFields.postId) continue;
    if (normalizePageUrlKey(key) === rowKey) return fromRowFields;
    return {
      postId: binding.postId,
      subtype: binding.subtype || fromRowFields.subtype,
      date_gmt: binding.date_gmt ?? fromRowFields.date_gmt,
    };
  }
  return fromRowFields;
}

/** Sync payload from in-app grid + bindings (no WP hydrate, no URL resolve). */
export function collectOverviewBulkSeoItemsFromGrid(
  rows: OverviewRow[],
  bindings: Record<string, OverviewBinding | undefined>,
): { items: OverviewBulkSeoApiItem[]; rowIndices: number[] } {
  const items: OverviewBulkSeoApiItem[] = [];
  const rowIndices: number[] = [];
  rows.forEach((row, index) => {
    const binding = overviewBindingForRow(row, bindings);
    if (!binding?.postId) return;
    const item = buildOverviewBulkSeoItem(row, binding);
    if (!item) return;
    items.push(item);
    rowIndices.push(index);
  });
  return { items, rowIndices };
}
