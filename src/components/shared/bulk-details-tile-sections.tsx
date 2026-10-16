import { useState, useEffect, type ReactNode } from "react";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { ChevronDown, Download, FileDown, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import {
  resolveAiseoPipelineDownloadFile,
  type AiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  MetaAccordionStripeRow,
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_BTN,
  META_FIELD_END_RAIL_CELL,
  META_TRIGGER_FLAT,
  zoneMetaAccordionStack,
} from "@/components/overview/MetaOptimizerPageRowDetails";
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
  isContentOptimizePipelineTitles,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  RESEARCH_HARNESS_SECTION_TITLES,
  RESEARCH_STEP_ARTIFACT_SLUGS,
  isResearchHarnessPipelineTitles,
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

function isArtifactOnlyPipelineTitle(title: string): boolean {
  return ARTIFACT_ONLY_PIPELINE_TITLES.has(title.trim());
}

const PIPELINE_HARNESS_TITLES = new Set<string>([
  ...CONTENT_PREP_BATCH_SECTION_TITLES,
  ...CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES,
  ...CONTENT_OPTIMIZE_PIPELINE_TITLES,
  ...GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES,
  ...RESEARCH_HARNESS_SECTION_TITLES,
]);

function filterPipelineHarnessSections(
  sections: BulkHarnessSectionUi[],
  pipelineSectionTitles?: readonly string[],
): BulkHarnessSectionUi[] {
  if (pipelineSectionTitles?.length) {
    const allowed = new Set(pipelineSectionTitles);
    return sections.filter((section) => allowed.has(section.title));
  }
  return sections.filter((s) => PIPELINE_HARNESS_TITLES.has(s.title));
}

function isSerpPipelineSection(section: BulkHarnessSectionUi): boolean {
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

function resolveDetailsPipelineSections(
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

function sanitizeHarnessFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "section";
}

function harnessSectionToDownloadable(
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

function isHarnessSectionDownloadReady(section: BulkHarnessSectionUi): boolean {
  if (section.status === "waiting") return false;
  if (section.status === "done") return true;
  return false;
}

function sectionFallbackDownloadable(
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

function buildPipelineSectionDownloadables(
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

export function BulkDetailsTileSections({
  harnessSections,
  files,
  onDownloadFile,
  onDownloadAll,
  stripeBaseIndex,
  serpBriefDownload,
  statusMessage,
  progressLabel,
  pipelineSectionTitles,
  defaultFilesOpen,
  downloadsLocked = false,
  filesOnly = false,
  fileSlotRunKind,
}: {
  harnessSections: BulkHarnessSectionUi[];
  files: BulkDetailsDownloadable[];
  onDownloadFile: (file: BulkDetailsDownloadable) => void;
  onDownloadAll: (files: BulkDetailsDownloadable[]) => void;
  stripeBaseIndex: number;
  serpBriefDownload?: BulkDetailsDownloadable | null;
  statusMessage?: string | null;
  /** Active-row batch counter (e.g. 20/115), inline before file count. */
  progressLabel?: string | null;
  pipelineSectionTitles?: readonly string[];
  defaultFilesOpen?: boolean;
  /** @deprecated Row-level lock; per-step gating uses harness status === done. */
  downloadsLocked?: boolean;
  /** FAQ-style runs: list generated files only (no harness pipeline rows). */
  filesOnly?: boolean;
  /** Registry runKind for fixed Element | Post content | WordPress upload slots. */
  fileSlotRunKind?: AiseoFileSlotRunKind;
}) {
  const resolvedFileSlotRunKind = fileSlotRunKind;
  const useFileSlotsOnly = Boolean(resolvedFileSlotRunKind);
  const aiseoPipelineDownloadFile = (title: string): BulkDetailsDownloadable | undefined => {
    if (!resolvedFileSlotRunKind) return undefined;
    return resolveAiseoPipelineDownloadFile(resolvedFileSlotRunKind, title, files);
  };
  const [filesOpen, setFilesOpen] = useState(defaultFilesOpen ?? false);
  useEffect(() => {
    if (defaultFilesOpen) setFilesOpen(true);
  }, [defaultFilesOpen]);
  const useExplicitPipeline = Boolean(pipelineSectionTitles?.length);
  const isResearchPipeline =
    useExplicitPipeline && isResearchHarnessPipelineTitles(pipelineSectionTitles);
  const isContentOptimizePipeline =
    useExplicitPipeline && isContentOptimizePipelineTitles(pipelineSectionTitles);
  const pipelineDownloadOptions = isResearchPipeline
    ? { researchArtifactsOnly: true as const }
    : isContentOptimizePipeline
      ? { noFallback: true as const, requireDoneStatus: true as const }
      : undefined;
  const pipelineSections = useFileSlotsOnly
    ? []
    : resolveDetailsPipelineSections(
        harnessSections,
        undefined,
        useExplicitPipeline ? pipelineSectionTitles : harnessSections.length ? undefined : [...CONTENT_OPTIMIZE_PIPELINE_TITLES],
        files,
      );
  const pipelineDownloadables = buildPipelineSectionDownloadables(
    pipelineSections,
    files,
    serpBriefDownload,
    pipelineDownloadOptions,
  );
  const claimedPipelineNames = new Set(
    pipelineDownloadables.filter((file): file is BulkDetailsDownloadable => file != null).map((file) => file.name),
  );
  const extraFiles = isContentOptimizePipeline
    ? []
    : files.filter((file) => !claimedPipelineNames.has(file.name));
  const readyPipelineDownloadables = pipelineDownloadables.filter(
    (file): file is BulkDetailsDownloadable => file != null,
  );
  const wpPayloadForDownloadAll = isContentOptimizePipeline
    ? files.filter(
        (file) =>
          file.name.startsWith("upload-payload-") && !claimedPipelineNames.has(file.name),
      )
    : [];
  const allDownloadables = isContentOptimizePipeline
    ? [...readyPipelineDownloadables, ...wpPayloadForDownloadAll]
    : buildAllDownloadables(pipelineSections, extraFiles, serpBriefDownload, pipelineDownloadOptions);
  const fileSlotDisplaySections = useFileSlotsOnly ? harnessSections : [];
  const downloadableCount = useFileSlotsOnly
    ? fileSlotDisplaySections.filter((section) =>
        Boolean(aiseoPipelineDownloadFile(section.title || "")),
      ).length
    : pipelineDownloadables.filter((file) => file != null).length + extraFiles.length;
  const headerItemCount = useFileSlotsOnly
    ? Math.max(fileSlotDisplaySections.length, 2)
    : useExplicitPipeline
      ? pipelineSections.length
      : downloadableCount;
  const trimmedStatus = statusMessage?.trim();
  const trimmedProgress = progressLabel?.trim();
  const activePipelineIndex = useFileSlotsOnly
    ? fileSlotDisplaySections.findIndex((section) => section.status === "generating")
    : pipelineSections.reduce(
        (acc, section, index) =>
          section.status === "generating" || section.status === "start" ? index : acc,
        -1,
      );

  if (
    !useFileSlotsOnly &&
    pipelineSections.length === 0 &&
    downloadableCount === 0 &&
    !trimmedStatus &&
    !trimmedProgress
  ) {
    return null;
  }

  return (
    <div className={zoneMetaAccordionStack} role="region" aria-label="Generated files">
      <MetaAccordionStripeRow stripeIndex={stripeBaseIndex}>
        <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
          <div className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-base font-semibold text-white"
              >
                <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                <span className="shrink-0 text-left">Generated files</span>
                {trimmedStatus ? (
                  <span
                    className="min-w-0 flex-1 truncate text-left font-normal text-white"
                    role="status"
                    aria-live="polite"
                  >
                    {trimmedStatus}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1" aria-hidden />
                )}
                {trimmedProgress ? (
                  <span
                    className="shrink-0 tabular-nums text-muted-foreground"
                    aria-label={`Progress ${trimmedProgress}`}
                  >
                    {trimmedProgress}
                  </span>
                ) : null}
              </button>
            </CollapsibleTrigger>
            <div className={cn(META_FIELD_END_RAIL, "shrink-0")}>
              <span
                className={cn(
                  META_FIELD_COUNT,
                  META_FIELD_END_RAIL_CELL,
                  "min-w-[1.75rem] tabular-nums font-semibold",
                )}
              >
                {headerItemCount.toLocaleString()}
              </span>
              {allDownloadables.length > 0 ? (
                <button
                  type="button"
                  className={META_FIELD_END_RAIL_BTN}
                  title="Download all"
                  aria-label="Download all generated files"
                  onClick={() => onDownloadAll(allDownloadables)}
                >
                  <Download className="h-4 w-4 shrink-0" />
                </button>
              ) : null}
            </div>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center border-0 bg-transparent p-0 text-white"
                aria-label={filesOpen ? "Collapse generated files" : "Expand generated files"}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform",
                    filesOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-2 text-base">
              {useFileSlotsOnly
                ? fileSlotDisplaySections.map((s, i) => {
                    const downloadable = aiseoPipelineDownloadFile(s.title || "");
                    const isActiveStep = i === activePipelineIndex;
                    const stepReady = Boolean(downloadable);
                    return (
                      <div
                        key={`file-slot-${i}-${s.title}`}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-none px-1 py-0.5",
                          isActiveStep && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
                        )}
                      >
                        <span
                          className={cn(
                            "w-6 shrink-0 tabular-nums",
                            isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1",
                            isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                          )}
                        >
                          {s.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 shrink-0 px-2 text-base hover:bg-white/10 hover:text-white",
                            stepReady ? "text-white" : "text-muted-foreground",
                          )}
                          disabled={!stepReady}
                          onClick={() => downloadable && onDownloadFile(downloadable)}
                        >
                          <Download className="mr-1 h-3 w-3" />
                          File
                        </Button>
                      </div>
                    );
                  })
                : null}
              {!useFileSlotsOnly
                ? pipelineSections.map((s, i) => {
                const downloadable = pipelineDownloadables[i];
                const isActiveStep = i === activePipelineIndex;
                const stepReady = Boolean(downloadable);
                return (
                  <div
                    key={`${i}-${s.sectionIndex}-${s.title || "section"}`}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-none px-1 py-0.5",
                      isActiveStep && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
                    )}
                  >
                    <span
                      className={cn(
                        "w-6 shrink-0 tabular-nums",
                        isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1",
                        isActiveStep ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                      )}
                    >
                      {s.title || `Section ${s.sectionIndex + 1}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 shrink-0 px-2 text-base hover:bg-white/10 hover:text-white",
                        stepReady ? "text-white" : "text-muted-foreground",
                      )}
                      disabled={!stepReady}
                      onClick={() => downloadable && onDownloadFile(downloadable)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      File
                    </Button>
                  </div>
                );
              })
                : null}
              {!filesOnly
                ? extraFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                    {pipelineSections.length + idx + 1}
                  </span>
                  <span
                    className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-white"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 shrink-0 px-2 text-base hover:bg-white/10 hover:text-white",
                      downloadsLocked ? "text-muted-foreground" : "text-white",
                    )}
                    disabled={downloadsLocked}
                    onClick={() => onDownloadFile(file)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    File
                  </Button>
                </div>
              ))
                : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </MetaAccordionStripeRow>
    </div>
  );
}

export type BulkDetailsDrawerStackProps = {
  liveMessage?: string | null;
  /** When false, skip the live stripe even if `liveMessage` is set (Content Optimizer parallel-run gating). */
  showLiveMessage?: boolean;
  prepSections?: BulkHarnessSectionUi[] | null;
  prepOpen?: boolean;
  onPrepOpenChange?: (open: boolean) => void;
  prepAccordionTitle?: string;
  pagination?: ReactNode;
  /** Receives stripe index after live/prep/pagination stripes for row numbering. */
  children: (stripeBase: number) => ReactNode;
};

export function BulkDetailsDrawerStack({
  liveMessage,
  showLiveMessage = true,
  prepSections,
  prepOpen = true,
  onPrepOpenChange,
  prepAccordionTitle = "Sitemap prep",
  pagination,
  children,
}: BulkDetailsDrawerStackProps) {
  let stripeBase = 0;
  const trimmedLive = liveMessage?.trim();
  const liveStripe =
    showLiveMessage && trimmedLive ? (
      <div className={contentOptimizerRowStripeClass(stripeBase++)}>
        <div className="border-0 px-2.5 py-1.5 text-base text-white sm:px-3">{trimmedLive}</div>
      </div>
    ) : null;

  const prepStripeIndex = prepSections?.length ? stripeBase++ : null;

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      {liveStripe}
      {prepSections?.length ? (
        <BulkDetailsPrepAccordion
          sections={prepSections}
          stripeIndex={prepStripeIndex!}
          open={prepOpen}
          onOpenChange={onPrepOpenChange ?? (() => {})}
          title={prepAccordionTitle}
        />
      ) : null}
      {pagination}
      {children(stripeBase)}
    </div>
  );
}

export function BulkDetailsPrepAccordion({
  sections,
  stripeIndex,
  open,
  onOpenChange,
  title = "Sitemap prep",
}: {
  sections: BulkHarnessSectionUi[];
  stripeIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}) {
  return (
    <MetaAccordionStripeRow stripeIndex={stripeIndex}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button type="button" className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
            <MapIcon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-left">{title}</span>
            <div className={cn(META_FIELD_END_RAIL, "pointer-events-auto shrink-0")}>
              <span
                className={cn(
                  META_FIELD_COUNT,
                  META_FIELD_END_RAIL_CELL,
                  "min-w-[1.75rem] tabular-nums font-semibold",
                )}
              >
                {sections.length.toLocaleString()}
              </span>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="space-y-2 text-base">
            {sections.map((s, i) => {
              const md = s.markdown?.trim();
              const mdLines = md?.split("\n") ?? [];
              const downloadHref = mdLines.length >= 2 ? mdLines[1]?.trim() : "";
              const downloadName = mdLines[0]?.trim();
              return (
                <div key={s.sectionIndex} className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-white">
                      {s.title || `Section ${s.sectionIndex + 1}`}
                    </span>
                  </div>
                  {downloadHref && downloadName ? (
                    <a
                      href={downloadHref}
                      download={downloadName}
                      className="ml-8 text-primary underline-offset-2 hover:underline"
                    >
                      {downloadName}
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </MetaAccordionStripeRow>
  );
}

export { filterPipelineHarnessSections, resolveDetailsPipelineSections, isSerpPipelineSection, isHarnessSectionDownloadReady };
