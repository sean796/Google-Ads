import { buildMetaAdCopySidecar } from "@/lib/ppc/export-meta-ads-creative-zip";
import {
  META_RESEARCH_SECTION_IDS,
  META_RESEARCH_SECTION_TITLES,
} from "@/lib/ppc/meta-ad-research-sections";
import type { MetaAdDeliverableRow, MetaAdRow } from "@/lib/ppc/meta-ads-types";
import {
  resolveMetaRowAdName,
  resolveMetaRowFocusKeyword,
} from "@/lib/ppc/meta-ads-types";

export type MetaAdDeliverableFile = {
  name: string;
  content: string;
  mimeType: string;
};

function sectionMarkdown(
  sections: MetaAdDeliverableRow["researchSections"],
  id: string,
): string {
  return sections?.find((section) => section.id === id && section.status === "done")?.markdown?.trim() ?? "";
}

function mergeMarkdown(parts: string[], title: string): string {
  const body = parts.map((part) => part.trim()).filter(Boolean);
  if (!body.length) return "";
  return [`# ${title}`, "", ...body].join("\n\n");
}

export function buildMetaAdDeliverableFiles(
  row: MetaAdDeliverableRow,
  slug = "meta-ad",
): MetaAdDeliverableFile[] {
  const files: MetaAdDeliverableFile[] = [];
  const sections = row.researchSections ?? [];
  const safeSlug = slug.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 48) || "meta-ad";

  const contextResearch = mergeMarkdown(
    [
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.neoPulseAppContext),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.contextUrl),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.landingPage),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.gscQueries),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.contextResearch),
    ],
    META_RESEARCH_SECTION_TITLES[META_RESEARCH_SECTION_IDS.contextResearch] ?? "Context research",
  );
  if (contextResearch) {
    files.push({
      name: `${safeSlug}-context-research.md`,
      content: contextResearch,
      mimeType: "text/markdown;charset=utf-8",
    });
  }

  const strategyBrief = mergeMarkdown(
    [
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.instagramGoal),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.creativeBrief),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.strategyBrief),
    ],
    META_RESEARCH_SECTION_TITLES[META_RESEARCH_SECTION_IDS.strategyBrief] ?? "Strategy brief",
  );
  if (strategyBrief) {
    files.push({
      name: `${safeSlug}-strategy-brief.md`,
      content: strategyBrief,
      mimeType: "text/markdown;charset=utf-8",
    });
  }

  const copySidecar = buildMetaAdCopySidecar(row);
  if (copySidecar.trim()) {
    files.push({
      name: `${safeSlug}-ad-copy.txt`,
      content: copySidecar,
      mimeType: "text/plain;charset=utf-8",
    });
  }

  const creativePlan = mergeMarkdown(
    [
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.visualReferencePlan),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.imageReferences),
      sectionMarkdown(sections, META_RESEARCH_SECTION_IDS.creativePlan),
    ],
    META_RESEARCH_SECTION_TITLES[META_RESEARCH_SECTION_IDS.creativePlan] ?? "Creative plan",
  );
  if (creativePlan) {
    files.push({
      name: `${safeSlug}-creative-plan.md`,
      content: creativePlan,
      mimeType: "text/markdown;charset=utf-8",
    });
  }

  const prompt = row.imagePromptDescription?.trim();
  if (prompt) {
    files.push({
      name: `${safeSlug}-image-prompt.md`,
      content: prompt,
      mimeType: "text/markdown;charset=utf-8",
    });
  }

  const imageSrc = row.creative?.imagePreviewUrl ?? row.creative?.imageBase64;
  if (typeof imageSrc === "string" && imageSrc.trim()) {
    files.push({
      name: `${safeSlug}-creative-image.ref`,
      content: imageSrc.trim(),
      mimeType: imageSrc.startsWith("data:") ? "image/png" : "text/uri-list",
    });
  }

  return files;
}

export function metaAdRowDisplayName(row: MetaAdDeliverableRow, rowIndex = 0): string {
  return resolveMetaRowAdName(row) || resolveMetaRowFocusKeyword(row) || `meta-ad-${rowIndex + 1}`;
}
