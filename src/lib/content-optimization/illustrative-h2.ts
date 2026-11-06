/** Stock label some drafts used. Never pin this onto a section. */
export const ILLUSTRATIVE_DEFAULT_H2 = "A Local Homeowner Example";

export function isBadIllustrativeH2Title(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (/^section\s+\d+$/i.test(t) || t === "section") return true;
  if (/realistic local|local situation|local scenario/.test(t)) return true;
  if (/^scenario\s*:/.test(t)) return true;
  if (t.includes("?")) return true;
  if (/<a\b/i.test(title)) return true;
  return false;
}

/** Return the planner title as written. Never substitute a stock H2. */
export function resolveIllustrativeH2Title(title?: string): string {
  return title?.trim() ?? "";
}

/** Replace the H2 title prefix on a numbered checklist row; keep feature markers. */
export function replaceChecklistItemHeading(item: string, newTitle: string): string {
  const num = item.match(/^(\d+\.\s*)/)?.[1] ?? "";
  const markerStart = item.search(
    /\[(?:STRUCTURE|ILLUSTRATIVE|BLOCKQUOTE|LINK|TABLE|LIST|DECISION|TRADEOFF|RECOMMENDATION|NUMBERS|REAL-WORLD)/i,
  );
  const suffix = markerStart >= 0 ? item.slice(markerStart) : "";
  return `${num}${newTitle} ${suffix}`.replace(/\s{2,}/g, " ").trim();
}

/** Strip [ILLUSTRATIVE] / [BLOCKQUOTE] markers from non-illustrative SAP checklist rows. */
export function stripIllustrativeMarkersFromChecklistItem(item: string): string {
  return item
    .replace(/\s*\[ILLUSTRATIVE\][^[]*(?=\[|$)/gi, "")
    .replace(/\s*\[BLOCKQUOTE\][^[]*(?=\[|$)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Keep the planner H2. Do not rewrite titles. */
export function rewriteIllustrativeChecklistItemHeading(
  item: string,
  _index?: number,
  _sapEntity?: string,
): string {
  return item;
}
