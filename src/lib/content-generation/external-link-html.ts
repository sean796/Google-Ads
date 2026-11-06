import type { ExternalLinkPair } from "./external-link-pairs";
import { normalizeUrlKey, pairKey } from "./external-link-pairs";
const BAD_LINK_ANCHOR_RE =
  /^(?:here|click here|read more|learn more|this page|this link|link|more info|more information)$/i;
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
export function findPairByUrl(url: string, allowedPairs: ExternalLinkPair[]): ExternalLinkPair | null {
  const key = normalizeUrlKey(url);
  for (const pair of allowedPairs) {
    if (normalizeUrlKey(pair.url) === key) return pair;
  }
  return null;
}

export function findAllowedPair(
  url: string,
  anchor: string,
  allowedPairs: ExternalLinkPair[],
): ExternalLinkPair | null {
  const key = pairKey(url, anchor);
  for (const pair of allowedPairs) {
    if (pairKey(pair.url, pair.anchor) === key) return pair;
  }
  return null;
}

const BARE_URL_TRAILING_PUNCT = new Set([".", ",", ";", ":", "!", "?", ")", "}", "]", "'", '"']);

function splitBareUrlTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";
  while (url.length > 0 && BARE_URL_TRAILING_PUNCT.has(url[url.length - 1]!)) {
    trailing = url[url.length - 1]! + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

export function deriveAnchorFromExternalUrl(url: string): string {
  try {
    const u = new URL(url.replace(/&amp;/gi, "&"));
    const slug = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "";
    if (slug) {
      return slug
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function plainLinkLabel(labelHtml: string): string {
  return labelHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function isBadLinkAnchorLabel(label: string, href: string): boolean {
  if (!label) return true;
  if (BAD_LINK_ANCHOR_RE.test(label)) return true;
  if (/^https?:\/\//i.test(label)) return true;
  const normHref = href.trim().replace(/\/+$/, "").toLowerCase();
  const normLabel = label.replace(/\/+$/, "").toLowerCase();
  if (normHref === normLabel) return true;
  return false;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url.trim().replace(/&amp;/gi, "&")).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function externalLinkTag(pair: ExternalLinkPair, anchorOverride?: string): string {
  const href = pair.url.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
  const anchor = (anchorOverride ?? pair.anchor).trim() || deriveAnchorFromExternalUrl(pair.url);
  return `<a href="${href}">${escapeHtml(anchor)}</a>`;
}

/** "Edmonton. edmonton.ca" → linked city keyword (not bare domain prose). */
function fixCityPeriodBareHostnameInTextSegment(text: string, allowedPairs: ExternalLinkPair[]): string {
  if (!text || !allowedPairs.length) return text;
  let out = text;
  for (const pair of allowedPairs) {
    const host = hostnameFromUrl(pair.url);
    if (!host) continue;
    const re = new RegExp(
      `\\b([A-Z][a-z]+(?:,\\s*[A-Z][a-z]+)?)\\.\\s*${escapeRegExp(host)}\\b`,
      "g",
    );
    out = out.replace(re, (_match, cityPart: string) => {
      const anchor = cityPart.trim().split(",")[0]?.trim();
      if (!anchor || BAD_LINK_ANCHOR_RE.test(anchor)) {
        return externalLinkTag(pair);
      }
      return externalLinkTag(pair, anchor);
    });
  }
  return out;
}

function wrapBareHostnamesInTextSegment(text: string, allowedPairs: ExternalLinkPair[]): string {
  if (!text || !allowedPairs.length) return text;
  let out = text;
  for (const pair of allowedPairs) {
    const host = hostnameFromUrl(pair.url);
    if (!host) continue;
    const re = new RegExp(`(?<![./:@])\\b${escapeRegExp(host)}\\b`, "gi");
    out = out.replace(re, () => externalLinkTag(pair));
  }
  return out;
}

function processPlainExternalLinkText(text: string, allowedPairs: ExternalLinkPair[]): string {
  let out = fixCityPeriodBareHostnameInTextSegment(text, allowedPairs);
  if (/<[^>]+>/.test(out)) {
    return out.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag: string | undefined, plain: string | undefined) => {
      if (tag) return tag;
      if (!plain) return "";
      let chunk = wrapBareUrlsInTextSegment(plain, allowedPairs);
      chunk = wrapBareHostnamesInTextSegment(chunk, allowedPairs);
      return chunk;
    });
  }
  out = wrapBareUrlsInTextSegment(out, allowedPairs);
  out = wrapBareHostnamesInTextSegment(out, allowedPairs);
  return out;
}

function processExternalLinkTextSegment(text: string, allowedPairs: ExternalLinkPair[]): string {
  if (!text || !allowedPairs.length) return text;
  if (/<[^>]+>/.test(text)) {
    return text.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag: string | undefined, plain: string | undefined) => {
      if (tag) return tag;
      return plain ? processPlainExternalLinkText(plain, allowedPairs) : "";
    });
  }
  return processPlainExternalLinkText(text, allowedPairs);
}

function wrapBareUrlsInTextSegment(text: string, allowedPairs: ExternalLinkPair[]): string {
  if (!text || !allowedPairs.length) return text;
  const bareUrlRe = /https?:\/\/[^\s<>"']+/gi;
  return text.replace(bareUrlRe, (rawMatch) => {
    const { url, trailing } = splitBareUrlTrailingPunctuation(rawMatch);
    const pair = findPairByUrl(url, allowedPairs);
    if (!pair) {
      return trailing ? trailing : "";
    }
    return `${externalLinkTag(pair)}${trailing}`;
  });
}

/** Convert bare https:// URLs and bare hostnames in HTML text nodes to anchor tags. */
export function wrapBareExternalUrlsInHtml(
  html: string,
  allowedPairs: ExternalLinkPair[] = [],
): string {
  if (!html?.trim() || allowedPairs.length === 0) return html;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_match, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag;
    if (!text) return text ?? "";
    return processExternalLinkTextSegment(text, allowedPairs);
  });
}

/** Every <a> must have visible anchor text; external links use approved Semrush anchor when URL matches. */
export function ensureAllLinkAnchorsInHtml(
  html: string,
  allowedPairs: ExternalLinkPair[] = [],
): string {
  if (!html?.trim()) return html;
  return html.replace(
    /<a\b([^>]*?)href=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/a>/gi,
    (match, before: string, href: string, after: string, labelHtml: string) => {
      const plain = plainLinkLabel(labelHtml);
      const safeHref = href.replace(/"/g, "&quot;").replace(/&/g, "&amp;");

      if (/^https?:\/\//i.test(href)) {
        const pair = findPairByUrl(href, allowedPairs);
        if (pair) {
          const approved = pair.anchor.trim() || deriveAnchorFromExternalUrl(pair.url);
          if (
            plain
            && !isBadLinkAnchorLabel(plain, href)
            && plain.replace(/\/+$/, "").toLowerCase() !== href.replace(/\/+$/, "").toLowerCase()
          ) {
            return match;
          }
          return `<a${before}href="${safeHref}"${after}>${escapeHtml(approved)}</a>`;
        }
        if (isBadLinkAnchorLabel(plain, href)) {
          const anchor = deriveAnchorFromExternalUrl(href);
          return `<a${before}href="${safeHref}"${after}>${escapeHtml(anchor)}</a>`;
        }
        return match;
      }

      if (href.startsWith("#")) {
        if (!plain) {
          const anchor = href
            .slice(1)
            .replace(/-/g, " ")
            .replace(/\b\w/g, (ch) => ch.toUpperCase());
          return `<a${before}href="${safeHref}"${after}>${escapeHtml(anchor)}</a>`;
        }
        return match;
      }

      if (isBadLinkAnchorLabel(plain, href)) {
        const anchor = deriveAnchorFromExternalUrl(href);
        return `<a${before}href="${safeHref}"${after}>${escapeHtml(anchor)}</a>`;
      }
      return match;
    },
  );
}

/** Fix external links whose visible label is the raw URL instead of anchor text. */
export function fixExternalAnchorsWithRawUrlLabels(
  html: string,
  allowedPairs: ExternalLinkPair[] = [],
): string {
  return ensureAllLinkAnchorsInHtml(html, allowedPairs);
}
