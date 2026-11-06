import type { MetaAdChecklistItem, MetaAdCreativeBrief } from "@/lib/ppc/meta-ads-types";

function collapseWhitespace(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(" ");
}

function stripPhraseIgnoreCase(text: string, phrase: string): string {
  const needle = phrase.trim();
  if (!needle) return text;
  let result = text;
  const lowerNeedle = needle.toLowerCase();
  let lowerResult = result.toLowerCase();
  let index = lowerResult.indexOf(lowerNeedle);
  while (index !== -1) {
    result = `${result.slice(0, index)}${result.slice(index + needle.length)}`;
    lowerResult = result.toLowerCase();
    index = lowerResult.indexOf(lowerNeedle);
  }
  return collapseWhitespace(result);
}

function headlineFragments(headline: string): string[] {
  const words = collapseWhitespace(headline).split(" ");
  const fragments: string[] = [];
  for (let size = Math.min(6, words.length); size >= 3; size -= 1) {
    for (let start = 0; start <= words.length - size; start += 1) {
      fragments.push(words.slice(start, start + size).join(" "));
    }
  }
  return fragments;
}

export function collapseConsecutiveDuplicateWords(text: string): string {
  const words = collapseWhitespace(text).split(" ");
  if (words.length <= 1) return collapseWhitespace(text);
  const next: string[] = [words[0]!];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]!;
    const prev = next[next.length - 1]!;
    if (word.toLowerCase() !== prev.toLowerCase()) {
      next.push(word);
    }
  }
  return next.join(" ");
}

export function normalizeMetaOnImageText(brief: MetaAdCreativeBrief): MetaAdCreativeBrief {
  const onImageHeadline = collapseConsecutiveDuplicateWords(brief.onImageHeadline);
  let onImageSubline = brief.onImageSubline.trim()
    ? collapseConsecutiveDuplicateWords(brief.onImageSubline)
    : "";
  if (
    onImageSubline &&
    onImageSubline.toLowerCase() === onImageHeadline.toLowerCase()
  ) {
    onImageSubline = "";
  }
  return { ...brief, onImageHeadline, onImageSubline };
}

export function sanitizeVisualConceptForImage(
  visualConcept: string,
  brief: Pick<MetaAdCreativeBrief, "onImageHeadline" | "onImageSubline">,
): string {
  let next = visualConcept.trim();
  next = stripPhraseIgnoreCase(next, brief.onImageHeadline);
  if (brief.onImageSubline.trim()) {
    next = stripPhraseIgnoreCase(next, brief.onImageSubline);
  }
  for (const fragment of headlineFragments(brief.onImageHeadline)) {
    next = stripPhraseIgnoreCase(next, fragment);
  }
  const meaningfulChars = collapseWhitespace(next.replace(/[^\w\s]/g, " ")).replace(/[^a-zA-Z0-9]/g, "");
  if (!meaningfulChars) {
    return "Designed graphic motifs, icons, and shapes only. No on-image text in the visual concept.";
  }
  return next;
}

export function prepareCreativeBriefForImageGeneration(brief: MetaAdCreativeBrief): MetaAdCreativeBrief {
  const normalized = normalizeMetaOnImageText(brief);
  return {
    ...normalized,
    visualConcept: sanitizeVisualConceptForImage(normalized.visualConcept, normalized),
  };
}

export function buildMetaImageOnImageTextLockBlock(brief: MetaAdCreativeBrief): string {
  const lines = [
    "ON-IMAGE TEXT LOCK (single source of truth — the only place headline and subline strings appear in this prompt):",
    `Line 1: "${brief.onImageHeadline}"`,
  ];
  if (brief.onImageSubline.trim()) {
    lines.push(`Line 2 (directly under line 1): "${brief.onImageSubline}"`);
  } else {
    lines.push("Line 2: none");
  }
  lines.push(
    "Placement: ONE text block in the upper third only (top-left or top-center).",
    "Forbidden: any second copy of line 1 or line 2 in any position (bottom band, footer strip, watermark, faded overlay, corner badge, chart label, device screen).",
    "Forbidden: splitting line 1 or line 2 across top and bottom zones.",
    "Forbidden: caption, primaryText, hashtags, URLs, CTA buttons, or a third text line.",
  );
  return lines.join("\n");
}

export const META_IMAGE_TEXT_LOCK_REFERENCE = "Apply ON-IMAGE TEXT LOCK only. Do not quote or repeat those strings anywhere else in this prompt or in the image.";

export const META_IMAGE_SINGLE_ZONE_RULE =
  "On-image typography: one block in the upper third only. The lower half of the frame must contain zero readable text.";

export function buildMandatoryMetaImageTextChecklistItems(
  brief: MetaAdCreativeBrief,
): MetaAdChecklistItem[] {
  const items: MetaAdChecklistItem[] = [
    {
      id: "mandatory-headline-once",
      label: "On-image text matches ON-IMAGE TEXT LOCK only",
      detail: "One text block in upper third. Zero readable text in lower half or bottom band.",
    },
  ];
  if (brief.onImageSubline.trim()) {
    items.push({
      id: "mandatory-subline-once",
      label: "Subline sits once directly under headline in the same upper block",
      detail: "No footer repeat, watermark, or faded duplicate",
    });
  }
  items.push({
    id: "mandatory-no-duplicate-text",
    label: "No duplicate or partial repeat of any on-image phrase",
    detail: "Forbidden: bottom slogans, overlay repeats, splitting copy across zones",
  });
  items.push({
    id: "mandatory-no-spec-frame",
    label: "No design-spec or platform labels as visible text",
    detail:
      'Forbidden: "Designed", "Instagram Feed", aspect ratios, "Sponsored Ad", placement/format headers, or mockup label bars',
  });
  return items;
}

export function mergeMandatoryMetaImageTextChecklist(
  checklist: MetaAdChecklistItem[],
  brief: MetaAdCreativeBrief,
): MetaAdChecklistItem[] {
  const mandatory = buildMandatoryMetaImageTextChecklistItems(brief);
  const mandatoryIds = new Set(mandatory.map((item) => item.id));
  const rest = checklist.filter((item) => !mandatoryIds.has(item.id));
  return [...mandatory, ...rest];
}
