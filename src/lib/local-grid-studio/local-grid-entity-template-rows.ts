/** Shared validation for Local Grid entity row count input. */

export function parseLocalGridEntityRowCount(count: number): number {
  const parsedTotal = Math.floor(count);
  if (!Number.isFinite(parsedTotal) || parsedTotal < 1) {
    throw new Error("Enter a valid entity row count (1–45).");
  }
  return Math.min(45, parsedTotal);
}
