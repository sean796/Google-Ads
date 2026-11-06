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
  buildWaitingContentOptimizeHarnessSections,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  RESEARCH_HARNESS_SECTION_TITLES,
  RESEARCH_STEP_ARTIFACT_SLUGS,
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

function sanitizeHarnessSectionForDrawer(section: BulkHarnessSectionUi): BulkHarnessSectionUi {
  if (section.status === "done") {
    return section;
  }
  return { ...section, markdown: undefined };
}

function pipelineSectionDoneFromArtifactFile(
  title: string,
  files: BulkDetailsDownloadable[] | undefined,
): boolean {
  if (!files?.length) return false;
  return Boolean(
    linkPipelineSectionToGeneratedFile({ sectionIndex: 0, title, status: "waiting" }, files),
  );
}

export function resolveDetailsPipelineSections(
  persisted: BulkHarnessSectionUi[] | undefined,
  live: BulkHarnessSectionUi[] | undefined,
  pipelineSectionTitles?: readonly string[],
  files?: BulkDetailsDownloadable[],
): BulkHarnessSectionUi[] {
  if (pipelineSectionTitles?.length) {
    const statusByTitle = new Map<string, BulkHarnessSectionUi>();
    for (const section of [...(persisted ?? []), ...(live ?? [])]) {
      const title = section.title?.trim();
      if (title) statusByTitle.set(title, section);
    }
    return pipelineSectionTitles.map((title, sectionIndex) => {
      const patch = statusByTitle.get(title);
      if (pipelineSectionDoneFromArtifactFile(title, files)) {
        return { sectionIndex, title, status: "done" as const };
      }
      if (patch && patch.status !== "waiting") {
        return sanitizeHarnessSectionForDrawer({ ...patch, sectionIndex, title });
      }
      const placeholder: BulkHarnessSectionUi = patch ?? {
        sectionIndex,
        title,
        status: "waiting" as const,
      };
      return placeholder;
    });
  }

  const harnessOnly = [...(persisted ?? []), ...(live ?? [])].filter(
    (section) => section.title?.trim(),
  );
  if (harnessOnly.length > 0) {
    const byTitle = new Map<string, BulkHarnessSectionUi>();
    for (const section of harnessOnly) {
      const title = section.title!.trim();
      byTitle.set(title, section);
    }
    return [...byTitle.values()].map((section, sectionIndex) =>
      sanitizeHarnessSectionForDrawer({ ...section, sectionIndex }),
    );
  }

  const waiting = buildWaitingContentOptimizeHarnessSections();
  const statusByTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of [...(persisted ?? []), ...(live ?? [])]) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return waiting.map((section) => {
    const patch = statusByTitle.get(section.title);
    if (!patch) return section;
    return {
      ...section,
      status: patch.status,
      markdown: patch.markdown ?? section.markdown,
      truncated: patch.truncated ?? section.truncated,
    };
  });
}

export function sanitizeHarnessFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "section";
}

export function harnessSectionToDownloadable(
  section: BulkHarnessSectionUi,
  orderIndex: number,
): BulkDetailsDownloadable | null {
  if (section.status !== "done") return null;
  const markdown = section.markdown?.trim();
  if (!markdown) return null;

  const base = `${orderIndex + 1}-${sanitizeHarnessFilenamePart(section.title || "section")}`;
  const jsonMatch = markdown.match(/^```json\n([\s\S]*)\n```$/);
  if (jsonMatch) {
    return { name: `${base}.json`, content: jsonMatch[1], mimeType: "application/json;charset=utf-8" };
  }
  const csvMatch = markdown.match(/^```csv\n([\s\S]*)\n```$/);
  if (csvMatch) {
    return { name: `${base}.csv`, content: csvMatch[1], mimeType: "text/csv;charset=utf-8" };
  }
  const looksHtml = markdown.startsWith("<") && /<\/(p|h2|h3|div|ul|ol|table|blockquote)\b/i.test(markdown);
  if (looksHtml) {
    return { name: `${base}.html`, content: markdown, mimeType: "text/html;charset=utf-8" };
  }
  return { name: `${base}.md`, content: markdown, mimeType: "text/markdown;charset=utf-8" };
}

function linkResearchStepFile(
  section: BulkHarnessSectionUi,
  files: BulkDetailsDownloadable[],
): BulkDetailsDownloadable | null {
  const title = section.title.trim();
  const slug = RESEARCH_STEP_ARTIFACT_SLUGS[title as keyof typeof RESEARCH_STEP_ARTIFACT_SLUGS];
  if (slug) {
    return files.find((file) => file.name.toLowerCase().includes(slug)) ?? null;
  }

  const titleLower = title.toLowerCase();
  if (titleLower.includes("brief merge")) {
    return files.find((file) => isSerpBriefGeneratedFileName(file.name)) ?? null;
  }
  if (titleLower.includes("brief upload")) {
    return (
      files.find(
        (file) => file.name.startsWith("seo_brief__") && file.content.trim().startsWith("{"),
      ) ?? null
    );
  }

  const titlePart = sanitizeHarnessFilenamePart(section.title);
  if (!titlePart) return null;
  const titleNorm = titlePart.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    files.find((file) => {
      if (!file.name.startsWith("research-")) return false;
      const fileNorm = file.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return fileNorm.includes(titleNorm);
    }) ?? null
  );
}

