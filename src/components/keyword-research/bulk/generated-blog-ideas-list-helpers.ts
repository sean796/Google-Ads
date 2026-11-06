import type { CSVRow } from "@/lib/bulk-auto-generate";

export type GeneratedBlogIdeaListItem = {
  generatedIdx: number;
  row: CSVRow;
  slotIdx: number;
  publishLabel?: string;
  sortableId: string;
  placeholder?: boolean;
};

/** Pad real rows with zebra placeholder stripes up to targetCount (Prompt workspace BG). */
export function padListWithPlaceholders(
  items: GeneratedBlogIdeaListItem[],
  targetCount: number,
): GeneratedBlogIdeaListItem[] {
  if (targetCount <= 0 || items.length >= targetCount) {
    return items;
  }
  const padded = [...items];
  for (let slotIdx = items.length; slotIdx < targetCount; slotIdx++) {
    padded.push({
      generatedIdx: -1,
      row: { keyword: "", title: "" },
      slotIdx,
      sortableId: `placeholder-${slotIdx}`,
      placeholder: true,
    });
  }
  return padded;
}
