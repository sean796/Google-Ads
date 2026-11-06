import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { RESEARCH_STEP_ARTIFACT_SLUGS } from "@/lib/overview/overview-research-harness-sections";
import {
  isSerpBriefGeneratedFileName,
  sanitizeHarnessFilenamePart,
  type BulkDetailsDownloadable,
} from "./bulk-details-tile-sections-classify";
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
