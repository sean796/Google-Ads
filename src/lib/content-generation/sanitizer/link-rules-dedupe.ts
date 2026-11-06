/**
 * Normalize URL for deduplication: same page = same key (lowercase origin + pathname, no trailing slash).
 */
function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/**
 * Ensure each link URL appears at most once in markdown content.
 * Keeps the first occurrence as [text](url); replaces subsequent same-URL links with plain text only.
 * Used for SEO extra content so we never link to the same page more than once.
 */
export function deduplicateInternalLinksInMarkdown(content: string): string {
  if (!content) return content;
  const seen = new Set<string>();
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  return content.replace(markdownLinkPattern, (match, text: string, url: string) => {
    const key = normalizeUrlForDedupe(url);
    if (seen.has(key)) return text;
    seen.add(key);
    return match;
  });
}

/**
 * Ensure each internal link URL appears at most once in HTML content.
 * Keeps the first occurrence; replaces subsequent same-URL links with anchor text only.
 */
export function deduplicateInternalLinksInHtml(content: string): string {
  if (!content) return content;
  const seen = new Set<string>();
  let out = content;
  out = out.replace(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi, (match, url: string, text: string) => {
    const key = normalizeUrlForDedupe(url);
    if (seen.has(key)) return text;
    seen.add(key);
    return match;
  });
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (match, text: string, url: string) => {
    const key = normalizeUrlForDedupe(url);
    if (seen.has(key)) return text;
    seen.add(key);
    return match;
  });
  return out;
}

/**
 * Ensure no internal link ends in a period: move trailing period from anchor text to after </a>.
 * Mid-sentence link placement is enforced in harness prompts; do not inject SEO stub phrases.
 */
export function ensureNoLinkEndsInPeriod(html: string): string {
  if (!html) return html;
  let out = html;
  const isHashHref = (attrs: string) => /href\s*=\s*["']#/i.test(attrs);
  // Move period from inside anchor to outside: <a ...>text.</a> -> <a ...>text</a>.
  out = out.replace(/<a([^>]*)>([^<]*?)\.<\/a>/gi, (match, attrs: string, text: string) => {
    if (isHashHref(attrs)) return match;
    return `<a${attrs}>${text}</a>.`;
  });
  return out;
}

/** Remove orphan " for more." or "Related reading: <a ...>...</a>." tails left after link strip or bad output. */
export function stripDanglingForMoreTail(html: string): string {
  if (!html) return html;
  let out = html.replace(
    /\s*Related reading:\s*(?:<a\b[^>]*>[\s\S]*?<\/a>|\[[^\]]+\]\([^)]+\)|[^.<]+)\.?/gi,
    "",
  );
  out = out.replace(/\s+for more\.(?!\s*(?:information|details|context|guidance|resources|help|on|about)\b)/gi, ".");
  return out;
}

