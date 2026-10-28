/**
 * Internal link placeholders: harness writes [[LINK:query|anchor]], resolver
 * matches query intent to page-sitemap / blog URLs via OpenRouter.
 */

import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import {
  extractOverviewSectionHtml,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import { getSiteCache } from "@/lib/wordpress-site-cache";
import {
  isServiceAreaInventoryRow,
  keepBlogPlayLinkTargets,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/content-generation/internal-link-routing-rules";
import {
  matchInternalLinkQueriesToCatalog,
  normalizeInternalLinkUrl,
  type InternalLinkQuery,
} from "@/lib/content-generation/internal-link-intent-match";
import { matchInternalLinkQueriesFromPlan } from "@/lib/content-generation/link-targets-plan-resolve";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";
import {
  INTERNAL_LINKS_PER_SECTION_RULE,
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
} from "@/lib/content-generation/link-anchor-text-case";

export const INTERNAL_LINK_PLACEHOLDER_RE = /\[\[LINK:([^|\]]+)\|([^\]]+)\]\]/g;

const MALFORMED_INTERNAL_LINK_RE = /\{\{LINK:([^|\}]+)\|([^\}]+)\}\}/g;
const MALFORMED_EXTERNAL_LINK_RE = /\{\{EXTERNAL:([^|\}]+)\|([^\}]+)\}\}/g;

/** Normalize common model typo {{LINK:...}} → [[LINK:...]] before resolve. */
export function normalizeMalformedHarnessLinkPlaceholders(content: string): string {
  if (!content?.trim()) return content;
  return content
    .replace(MALFORMED_INTERNAL_LINK_RE, "[[LINK:$1|$2]]")
    .replace(MALFORMED_EXTERNAL_LINK_RE, "[[EXTERNAL:$1|$2]]");
}

export type LinkablePost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  collection?: string;
  postType?: string;
};

