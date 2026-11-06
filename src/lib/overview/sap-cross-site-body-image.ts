function attrFromTag(tag: string, name: string): string {
  const lower = tag.toLowerCase();
  const needle = `${name.toLowerCase()}=`;
  const i = lower.indexOf(needle);
  if (i < 0) return "";
  let j = i + needle.length;
  if (j >= tag.length) return "";
  const q = tag[j];
  if (q !== '"' && q !== "'") return "";
  j += 1;
  const end = tag.indexOf(q, j);
  if (end < 0) return "";
  return tag.slice(j, end).trim();
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Prefer Local Image / wp-image figure, else first http(s) body img.
 * Ignores empty and non-http srcs. Featured media is never in content HTML.
 * Returns the image hit and the HTML span to strip (wrapping figure when present).
 */
export function locatePreferredBodyImageInHtml(html: string): {
  url: string;
  alt?: string;
  start: number;
  end: number;
} | null {
  const raw = String(html || "");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  let preferred: { url: string; alt?: string; start: number; end: number } | null =
    null;
  let fallback: { url: string; alt?: string; start: number; end: number } | null =
    null;
  let idx = 0;
  while (idx < lower.length) {
    const img = lower.indexOf("<img", idx);
    if (img < 0) break;
    const tagEnd = lower.indexOf(">", img);
    if (tagEnd < 0) break;
    const tag = raw.slice(img, tagEnd + 1);
    const src = attrFromTag(tag, "src");
    if (!isHttpUrl(src)) {
      idx = tagEnd + 1;
      continue;
    }
    const altRaw = attrFromTag(tag, "alt");
    const alt = altRaw.trim() || undefined;
    const classAttr = attrFromTag(tag, "class").toLowerCase();
    const lookBehind = lower.slice(Math.max(0, img - 240), img);
    const figOpenRel = lookBehind.lastIndexOf("<figure");
    const figCloseRel = lookBehind.lastIndexOf("</figure");
    const inFigure = figOpenRel >= 0 && figOpenRel > figCloseRel;
    const isPreferred = classAttr.includes("wp-image") || inFigure;
    let start = img;
    let end = tagEnd + 1;
    if (inFigure) {
      const figOpenAbs = img - lookBehind.length + figOpenRel;
      const figCloseAbs = lower.indexOf("</figure>", tagEnd + 1);
      if (figOpenAbs >= 0 && figCloseAbs >= 0) {
        start = figOpenAbs;
        end = figCloseAbs + "</figure>".length;
      }
    }
    const hit = { url: src, alt, start, end };
    if (isPreferred) {
      if (!preferred) preferred = hit;
    } else if (!fallback) {
      fallback = hit;
    }
    if (preferred) return preferred;
    idx = tagEnd + 1;
  }
  return preferred || fallback;
}

export function extractPreferredBodyImageFromHtml(
  html: string,
): { url: string; alt?: string } | null {
  const hit = locatePreferredBodyImageInHtml(html);
  if (!hit) return null;
  return { url: hit.url, alt: hit.alt };
}

/** Remove the preferred body Local Image figure/img (same target as extract). */
export function stripPreferredBodyImageFromHtml(html: string): string {
  const hit = locatePreferredBodyImageInHtml(html);
  if (!hit) return html;
  return `${html.slice(0, hit.start)}${html.slice(hit.end)}`;
}

/** True when body HTML already has a usable in-content (local) image. */
export function htmlHasLocalInContentImage(html: string): boolean {
  return Boolean(extractPreferredBodyImageFromHtml(html));
}