export function linkPipelineSectionToGeneratedFile(
  section: BulkHarnessSectionUi,
  files: BulkDetailsDownloadable[],
): BulkDetailsDownloadable | null {
  const researchLinked = linkResearchStepFile(section, files);
  if (researchLinked) return researchLinked;

  const title = section.title.trim().toLowerCase();
  if (!title) return null;
  if (title === "image requirements") {
    return (
      files.find((file) => file.name.toLowerCase() === "image-requirements.json") ??
      files.find((file) => file.name.toLowerCase().includes("featured-image-checklist")) ??
      null
    );
  }
  if (title === "google image") {
    return (
      files.find((file) => file.name.toLowerCase() === "google-image.png") ??
      files.find((file) => file.name.toLowerCase().includes("-google-maps.")) ??
      files.find(
        (file) =>
          file.mimeType?.startsWith("image/") &&
          !file.name.toLowerCase().includes("featured-image-checklist") &&
          !file.name.toLowerCase().startsWith("openrouter-image."),
      ) ??
      null
    );
  }
  if (title === "openrouter image") {
    return files.find((file) => file.name.toLowerCase().startsWith("openrouter-image.")) ?? null;
  }
  if (title === "keyword research") {
    return files.find((file) => file.name.toLowerCase().startsWith("keyword-research")) ?? null;
  }
  if (title === "selected keyword") {
    return files.find((file) => file.name.toLowerCase().startsWith("selected-keyword")) ?? null;
  }
  if (title === "link targets") {
    return files.find((file) => file.name.toLowerCase().startsWith("link-targets")) ?? null;
  }
  if (title === "brief merge" || title.includes("research brief")) {
    return files.find((file) => isSerpBriefGeneratedFileName(file.name)) ?? null;
  }
  if (title.includes("brief upload")) {
    return (
      files.find(
        (file) => file.name.startsWith("seo_brief__") && file.content.trim().startsWith("{"),
      ) ??
      files.find((file) => isSerpBriefGeneratedFileName(file.name)) ??
      null
    );
  }
  if (title.includes("semrush")) {
    return (
      files.find((file) => file.name.toLowerCase().includes("semrush-enrichment")) ??
      files.find((file) => file.name.toLowerCase().includes("semrush")) ??
      files.find((file) => file.name.includes("Semrush_enrichment")) ??
      null
    );
  }
  if (title.includes("dataforseo")) {
    return (
      files.find((file) => file.name.toLowerCase().includes("dataforseo-serp")) ??
      files.find((file) => file.name.toLowerCase().includes("dataforseo_serp")) ??
      null
    );
  }
  if (title === "serp dump load") {
    return (
      files.find((file) => file.name.toLowerCase().includes("serp-dump-load")) ??
      files.find((file) => file.name.toLowerCase().includes("serp_dump_load")) ??
      null
    );
  }
  if (title.includes("gsc quick-wins")) {
    return (
      files.find((file) => file.name.toLowerCase().includes("gsc-quick-wins-context")) ??
      files.find((file) => file.name.toLowerCase().includes("gsc_quick_wins")) ??
      null
    );
  }
  if (title.includes("gsc")) {
    const slug = sanitizeHarnessFilenamePart(section.title);
    return (
      files.find((file) => file.name.includes(slug)) ??
      files.find((file) => file.name.toLowerCase().includes("gsc")) ??
      null
    );
  }
  if (title.includes("llm")) {
    return (
      files.find((file) => file.name.toLowerCase().includes("llm-audit")) ??
      files.find((file) => file.name.includes("LLM_audit")) ??
      null
    );
  }
  if (title.includes("serp") || title.includes("research brief")) {
    return files.find((file) => isSerpBriefGeneratedFileName(file.name)) ?? null;
  }
  if (title.includes("blueprint")) {
    return files.find((file) => file.name.toLowerCase().startsWith("blueprint")) ?? null;
  }
  if (title.includes("checklist")) {
    return files.find((file) => file.name.toLowerCase().includes("checklist")) ?? null;
  }
  if (title.includes("content html")) {
    return (
      files.find(
        (file) =>
          file.name.toLowerCase().startsWith("content-") && file.name.toLowerCase().endsWith(".html"),
      ) ?? null
    );
  }
  if (title === "post content") {
    return (
      files.find(
        (file) =>
          file.name.toLowerCase().startsWith("content-") && file.name.toLowerCase().endsWith(".html"),
      ) ??
      files.find(
        (file) =>
          file.name.toLowerCase().startsWith("content-") && file.name.toLowerCase().endsWith(".md"),
      ) ??
      null
    );
  }
  if (title.includes("content markdown")) {
    return (
      files.find(
        (file) =>
          file.name.toLowerCase().startsWith("content-") && file.name.toLowerCase().endsWith(".md"),
      ) ?? null
    );
  }
  if (title === "implementation report" || title.includes("implementation report")) {
    return (
      files.find(
        (file) =>
          file.name.toLowerCase().startsWith("implementation-report") &&
          file.name.toLowerCase().endsWith(".md"),
      ) ?? null
    );
  }
  if (title.includes("wordpress upload")) {
    return (
      files.find((file) => file.name === "wordpress.json") ??
      files.find((file) => file.name.startsWith("upload-payload-")) ??
      files.find((file) => file.name.startsWith("wordpress-post-")) ??
      null
    );
  }
  if (title === "case scenario") {
    return files.find((file) => file.name === "scenario.json") ?? null;
  }
  if (title.includes("content")) {
    return (
      files.find((file) => file.name.startsWith("blueprint")) ??
      files.find((file) => file.name.startsWith("content-")) ??
      null
    );
  }
  if (title.includes("sitemap")) {
    return files.find((file) => file.name.includes("sitemap")) ?? null;
  }
  return null;
}

