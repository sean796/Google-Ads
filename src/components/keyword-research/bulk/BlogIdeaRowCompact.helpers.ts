import type { CSSProperties, SyntheticEvent } from "react";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import { BULK_GENERATOR_ROW_GRID_MIN_CLASS } from "@/components/keyword-research/blog-generator-tab-classes";
import { cn } from "@/lib/utils";

export const EXPANDED_FIELD_LABEL = "w-[5.75rem] shrink-0 sm:w-[6.5rem]";

/** Left select | title (1fr) | keyword (1fr) | expand. */
export const BLOG_IDEA_ROW_GRID_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
/** Left select | title | keyword | publish date | expand. */
export const BLOG_IDEA_ROW_GRID_WITH_DATE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
export const BLOG_IDEA_ROW_SLOT_GRID_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
export const BLOG_IDEA_ROW_GRID_NO_SELECT_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
export const BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
export const BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DATE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);
export const BLOG_IDEA_ROW_GRID_NO_SELECT_WITH_DEST_DATE_CLASS = cn(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(7.5rem,0.7fr)_minmax(7.5rem,0.7fr)_minmax(4.75rem,auto)] items-center gap-x-2 sm:gap-x-3",
  BULK_GENERATOR_ROW_GRID_MIN_CLASS,
);

export const BLOG_IDEA_ROW_SELECT_CELL = "flex shrink-0 items-center justify-center pl-0.5";

export const BLOG_IDEA_ROW_EXPAND_CELL =
  "flex shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-2";

export type BlogIdeaRowDragProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
  handleProps?: Record<string, unknown>;
  handleDisabled?: boolean;
};

export type BlogIdeaRow = CSVRow & { decision_audit_json?: string };

export function sapUrlPathFromRow(row: CSVRow): string {
  const locked = row.target_slug?.trim().replace(/^\/+|\/+$/g, "");
  if (locked) return `/${locked}/`;
  const entity = row.entity?.trim();
  if (entity && entity !== "N/A") {
    const slug = buildSapSlugFromKeywordEntity(row.keyword ?? "", entity);
    return slug ? `/${slug}/` : "";
  }
  return "";
}

export function previewPathLabel(previewUrl: string, row: CSVRow): string {
  try {
    const path = new URL(previewUrl).pathname;
    if (path && path !== "/") return path.endsWith("/") ? path : `${path}/`;
  } catch {
    /* keep computed path */
  }
  return sapUrlPathFromRow(row) || previewUrl;
}

export function publishDisplayValue(
  _row: CSVRow,
  publishDateLabel?: string,
  draftOnly = false,
): string {
  if (draftOnly) return "Draft";
  const label = publishDateLabel?.trim();
  if (label) return label;
  return "";
}

export function featuredImageSelectValue(row: CSVRow): "y" | "n" | "google-maps" {
  if (row.featuredImage === "n") return "n";
  if (row.featuredImage === "google-maps") return "google-maps";
  return "y";
}

export function stopFieldBubble(e: SyntheticEvent) {
  e.stopPropagation();
}

export function modifierFromInput(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

export function modifierFromBlur(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}
