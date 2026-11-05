import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";

export const PROMPT_BLOG_SLOT_COUNT_MIN = 0;

export function normalizePromptBlogSlotCount(n: number): number {
  if (!Number.isFinite(n)) return PROMPT_BLOG_SLOT_COUNT_MIN;
  return Math.max(PROMPT_BLOG_SLOT_COUNT_MIN, Math.round(n));
}

export function emptyPromptBlogSlot(): CSVRow {
  return { keyword: "", title: "" };
}

/** Pad or trim prompt blog slot rows to match count; preserve keyword/modifier/title on surviving indices. */
export function syncPromptBlogRowsToCount(rows: CSVRow[], count: number): CSVRow[] {
  const target = normalizePromptBlogSlotCount(count);
  const next = rows.slice(0, target).map((row) => ({
    ...emptyPromptBlogSlot(),
    ...row,
    keyword: row.keyword ?? "",
    title: row.title ?? "",
  }));
  while (next.length < target) {
    next.push(emptyPromptBlogSlot());
  }
  return next;
}

export function seedPromptBlogSlots(count: number): CSVRow[] {
  return syncPromptBlogRowsToCount([], count);
}