export function isHarnessSectionDownloadReady(section: BulkHarnessSectionUi): boolean {
  if (section.status === "waiting") return false;
  if (section.status === "done") return true;
  return false;
}

export function sectionFallbackDownloadable(
  section: BulkHarnessSectionUi,
  orderIndex: number,
): BulkDetailsDownloadable {
  const title = section.title.trim() || `Section ${orderIndex + 1}`;
  const content = section.markdown?.trim() || title;
  return {
    name: `${orderIndex + 1}-${sanitizeHarnessFilenamePart(title)}.txt`,
    content,
    mimeType: "text/plain;charset=utf-8",
  };
}

export function resolvePipelineSectionDownloadable(
  section: BulkHarnessSectionUi,
  orderIndex: number,
  files: BulkDetailsDownloadable[],
  claimedNames: Set<string>,
  serpBriefDownload?: BulkDetailsDownloadable | null,
  options?: { noFallback?: boolean; researchArtifactsOnly?: boolean; requireDoneStatus?: boolean },
): BulkDetailsDownloadable | null {
  const available = files.filter((file) => !claimedNames.has(file.name));

  if (section.title.trim().toLowerCase() === "google image") {
    const linkedGoogle = linkPipelineSectionToGeneratedFile(section, available);
    if (linkedGoogle) {
      claimedNames.add(linkedGoogle.name);
      return linkedGoogle;
    }
  }

  if (options?.requireDoneStatus && section.status !== "done") {
    const linkedEarly = linkPipelineSectionToGeneratedFile(section, available);
    if (linkedEarly) {
      claimedNames.add(linkedEarly.name);
      return linkedEarly;
    }
    return null;
  }

  if (isSerpPipelineSection(section) && serpBriefDownload && !claimedNames.has(serpBriefDownload.name)) {
    claimedNames.add(serpBriefDownload.name);
    return serpBriefDownload;
  }

  const linked = linkPipelineSectionToGeneratedFile(section, available);
  if (linked) {
    claimedNames.add(linked.name);
    return linked;
  }

  if (
    !options?.researchArtifactsOnly &&
    !(options?.noFallback && isArtifactOnlyPipelineTitle(section.title))
  ) {
    const fromMarkdown = harnessSectionToDownloadable(section, orderIndex);
    if (fromMarkdown) {
      claimedNames.add(fromMarkdown.name);
      return fromMarkdown;
    }
  }

  if (options?.noFallback) return null;

  const fallback = sectionFallbackDownloadable(section, orderIndex);
  claimedNames.add(fallback.name);
  return fallback;
}

export function buildPipelineSectionDownloadables(
  pipelineSections: BulkHarnessSectionUi[],
  files: BulkDetailsDownloadable[],
  serpBriefDownload?: BulkDetailsDownloadable | null,
  options?: { noFallback?: boolean; researchArtifactsOnly?: boolean; requireDoneStatus?: boolean },
): Array<BulkDetailsDownloadable | null> {
  const claimedNames = new Set<string>();
  return pipelineSections.map((section, index) =>
    resolvePipelineSectionDownloadable(
      section,
      index,
      files,
      claimedNames,
      serpBriefDownload,
      options,
    ),
  );
}

export function buildAllDownloadables(
  pipelineSections: BulkHarnessSectionUi[],
  files: BulkDetailsDownloadable[],
  serpBriefDownload?: BulkDetailsDownloadable | null,
  options?: { noFallback?: boolean; researchArtifactsOnly?: boolean; requireDoneStatus?: boolean },
): BulkDetailsDownloadable[] {
  const seen = new Set<string>();
  const all: BulkDetailsDownloadable[] = [];
  const push = (file: BulkDetailsDownloadable | null) => {
    if (!file || seen.has(file.name)) return;
    seen.add(file.name);
    all.push(file);
  };
  buildPipelineSectionDownloadables(pipelineSections, files, serpBriefDownload, options).forEach((file) =>
    push(file),
  );
  files.forEach((file) => push(file));
  return all;
}
