/**
 * Resolve dedicated SEO meta text from NEO Pulse Fields / ACF (not prompt_modifier).
 * Overview scrape uses WordPress excerpt for meta; this is for explicit meta_description fields only.
 */
export function postFieldsMetaDescriptionLine(acf: Record<string, unknown> | null | undefined): string {
  if (!acf || typeof acf !== "object") return "";
  const keys = ["meta_description", "seo_meta_description"];
  for (const k of keys) {
    const v = acf[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
