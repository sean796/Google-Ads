import { analyzeBestSectionForImage } from "@/lib/image-section-analyzer";
import {
  htmlBodyToMarkdownH2Projection,
  resolveForcedH2Section,
} from "@/lib/in-content-image-generator";
import { parseMarkdownSections } from "@/lib/section-parser";

export function base64FromDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  if (i < 0) throw new Error("Invalid image data URL");
  return dataUrl.slice(i + 1);
}


/** Skip CTA / chrome headings when auto-placing Local Image near the top of the body. */
export function isWeakLocalImageHeading(header: string): boolean {
  const h = (header ?? "").trim().toLowerCase();
  if (!h) return true;
  if (h === "overview") return true;
  const weakPrefixes = [
    "book a",
    "book your",
    "contact",
    "hours",
    "quick links",
    "more areas",
    "faq",
    "frequently asked",
  ];
  for (const p of weakPrefixes) {
    if (h === p || h.startsWith(p)) return true;
  }
  return false;
}

/**
 * Prefer the first strong body H2 after Overview (else first strong H2).
 * Local place photos are easy to miss when AI buries them mid-article.
 */
export function pickEarlyLocalImageSectionHeader(
  sections: Array<{ header: string }>,
): string {
  let seenOverview = false;
  for (const s of sections) {
    const h = (s.header ?? "").trim();
    if (!h) continue;
    if (h.toLowerCase() === "overview") {
      seenOverview = true;
      continue;
    }
    if (seenOverview && !isWeakLocalImageHeading(h)) return h;
  }
  for (const s of sections) {
    const h = (s.header ?? "").trim();
    if (h && !isWeakLocalImageHeading(h)) return h;
  }
  return (sections[0]?.header ?? "").trim();
}

export async function resolveSectionHeaderForLocalImage(params: {
  html: string;
  entity: string;
  focusKeyword: string;
  flowTitle?: string;
  forcedSectionHeader?: string;
  apiKey: string;
  researchModel: string;
}): Promise<string> {
  const markdownProjection = htmlBodyToMarkdownH2Projection(params.html);
  if (!markdownProjection.includes("## ")) {
    throw new Error("No H2 sections found in the content");
  }
  const sections = parseMarkdownSections(markdownProjection);
  const forced = (params.forcedSectionHeader ?? "").trim();
  if (forced) {
    return resolveForcedH2Section(sections, forced).header;
  }
  const early = pickEarlyLocalImageSectionHeader(sections);
  if (early) {
    return early;
  }
  return analyzeBestSectionForImage(
    markdownProjection,
    "photo",
    params.flowTitle || params.entity,
    `Local place photography for ${params.entity}`,
    undefined,
    params.apiKey,
    params.researchModel,
  );
}
