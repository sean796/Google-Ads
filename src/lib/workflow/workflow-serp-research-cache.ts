import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import { slugifyFocusKeywordToRelativePath } from "@/lib/pulse-redirect-redirect-csv";
import type { WorkflowStepOutput, WorkflowStepOutputFileRef } from "@/lib/workflow/workflow-types";
import { fetchAppApiText } from "@/lib/proxy-fetch-text";

export type WorkflowSerpResearchBriefPayload = SeoContentBriefV1 & {
  serpStoredFile?: string | null;
};

export function serpResearchKeywordSlug(keyword: string): string {
  const slug = slugifyFocusKeywordToRelativePath(keyword.trim());
  return slug?.replace(/^\/+|\/+$/g, "") || "keyword";
}

export function serpResearchBriefArtifactName(keyword: string): string {
  return `serp-research-brief-${serpResearchKeywordSlug(keyword)}.json`;
}

export function normalizeSerpResearchKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

function isSerpResearchArtifactName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("serp-research-brief")
    || lower.includes("seo_research_brief")
    || lower.includes("seo-research-brief")
  );
}

function fileNameMatchesKeyword(fileName: string, keyword: string): boolean {
  const slug = serpResearchKeywordSlug(keyword);
  if (!slug) return false;
  return fileName.toLowerCase().includes(slug);
}

export function collectWorkflowSerpResearchFileRefs(
  outputs: WorkflowStepOutput[],
): WorkflowStepOutputFileRef[] {
  const refs: WorkflowStepOutputFileRef[] = [];
  for (const output of outputs) {
    for (const ref of output.fileRefs ?? []) {
      if (isSerpResearchArtifactName(ref.name)) refs.push(ref);
    }
  }
  return refs;
}

export function findWorkflowSerpResearchFileRef(
  outputs: WorkflowStepOutput[],
  keyword: string,
): WorkflowStepOutputFileRef | undefined {
  const kw = keyword.trim();
  if (!kw) return undefined;
  return [...collectWorkflowSerpResearchFileRefs(outputs)]
    .reverse()
    .find((ref) => fileNameMatchesKeyword(ref.name, kw));
}

export async function loadWorkflowSerpResearchBrief(
  outputs: WorkflowStepOutput[],
  keyword: string,
): Promise<{ brief: SeoContentBriefV1; storedFile: string | null; sourceUrl: string } | null> {
  const ref = findWorkflowSerpResearchFileRef(outputs, keyword);
  if (!ref?.url?.trim()) return null;
  try {
    const text = await fetchAppApiText(ref.url);
    const parsed = JSON.parse(text) as WorkflowSerpResearchBriefPayload;
    if (!parsed?.focusKeyword?.trim()) return null;
    const storedFile =
      typeof parsed.serpStoredFile === "string" && parsed.serpStoredFile.trim()
        ? parsed.serpStoredFile.trim()
        : null;
    return { brief: parsed, storedFile, sourceUrl: ref.url };
  } catch {
    return null;
  }
}

export function parseSeoContentBriefFromRow(row: { seo_research?: string }): SeoContentBriefV1 | null {
  const raw = row.seo_research?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SeoContentBriefV1;
    return parsed?.focusKeyword?.trim() ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeWorkflowSerpResearchBrief(
  brief: SeoContentBriefV1,
  storedFile: string | null,
): string {
  const payload: WorkflowSerpResearchBriefPayload = {
    ...brief,
    serpStoredFile: storedFile,
  };
  return JSON.stringify(payload, null, 2);
}
