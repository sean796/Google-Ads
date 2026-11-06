import type { CSVRow } from '@/lib/bulk-auto-generate';

export type BuildBulkBaseRowsFailureReason =
  | 'csv_empty'
  | 'prompt_empty'
  | 'selection_empty';

export type BuildBulkBaseRowsResult =
  | { ok: false; reason: BuildBulkBaseRowsFailureReason }
  | {
      ok: true;
      baseRows: CSVRow[];
      /** Parallel to `baseRows` when prompt mode uses a selection; else undefined (CSV or all generated). */
      baseDisplayIndices: number[] | undefined;
      /** Optional toast after successful build (mirrors previous useBulkProcessing behavior). */
      infoMessage?: string;
    };

/**
 * Mirrors bulk row selection in useBulkProcessing / handleStartProcessing (CSV vs prompt, selection vs all).
 */
export function buildBulkBaseRows(
  inputMode: 'csv' | 'prompt',
  rows: CSVRow[],
  generatedRows: CSVRow[],
  selectedBlogIndices: Set<number>
): BuildBulkBaseRowsResult {
  if (inputMode === 'csv') {
    if (rows.length === 0) {
      return { ok: false, reason: 'csv_empty' };
    }
    return { ok: true, baseRows: rows, baseDisplayIndices: undefined };
  }

  if (generatedRows.length === 0) {
    return { ok: false, reason: 'prompt_empty' };
  }

  if (selectedBlogIndices.size > 0) {
    const sorted = Array.from(selectedBlogIndices).sort((a, b) => a - b);
    const baseRows: CSVRow[] = [];
    const baseDisplayIndices: number[] = [];
    for (const idx of sorted) {
      const row = generatedRows[idx];
      if (row) {
        baseRows.push(row);
        baseDisplayIndices.push(idx);
      }
    }
    if (baseRows.length === 0) {
      return { ok: false, reason: 'selection_empty' };
    }
    return {
      ok: true,
      baseRows,
      baseDisplayIndices,
      infoMessage: `Processing ${baseRows.length} selected blog idea${baseRows.length !== 1 ? 's' : ''}`,
    };
  }

  return {
    ok: true,
    baseRows: generatedRows,
    baseDisplayIndices: undefined,
    infoMessage: 'No selection made, processing all blog ideas',
  };
}

/** `rowOrder[i]` = source index into `baseRows` for processing slot `i` (permutation of 0..n-1). */
export function applyRowOrder(
  baseRows: CSVRow[],
  baseDisplayIndices: number[] | undefined,
  rowOrder: number[]
): { orderedRows: CSVRow[]; orderedDisplayIndices: number[] | undefined } {
  const n = baseRows.length;
  if (rowOrder.length !== n) {
    const identity = Array.from({ length: n }, (_, i) => i);
    return applyRowOrder(baseRows, baseDisplayIndices, identity);
  }
  const orderedRows = rowOrder.map((i) => baseRows[i]);
  const orderedDisplayIndices = baseDisplayIndices
    ? rowOrder.map((i) => baseDisplayIndices[i])
    : undefined;
  return { orderedRows, orderedDisplayIndices };
}

export function identityRowOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function allRowIndicesSet(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, i) => i));
}

export function createPlaceholderBlogIdeaRows(count: number): CSVRow[] {
  return Array.from({ length: count }, () => ({ keyword: "", title: "" }));
}

/** Fisher–Yates shuffle of indices 0..n-1. */
export function shuffleRowOrder(n: number): number[] {
  const a = identityRowOrder(n);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