export type ResolveInternalLinkPlaceholdersOptions = {
  siteId?: string;
  siteUrl: string;
  currentPageUrl?: string;
  wordPressPosts?: LinkablePost[];
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  /** When set, resolve [[LINK:query|anchor]] from plan queries only (no catalog re-match). */
  linkTargetsPlan?: LinkTargetsPlan;
  matchQueriesToUrls?: (
    queries: InternalLinkQuery[],
    catalog: LinkablePost[],
  ) => Promise<Map<string, string>>;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSelfLink(link: string, currentPageUrl: string | undefined, siteUrl: string): boolean {
  if (!currentPageUrl?.trim()) return false;
  try {
    const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const normCurrent = normalizeInternalLinkUrl(
      new URL(currentPageUrl.startsWith("http") ? currentPageUrl : `${new URL(base).origin}${currentPageUrl}`, base).href,
    );
    const normLink = normalizeInternalLinkUrl(
      new URL(link.startsWith("http") ? link : `${new URL(base).origin}${link.startsWith("/") ? link : `/${link}`}`, base).href,
    );
    return normLink === normCurrent;
  } catch {
    return normalizeInternalLinkUrl(link) === normalizeInternalLinkUrl(currentPageUrl);
  }
}

function catalogFromOpts(opts: ResolveInternalLinkPlaceholdersOptions): LinkablePost[] {
  if (opts.wordPressPosts?.length) {
    return keepBlogPlayLinkTargets(opts.wordPressPosts);
  }
  if (opts.siteId) {
    const cache = getSiteCache(opts.siteId);
    return keepBlogPlayLinkTargets(cache?.posts ?? []);
  }
  return [];
}

function collectPlaceholderQueries(content: string): InternalLinkQuery[] {
  const re = new RegExp(INTERNAL_LINK_PLACEHOLDER_RE.source, "g");
  const queries: InternalLinkQuery[] = [];
  let index = 0;
  for (const match of content.matchAll(re)) {
    const query = (match[1] ?? "").trim();
    const anchor = (match[2] ?? "").trim();
    if (!query || !anchor) continue;
    index += 1;
    queries.push({ id: String(index), query, anchor });
  }
  return queries;
}

function linkCatalogCollection(post: LinkablePost): string | undefined {
  if (post.collection?.trim()) return post.collection.trim();
  const postType = post.postType?.trim().toLowerCase();
  if (postType === "post") return "posts";
  if (postType === "page") return "pages";
  return undefined;
}

function linkCatalogFromPosts(catalog: LinkablePost[]): Array<{
  title: string;
  url: string;
  slug: string;
  collection?: string;
  postType?: string;
  excerpt: string;
}> {
  return catalog.map((post) => ({
    title: post.title,
    url: post.link,
    slug: post.slug,
    collection: linkCatalogCollection(post),
    postType: post.postType,
    excerpt: post.excerpt,
  }));
}

async function resolveQueryUrls(
  queries: InternalLinkQuery[],
  catalog: LinkablePost[],
  opts: ResolveInternalLinkPlaceholdersOptions,
): Promise<Map<string, string>> {
  if (!queries.length) return new Map();
  if (opts.linkTargetsPlan) {
    const planMatches = matchInternalLinkQueriesFromPlan(queries, opts.linkTargetsPlan);
    const unmatched = queries.filter((q) => !planMatches.has(q.id));
    if (unmatched.length === 0 || !catalog.length) {
      return planMatches;
    }
    const catalogMatches = opts.matchQueriesToUrls
      ? await opts.matchQueriesToUrls(unmatched, catalog)
      : await matchInternalLinkQueriesToCatalog({
          queries: unmatched,
          catalog: linkCatalogFromPosts(catalog),
          apiKey: opts.apiKey?.trim() ?? "",
          model: opts.model,
          siteId: opts.siteId,
          signal: opts.signal,
        });
    for (const [id, url] of catalogMatches) {
      planMatches.set(id, url);
    }
    return planMatches;
  }
  if (!catalog.length) return new Map();
  if (opts.matchQueriesToUrls) {
    return opts.matchQueriesToUrls(queries, catalog);
  }
  return matchInternalLinkQueriesToCatalog({
    queries,
    catalog: linkCatalogFromPosts(catalog),
    apiKey: opts.apiKey?.trim() ?? "",
    model: opts.model,
    siteId: opts.siteId,
    signal: opts.signal,
  });
}

function resolveExactServiceAreaTitle(
  query: string,
  posts: LinkablePost[] | undefined,
): string | undefined {
  const q = query.trim().toLowerCase();
  if (!q || !posts?.length) return undefined;
  const hit = posts.find((p) => {
    if (!isServiceAreaInventoryRow(p)) return false;
    return p.title.trim().toLowerCase() === q;
  });
  return hit?.link.trim() || undefined;
}

function postByUrl(catalog: LinkablePost[], url: string): LinkablePost | null {
  const key = normalizeInternalLinkUrl(url);
  return catalog.find((post) => normalizeInternalLinkUrl(post.link) === key) ?? null;
}

function splitMarkdownOverviewSection(markdown: string): { overview: string; body: string } | null {
  const lines = markdown.split("\n");
  let overviewStart = -1;
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (/^##\s+overview\s*$/i.test(line)) {
      overviewStart = i;
      continue;
    }
    if (overviewStart >= 0 && /^##\s+/.test(line) && !/^##\s+overview\s*$/i.test(line)) {
      bodyStart = i;
      break;
    }
  }
  if (overviewStart < 0) return null;
  const prefix = lines.slice(0, overviewStart).join("\n");
  const overviewLines =
    bodyStart >= 0 ? lines.slice(overviewStart, bodyStart) : lines.slice(overviewStart);
  const overview = [prefix, overviewLines.join("\n")].filter(Boolean).join("\n");
  const body = bodyStart >= 0 ? lines.slice(bodyStart).join("\n") : "";
  return { overview, body };
}

async function resolvePreservingOverviewSection(
  html: string,
  opts: ResolveInternalLinkPlaceholdersOptions,
  resolveFragment: (fragment: string) => Promise<string>,
): Promise<string> {
  const overview = extractOverviewSectionHtml(html);
  if (!overview?.trim()) return resolveFragment(html);
  const body = stripLeadingOverviewSection(html);
  return stitchHarnessSections([overview, await resolveFragment(body)]);
}

async function resolveInternalLinkPlaceholdersCore(
  content: string,
  opts: ResolveInternalLinkPlaceholdersOptions,
  formatLink: (post: LinkablePost, anchor: string) => string,
): Promise<string> {
  if (!content?.trim()) return content;

  const normalized = normalizeMalformedHarnessLinkPlaceholders(content);
  const queries = collectPlaceholderQueries(normalized);
  if (!queries.length) return normalized;

  const catalog = catalogFromOpts(opts).filter(
    (post) => !isSelfLink(post.link, opts.currentPageUrl, opts.siteUrl),
  );
  const urlBySlot = await resolveQueryUrls(queries, catalog, opts);
  const re = new RegExp(INTERNAL_LINK_PLACEHOLDER_RE.source, "g");
  let slot = 0;

  return normalized.replace(re, (_full, _rawQuery: string, rawAnchor: string) => {
    const anchor = rawAnchor.trim();
    if (!anchor) return _full;

    slot += 1;
    const query = String(_rawQuery ?? "").trim();
    const url =
      urlBySlot.get(String(slot))?.trim()
      || resolveExactServiceAreaTitle(query, opts.wordPressPosts);
    if (!url) return anchor;

    const post = postByUrl(catalog, url) ?? ({ link: url } as LinkablePost);
    return formatLink(post, anchor);
  });
}

