import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList, type HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";

export const RESEARCH_HARNESS_SECTION_TITLES = [
  "DataForSEO SERP",
  "GSC CSV",
  "LLM audit",
  "SERP dump load",
  "GSC quick-wins context",
  "Brief merge",
  "Brief upload",
] as const;

export const RESEARCH_HARNESS_TOTAL_SECTIONS = RESEARCH_HARNESS_SECTION_TITLES.length;

/** Filename token emitted by `onResearchArtifact` for each research harness step. */
export const RESEARCH_STEP_ARTIFACT_SLUGS: Partial<
  Record<(typeof RESEARCH_HARNESS_SECTION_TITLES)[number], string>
> = {
  "DataForSEO SERP": "dataforseo-serp",
  "LLM audit": "llm-audit",
  "SERP dump load": "serp-dump-load",
  "GSC quick-wins context": "gsc-quick-wins-context",
};

/** Per-row Generated files pipeline during research (7 harness steps, no blueprint/content). */
export const RESEARCH_HARNESS_PIPELINE_TITLES = RESEARCH_HARNESS_SECTION_TITLES;

export function isResearchHarnessPipelineTitles(
  titles: readonly string[] | undefined,
): boolean {
  if (!titles?.length || titles.length !== RESEARCH_HARNESS_TOTAL_SECTIONS) return false;
  return titles.every((title, index) => title === RESEARCH_HARNESS_SECTION_TITLES[index]);
}

export type PlannedResearchHarnessSection = {
  title: string;
  sectionIndex: number;
};

export function buildPlannedResearchHarnessSections(): PlannedResearchHarnessSection[] {
  return RESEARCH_HARNESS_SECTION_TITLES.map((title, sectionIndex) => ({
    title,
    sectionIndex,
  }));
}

export function buildWaitingResearchHarnessSections(): HarnessSectionListItem[] {
  return buildPlannedResearchHarnessSections().map(({ title, sectionIndex }) => ({
    sectionIndex,
    title,
    status: "waiting" as const,
  }));
}

/** UI-facing waiting row for research batch init (collapsed brief pipeline). */
export function buildWaitingResearchBriefHarnessSections(): HarnessSectionListItem[] {
  return [
    {
      sectionIndex: 0,
      title: RESEARCH_BRIEF_PIPELINE_TITLE,
      status: "waiting" as const,
    },
  ];
}

export function makeResearchHarnessStartPayloads(rowIndex: number): BulkHarnessSectionPayload[] {
  const planned = buildPlannedResearchHarnessSections();
  const totalSections = planned.length;
  return planned.map(({ title, sectionIndex }) => ({
    rowIndex,
    sectionIndex,
    totalSections,
    title,
    phase: "start" as const,
  }));
}

export type ResearchHarnessDoneSummary = Partial<
  Record<(typeof RESEARCH_HARNESS_SECTION_TITLES)[number], string>
>;

export function makeResearchHarnessDonePayloads(
  rowIndex: number,
  summaries?: ResearchHarnessDoneSummary,
): BulkHarnessSectionPayload[] {
  const planned = buildPlannedResearchHarnessSections();
  const totalSections = planned.length;
  return planned.map(({ title, sectionIndex }) => ({
    rowIndex,
    sectionIndex,
    totalSections,
    title,
    phase: "done" as const,
    markdownSlice: summaries?.[title as keyof ResearchHarnessDoneSummary]?.trim() || undefined,
  }));
}

export function buildDoneResearchHarnessSections(
  rowIndex: number,
  summaries?: ResearchHarnessDoneSummary,
): HarnessSectionListItem[] {
  let sections: HarnessSectionListItem[] = [];
  for (const payload of [
    ...makeResearchHarnessStartPayloads(rowIndex),
    ...makeResearchHarnessDonePayloads(rowIndex, summaries),
  ]) {
    sections = reduceHarnessSectionList(sections, payload);
  }
  return sections;
}

export const RESEARCH_BRIEF_PIPELINE_TITLE = "SERP research brief";
export const RESEARCH_BRIEF_PIPELINE_TITLES = [RESEARCH_BRIEF_PIPELINE_TITLE] as const;

function sanitizeResearchFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "section";
}

export function researchBriefGeneratedFile(
  keyword: string,
  briefJson: string | undefined,
): Array<{ name: string; content: string; mimeType: string }> {
  const brief = briefJson?.trim() ?? "";
  if (!brief) return [];
  const slug = sanitizeResearchFilePart(keyword) || "brief";
  return [
    {
      name: `serp-research-brief-${slug}.json`,
      content: brief,
      mimeType: "application/json;charset=utf-8",
    },
  ];
}

export type ResearchStepArtifact = { name: string; content: string; mimeType: string };

export function researchStepArtifactFile(
  title: (typeof RESEARCH_HARNESS_SECTION_TITLES)[number],
  summary: string | undefined,
  keyword?: string,
): ResearchStepArtifact | null {
  const text = summary?.trim();
  if (!text) return null;
  switch (title) {
    case "DataForSEO SERP":
    case "GSC CSV":
    case "LLM audit":
    case "SERP dump load":
    case "GSC quick-wins context":
    case "Brief merge":
    case "Brief upload":
      return null;
  }
  return null;
}

function mergeGeneratedFilesByName(
  existing: Array<{ name: string; content: string; mimeType: string }>,
  incoming: { name: string; content: string; mimeType: string },
): Array<{ name: string; content: string; mimeType: string }> {
  const without = existing.filter((f) => f.name !== incoming.name);
  return [...without, incoming];
}

export function appendResearchGeneratedFile(
  existing: Array<{ name: string; content: string; mimeType: string }> | undefined,
  file: { name: string; content: string; mimeType: string },
): Array<{ name: string; content: string; mimeType: string }> {
  return mergeGeneratedFilesByName(existing ?? [], file);
}

export function collapseResearchHarnessToBrief(
  sections: HarnessSectionListItem[],
): HarnessSectionListItem[] {
  if (sections.length === 1 && sections[0]?.title === RESEARCH_BRIEF_PIPELINE_TITLE) {
    return [{ ...sections[0]!, markdown: undefined }];
  }
  const generating = sections.some((s) => s.status === "generating");
  const anyDone = sections.some((s) => s.status === "done");
  const anyWaiting = sections.some((s) => s.status === "waiting") || sections.length === 0;
  let status: HarnessSectionListItem["status"] = "waiting";
  if (generating || (anyDone && anyWaiting)) status = "generating";
  else if (sections.length > 0 && sections.every((s) => s.status === "done")) status = "done";
  return [
    {
      sectionIndex: 0,
      title: RESEARCH_BRIEF_PIPELINE_TITLE,
      status,
    },
  ];
}
