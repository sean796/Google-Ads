export type ContentOptimizerSectionId = "content" | "multi-site";

export const CONTENT_OPTIMIZER_SECTION_STORAGE_KEY = "neo-pulse-content-optimizer-section";

export function readStoredContentOptimizerSection(): ContentOptimizerSectionId {
  return "content";
}

export function writeStoredContentOptimizerSection(section: ContentOptimizerSectionId): void {
  try {
    sessionStorage.setItem(CONTENT_OPTIMIZER_SECTION_STORAGE_KEY, section);
  } catch {
    /* ignore */
  }
}