function htmlLinkFormatter(post: LinkablePost, anchor: string): string {
  return `<a href="${post.link.trim()}">${escapeHtml(anchor)}</a>`;
}

function markdownLinkFormatter(post: LinkablePost, anchor: string): string {
  const safeAnchor = anchor.replace(/[\[\]()]/g, "");
  return `[${safeAnchor}](${post.link.trim()})`;
}

export async function resolveInternalLinkPlaceholdersInHtml(
  html: string,
  opts: ResolveInternalLinkPlaceholdersOptions,
): Promise<string> {
  return resolvePreservingOverviewSection(html, opts, (fragment) =>
    resolveInternalLinkPlaceholdersCore(fragment, opts, htmlLinkFormatter),
  );
}

export async function resolveInternalLinkPlaceholdersInMarkdown(
  markdown: string,
  opts: ResolveInternalLinkPlaceholdersOptions,
): Promise<string> {
  const split = splitMarkdownOverviewSection(markdown);
  if (!split) {
    return resolveInternalLinkPlaceholdersCore(markdown, opts, markdownLinkFormatter);
  }
  const resolvedBody = await resolveInternalLinkPlaceholdersCore(
    split.body,
    opts,
    markdownLinkFormatter,
  );
  return stitchHarnessSections([split.overview, resolvedBody]);
}

/** Minimum [[LINK]] placeholders required in each body H2 section (Overview/FAQ excluded). */
export {
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
  INTERNAL_LINKS_PER_SECTION_RULE,
} from "@/lib/content-generation/link-anchor-text-case";

/** Harness / checklist copy for placeholder-based internal links. */
export const INTERNAL_LINK_PLACEHOLDER_PROMPT_BLOCK = `=== INTERNAL LINK PLACEHOLDERS (body sections — NOT Overview) ===
${INTERNAL_LINKS_PER_SECTION_RULE}
Format (exact): [[LINK:intent phrase|anchor text]]
When LINK TARGETS PLAN is in the system prompt: copy each intent phrase EXACTLY from the plan query string. Use the plan suggested anchor or a 2-4 word variant that shares title tokens in **sentence case** (brands capitalized only — e.g. rechargeable battery wands, PowerView motorization).
${INTERNAL_LINK_INTENT_ROUTING_RULE}
- intent phrase = exact query from LINK TARGETS PLAN when present; otherwise title words from PAGES or BLOG POSTS list
- weave links into <p> prose and <td> table cells within the same H2 section
- informational [[LINK]] slots may use BLOG POSTS title words in addition to PAGES
- anchor text must share at least one distinctive word from the destination page title
- place each token in the middle of a sentence that already has words before and after it
FORBIDDEN: raw same-site <a href="https://..."> in body sections. Emit [[LINK:plan-query|anchor]] only
FORBIDDEN: linking bold copy (**markdown**, <strong>, <b>)
FORBIDDEN: a leftover keyword, page title, or [[LINK]] after a finished sentence (". durable window coverings")
FORBIDDEN: a lone linked page title, "Related reading:", or "See [link]." tacked on at the end of a paragraph. Internal links are strictly in-context mid-sentence only. If you cannot weave the next [[LINK]] mid-sentence, STOP. Do not append it.
Format example: [[LINK:PAGES title words|short anchor]]
FORBIDDEN: service-area pages, city landings, /service-area/ URLs.
FORBIDDEN: {{LINK:...}}, {{EXTERNAL:...}}, {LINK:...}, template braces, or any syntax other than [[LINK:query|anchor]] and [[EXTERNAL:url|anchor]].
FORBIDDEN in body sections: pasted https:// internal URLs (Overview uses # anchors only; Semrush uses approved externals only).
=== END INTERNAL LINK PLACEHOLDERS ===`;

export const INTERNAL_LINK_PLACEHOLDER_FEATURE_SUFFIX =
  `${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} [[LINK:query|anchor]] per body H2 (prose + table cells; no raw https:// internal URLs)`;
