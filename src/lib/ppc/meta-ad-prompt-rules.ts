import { formatMetaColorPaletteBlock } from "@/lib/ppc/meta-ad-color-palette";
import { META_IMAGE_REALISM_RULE } from "@/lib/ppc/meta-ad-image-realism-spec";
import { META_IMAGE_SINGLE_ZONE_RULE } from "@/lib/ppc/meta-ad-image-on-image-text";
import type { MetaAdColorPalette } from "@/lib/ppc/meta-ads-types";
export function resolveMetaAdvertiserLabel(siteName?: string | null): string {
  const name = siteName?.trim();
  if (!name) {
    throw new Error("Connected site name is required.");
  }
  return name;
}

export function buildMetaBrandRules(siteName?: string | null, colorPalette?: MetaAdColorPalette): string {
  const advertiser = resolveMetaAdvertiserLabel(siteName);
  const colorBlock = formatMetaColorPaletteBlock(colorPalette);
  const accentRule = colorBlock?.includes("accent ")
    ? "- Use the user accent hex from the color palette block below"
    : "- Accent #84BC00 (lime green) as highlight when it fits the brief visualVibe";
  const backgroundRule = colorBlock?.includes("background ")
    ? "- Background from user color palette (exact hex)"
    : "- Background from creative brief backgroundTreatment (vibe-driven, not keyword-driven)";
  return `${advertiser} creative rules:
- Designed Instagram feed sponsored-post creative (modern, engaging, bold type hierarchy)
${accentRule}
${backgroundRule}
- NEVER add logos (no brand logos)
- Voice: speak as we/our/us for ${advertiser}, factual, benefit-focused${colorBlock ? `\n- ${colorBlock}` : ""}`;
}

export const META_IMAGE_NO_SPEC_FRAME_RULE = `Never render design-spec, format, or platform labels as visible text in the image.
Forbidden on-image text includes: "Designed", "Instagram Feed", "1:1", "4:5", "9:16", "Sponsored", "Sponsored Ad", "Placement", "Format", "PROMPT DESCRIPTION", aspect ratio labels, or any meta label describing the ad type.
Setup instructions in this prompt (placement, format, style) are for the generator only. Do not paint them into the creative.
The output is the finished ad creative only. No outer frame, no spec header, no mockup label bar.`;

export const META_IMAGE_TEXT_RULES = `On-image text rules (critical):
- Render ONLY the strings in ON-IMAGE TEXT LOCK (once each, one upper text block)
- ${META_IMAGE_SINGLE_ZONE_RULE}
- Never paste the focus keyword verbatim on the image
- Never duplicate line 1 or line 2 anywhere (no footer, badge, watermark, or bottom-band repeat)
- Maximum on-image text: line 1 plus optional line 2. No third line, no footer slogan
- No body copy, bullets, URLs, CTA buttons, checklist text, or caption on the image
- Meta ad primaryText (caption) belongs in ad fields only, not painted into the creative`;

export const META_IMAGE_LAYOUT_RULES = `Layout rules:
- Must read as a real Instagram feed or story sponsored ad creative
- Designed graphic with bold typography AND visible focal graphic elements from visualConcept (icons, accent bars, shapes, abstract motifs)
- ${META_IMAGE_SINGLE_ZONE_RULE}
- Not text-only on empty, white, or faded photo background
- Photo-hero only when creative brief creativeStyle is photo_hero
- No Instagram UI chrome (no profile bar, Sponsored label, like buttons, or phone bezels)
- ${META_IMAGE_NO_SPEC_FRAME_RULE}`;

export const META_IMAGE_ANTI_PATTERNS = META_IMAGE_REALISM_RULE;

export const META_IMAGE_NO_PEOPLE_RULES = `People rules (default):
- Do NOT show people, faces, hands holding products, or human silhouettes
- Only include people when allowPeopleInImage is explicitly true`;

export const META_VALUE_PROPOSITION_RULES = `Value proposition (critical):
- Every hook, adAngle, captionHook, onImageHeadline, primaryText, headline, and description must state a concrete outcome, benefit, or next step.
- Never stop at setup alone: audience plus "we help" without what they get is incomplete.
- Bad: "We help Edmonton businesses". Good: "We help Edmonton get found", "Edmonton SEO that ranks", "Book your SEO audit".
- onImageHeadline (max 6 words): include the outcome in the headline, or put it in onImageSubline (3 to 5 words). Headline-only must still imply the result.`;

export const META_INSTAGRAM_CAPTION_RULES = `Instagram sponsored post voice:
- Write like a short feed caption, not a landing page or product spec
- One hook sentence, plain language, local/benefit focused, with a definitive outcome or next step
- For agency service ads: Neo Digital speaks as we/our/us offering help, not anonymous tips
- No jargon: avoid Search Console, actionable tasks, WordPress URLs, dashboard, pipeline
- primaryText is the caption users see; keep it under 2 short sentences
- headline and description are Meta ad fields only: short labels, not duplicate paragraphs`;
