import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import {
  CONTENT_PREP_BATCH_SECTION_TITLES,
  CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES,
} from "@/lib/overview/overview-content-prep-harness-sections";
import {
  CONTENT_OPTIMIZE_PIPELINE_PREFIX,
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
  GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES,
  GOOGLE_IMAGE_PIPELINE_TITLE,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  RESEARCH_HARNESS_SECTION_TITLES,
  researchBriefGeneratedFile,
} from "@/lib/overview/overview-research-harness-sections";
export type BulkDetailsDownloadable = { name: string; content: string; mimeType: string };

const ARTIFACT_ONLY_PIPELINE_TITLES = new Set<string>([
  GOOGLE_IMAGE_PIPELINE_TITLE,
  "Keyword research",
  "Selected keyword",
  "SERP research brief",
  ...CONTENT_OPTIMIZE_PIPELINE_PREFIX,
  "Post content",
  "Content Markdown",
  "Implementation report",
  "WordPress upload",
  "OpenRouter Image",
]);

export function isArtifactOnlyPipelineTitle(title: string): boolean {
  return ARTIFACT_ONLY_PIPELINE_TITLES.has(title.trim());
}

const PIPELINE_HARNESS_TITLES = new Set<string>([
  ...CONTENT_PREP_BATCH_SECTION_TITLES,
  ...CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES,
  ...CONTENT_OPTIMIZE_PIPELINE_TITLES,
  ...GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES,
  ...RESEARCH_HARNESS_SECTION_TITLES,
]);

export function filterPipelineHarnessSections(
  sections: BulkHarnessSectionUi[],
  pipelineSectionTitles?: readonly string[],
): BulkHarnessSectionUi[] {
  if (pipelineSectionTitles?.length) {
    const allowed = new Set(pipelineSectionTitles);
    return sections.filter((section) => allowed.has(section.title));
  }
  return sections.filter((s) => PIPELINE_HARNESS_TITLES.has(s.title));
}

export function isSerpPipelineSection(section: BulkHarnessSectionUi): boolean {
  const title = section.title.trim().toLowerCase();
  return title.includes("serp") || title.includes("research brief");
}

export function isSerpBriefGeneratedFileName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("serp-research-brief") ||
    n.includes("seo-research-brief") ||
    n.includes("seo_research_brief") ||
    n.includes("acf-seo-research") ||
    n.startsWith("seo-research-")
  );
}

export function resolveSerpBriefDownloadable(
  keyword: string,
  displayFiles: BulkDetailsDownloadable[],
  overviewBriefJson?: string | null,
): BulkDetailsDownloadable | null {
  const fromFiles = displayFiles.find((file) => isSerpBriefGeneratedFileName(file.name)) ?? null;
  if (fromFiles) return fromFiles;
  const fromOverview = researchBriefGeneratedFile(keyword, overviewBriefJson ?? undefined)[0];
  return fromOverview ?? null;
}

/** Details drawer: first content-optimize pipeline row (SERP research brief). */
export const DETAILS_DRAWER_PIPELINE_TITLE = CONTENT_OPTIMIZE_PIPELINE_TITLES[0];
export function sanitizeHarnessFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "section";
}
