import { normalizeInternalUrl } from "@/lib/wordpress-api/validate-internal-links";

export type BlogInternalLinkSpan = {
  index: number;
  href: string;
  anchor: string;
  normalizedHref: string;
};

export type BlogInternalLinkRange = BlogInternalLinkSpan & {
  hrefStart: number;
  hrefEnd: number;
};

export function readInternalLinkMatch(
  m: RegExpExecArray,
  site: { siteHost: string; baseOrigin: string },
  siteBaseUrl: string,
  selfNorm: string,
): BlogInternalLinkRange | null {
  const rawHref = (m[1] ?? "").trim();
  if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
    return null;
  }
  const resolved = resolveHref(rawHref, site.baseOrigin);
  if (!resolved || !isInternalHref(resolved, site.siteHost)) return null;
  const normalizedHref = normalizeInternalUrl(siteBaseUrl, resolved);
  if (selfNorm && normalizedHref === selfNorm) return null;

  const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
  const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(openTag);
  if (!hrefMatch?.[1]) return null;
  const hrefStart = m.index + openTag.indexOf(hrefMatch[0]) + hrefMatch[0].indexOf(hrefMatch[1]!);
  const hrefEnd = hrefStart + hrefMatch[1]!.length;

  return {
    index: 0,
    href: resolved,
    anchor: plainAnchorFromInnerHtml(m[2] ?? ""),
    normalizedHref,
    hrefStart,
    hrefEnd,
  };
}

export type InternalLinkEditSpan = {
  index: number;
  hrefStart: number;
  hrefEnd: number;
  innerStart: number;
  innerEnd: number;
};

export type SectionLinkRow = {
  anchor: string;
  href: string;
};

export function siteHostFromBase(siteBaseUrl: string): { siteHost: string; baseOrigin: string } | null {
  try {
    const base = siteBaseUrl.startsWith("http") ? siteBaseUrl : `https://${siteBaseUrl}`;
    const baseUrl = new URL(base);
    return {
      siteHost: baseUrl.hostname.replace(/^www\./, "").toLowerCase(),
      baseOrigin: baseUrl.origin,
    };
  } catch {
    return null;
  }
}

export function resolveHref(raw: string, baseOrigin: string): string | null {
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/")) return `${baseOrigin}${raw}`;
    return new URL(raw, baseOrigin).href;
  } catch {
    return null;
  }
}

export function isInternalHref(href: string, siteHost: string): boolean {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "").toLowerCase();
    return host === siteHost;
  } catch {
    return false;
  }
}

export function plainAnchorFromInnerHtml(inner: string): string {
  let out = "";
  let cursor = 0;
  while (cursor < inner.length) {
    const lt = inner.indexOf("<", cursor);
    if (lt === -1) {
      out += inner.slice(cursor);
      break;
    }
    out += inner.slice(cursor, lt);
    const gt = inner.indexOf(">", lt + 1);
    if (gt === -1) break;
    cursor = gt + 1;
  }
  return out.replace(/\s+/g, " ").trim();
}
