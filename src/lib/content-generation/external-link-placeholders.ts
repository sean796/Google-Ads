import {
  EXTERNAL_LINK_BARE_PLACEHOLDER_RE,
  EXTERNAL_LINK_PLACEHOLDER_RE,
  type ExternalLinkPair,
} from "./external-link-pairs";
import {
  ensureAllLinkAnchorsInHtml,
  escapeHtml,
  escapeRegExp,
  findAllowedPair,
  findPairByUrl,
  hostnameFromUrl,
  wrapBareExternalUrlsInHtml,
} from "./external-link-html";
export {
  EXTERNAL_LINK_BARE_PLACEHOLDER_RE,
  EXTERNAL_LINK_PLACEHOLDER_RE,
  buildAllowedExternalPairs,
  buildRowExplicitExternalAllowlist,
  externalUrlsFromPairs,
  mergeExternalLinkPairs,
  parseExternalSemrushPairsFromAgents,
  parseLlmAuditAuthorityPairsFromAgents,
  type ExternalLinkPair,
} from "./external-link-pairs";
export {
  deriveAnchorFromExternalUrl,
  ensureAllLinkAnchorsInHtml,
  fixExternalAnchorsWithRawUrlLabels,
  wrapBareExternalUrlsInHtml,
} from "./external-link-html";
export function finalizeExternalLinksInHtml(
  html: string,
  allowedPairs: ExternalLinkPair[] = [],
): string {
  if (!html?.trim()) return html;
  let out = resolveExternalLinkPlaceholdersInHtml(html, allowedPairs);
  out = wrapBareExternalUrlsInHtml(out, allowedPairs);
  out = ensureAllLinkAnchorsInHtml(out, allowedPairs);
  return out;
}

function maskExternalPlaceholders(content: string): string {
  return content
    .replace(EXTERNAL_LINK_PLACEHOLDER_RE, "[[EXTERNAL:MASKED|MASKED]]")
    .replace(EXTERNAL_LINK_BARE_PLACEHOLDER_RE, "[[EXTERNAL]]");
}

function connectedSiteHost(siteUrl: string | undefined): string {
  if (!siteUrl?.trim()) return "";
  try {
    const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    return new URL(base).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSameSiteHref(href: string, siteUrl: string | undefined): boolean {
  const host = connectedSiteHost(siteUrl);
  if (!host) return false;
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./i, "").toLowerCase() === host;
  } catch {
    return false;
  }
}

export function assertHarnessExternalLinksValid(
  html: string,
  opts: {
    title: string;
    siteUrl?: string;
    allowedPairs?: ExternalLinkPair[];
  },
): void {
  const allowedPairs = opts.allowedPairs ?? [];
  const masked = maskExternalPlaceholders(html);
  const proseCheck = stripHtmlForFootnoteCheck(masked).replace(/\[\[EXTERNAL:MASKED\|MASKED\]\]/g, "");
  if (/https?:\/\//i.test(proseCheck)) {
    throw new Error(
      `Harness: section "${opts.title}" contains bare https URL in prose — use [[EXTERNAL:url|anchor]] placeholder only`,
    );
  }
  for (const pair of allowedPairs) {
    const host = hostnameFromUrl(pair.url);
    if (!host) continue;
    const hostRe = new RegExp(`\\b${escapeRegExp(host)}\\b`, "i");
    if (hostRe.test(proseCheck)) {
      throw new Error(
        `Harness: section "${opts.title}" contains bare hostname ${host} in prose — use [[EXTERNAL:${pair.url}|${pair.anchor}]] woven mid-sentence`,
      );
    }
  }

  const externalAnchorRe = /<a\b[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = externalAnchorRe.exec(html)) !== null) {
    const href = m[1]!.trim();
    if (!isSameSiteHref(href, opts.siteUrl)) {
      throw new Error(
        `Harness: section "${opts.title}" contains AI-written external link ${href} — use [[EXTERNAL:url|anchor]] placeholder only`,
      );
    }
  }

  EXTERNAL_LINK_PLACEHOLDER_RE.lastIndex = 0;
  while ((m = EXTERNAL_LINK_PLACEHOLDER_RE.exec(html)) !== null) {
    const url = m[1]!.trim();
    const anchor = m[2]!.trim();
    if (!findAllowedPair(url, anchor, allowedPairs)) {
      throw new Error(
        `Harness: section "${opts.title}" has invalid [[EXTERNAL:${url}|${anchor}]] — not in approved Semrush pairs`,
      );
    }
  }

  if (/\s\([^()]{8,120}\)(?=[.!?,;:\s]|$)/.test(stripHtmlForFootnoteCheck(masked))) {
    throw new Error(
      `Harness: section "${opts.title}" contains parenthetical footnote citation — use [[EXTERNAL:url|anchor]] instead`,
    );
  }
}

function stripHtmlForFootnoteCheck(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

export function resolveExternalLinkPlaceholdersInHtml(
  html: string,
  allowedPairs: ExternalLinkPair[] = [],
): string {
  if (!html?.trim()) return html;

  let out = html;
  const singlePair = allowedPairs.length === 1 ? allowedPairs[0]! : null;

  if (singlePair) {
    out = out.replace(EXTERNAL_LINK_BARE_PLACEHOLDER_RE, () => {
      const u = singlePair.url.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
      return `<a href="${u}">${escapeHtml(singlePair.anchor)}</a>`;
    });
  }

  out = out.replace(EXTERNAL_LINK_PLACEHOLDER_RE, (_match, rawUrl: string, rawAnchor: string) => {
    const url = rawUrl.trim();
    const anchor = rawAnchor.trim();
    const pair = findAllowedPair(url, anchor, allowedPairs) ?? findPairByUrl(url, allowedPairs);
    if (!pair) {
      return escapeHtml(anchor);
    }
    const href = pair.url.replace(/"/g, "&quot;").replace(/&/g, "&amp;");
    const label = pair.anchor.trim() || anchor;
    return `<a href="${href}">${escapeHtml(label)}</a>`;
  });

  if (allowedPairs.length === 0) {
    out = out.replace(EXTERNAL_LINK_BARE_PLACEHOLDER_RE, "");
  }

  return out;
}

/** Harness / system prompt copy for placeholder-based external authority links. */
export const EXTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK = `=== EXTERNAL LINK PLACEHOLDERS (body sections — weave like internal links) ===
Format (exact): [[EXTERNAL:exact-url|exact-anchor]]
- Copy exact URL and anchor from APPROVED EXTERNAL URLs (SEMRUSH or LLM AUDIT AUTHORITY) blocks only.
- Weave **mid-sentence inside a paragraph**, same placement rules as [[LINK:query|anchor]] internal links.
- anchor = approved phrase from the list (2-6 words). Never invent anchors.
FORBIDDEN: bare hostname or domain as plain text or anchor (edmonton.ca, energy.gov); writing "City. domain.ca" instead of [[EXTERNAL:url|City]]; "for more", "here", "learn more", or "read more" as anchor; appending the link after the final period; a standalone link-only sentence.
Example: "Homeowners in [[EXTERNAL:https://www.edmonton.ca/residential/solar|Edmonton]] should review solar guidelines before applying for permits."
=== END EXTERNAL LINK PLACEHOLDERS ===`;
