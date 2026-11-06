import type { ExtractedMediaItem } from "@/lib/content-optimization/images-extract";

/** Checklist lines that force exact existing media URLs into Content Opt. */
export function buildForcedMediaChecklistLines(media: ExtractedMediaItem[]): string[] {
  return media.map((m) => {
    const label = (m.linkLabel || m.altTag || m.title || "Existing media").replace(/[[\]]/g, "").trim();
    const url = m.url.trim();
    if (m.kind === "video") {
      return `[LINK]: [${label}](${url}) — existing video/media from the current post; use this exact href (do not invent a replacement)`;
    }
    return `[IMAGE]: ![${label}](${url}) — existing image from the current post; preserve this exact URL as an inline <img> embed (do not invent or generate a new image; never use <a href> to the image file)`;
  });
}

/** userPrompt block for checklist + blueprint generation. */
export function buildForcedMediaUserPrompt(media: ExtractedMediaItem[]): string {
  if (!media.length) return "";
  const lines = media.map((m, i) => {
    const label = (m.linkLabel || m.altTag || m.title || "Existing media").replace(/[[\]]/g, "").trim();
    return `${i + 1}. kind=${m.kind}; markdown=[${label}](${m.url.trim()})`;
  });
  return [
    "MANDATORY EXISTING MEDIA FROM THE CURRENT POST (exact URLs — include in the checklist and blueprint; never drop or invent replacements):",
    ...lines,
    "For each image, include an [IMAGE]: ![label](exact-url) feature with that exact URL. The content harness MUST embed each image as <figure class=\"wp-block-image size-full\"><img src=\"exact-url\" alt=\"label\" loading=\"lazy\" /></figure> in the matching section. NEVER output images as <a href> text links to the PNG/JPEG file.",
    "For each video, include a [LINK]: [label](exact-url) feature with that exact URL.",
    "Do not generate new images. Do not change the hrefs.",
  ].join("\n");
}

/** Merge forced media lines into a checklist (dedupe by URL). */
export function mergeForcedMediaIntoChecklist(
  checklist: string[],
  media: ExtractedMediaItem[],
): string[] {
  if (!media.length) return checklist;
  const forced = buildForcedMediaChecklistLines(media);
  const out = [...checklist];
  for (const line of forced) {
    const urlMatch = media.find((m) => line.includes(m.url));
    if (urlMatch && out.some((item) => item.includes(urlMatch.url))) continue;
    out.push(line);
  }
  return out;
}
