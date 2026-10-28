export type ResearchSectionId = "research-proposal";

export const RESEARCH_SECTION_STORAGE_KEY = "neo-pulse-research-section";

export function readStoredResearchSection(): ResearchSectionId {
  return "research-proposal";
}

export function writeStoredResearchSection(_section: ResearchSectionId): void {
  try {
    sessionStorage.setItem(RESEARCH_SECTION_STORAGE_KEY, "research-proposal");
  } catch {
    /* ignore */
  }
}
