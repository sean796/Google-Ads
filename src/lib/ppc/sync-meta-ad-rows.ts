import { createIdleMetaAdRow, type MetaAdColorPalette, type MetaAdRow } from "@/lib/ppc/meta-ads-types";

export function syncMetaAdRowsToCount(
  rows: MetaAdRow[],
  targetCount: number,
  defaultColorPalette?: MetaAdColorPalette,
): MetaAdRow[] {
  const next = [...rows];

  while (next.length < targetCount) {
    next.push({
      ...createIdleMetaAdRow(),
      colorPalette: defaultColorPalette ? { ...defaultColorPalette } : undefined,
    });
  }

  while (next.length > targetCount) {
    const last = next[next.length - 1];
    if (last?.status === "idle" && !last.copy && !last.creative) {
      next.pop();
    } else {
      break;
    }
  }

  return next;
}
