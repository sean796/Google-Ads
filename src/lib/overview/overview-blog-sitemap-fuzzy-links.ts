import type { WordPressSite } from "@/components/integrations/types";
import {
  getBulkGenerationWpInventoryIfReady,
  isBlogPlayLinkTarget,
  isServiceAreaUrl,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import { parseCompactInventoryUrls } from "@/lib/bulk/inventory-json-slim";
import { prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { getEntitySiteWarmCacheIfReady } from "@/lib/local-analysis/entity-site-warm-cache";
import { isNumberedSlugDuplicateHref } from "@/lib/overview/overview-blog-links-agent-payload";
import {
  getBlogLinksLinkPoolFromSession,
  loadBlogLinksLinkInventory,
} from "@/lib/overview/overview-blog-links-inventory";
import { getOverviewRowsSessionCache } from "@/lib/overview/overview-rows-session-cache";
import { isOverviewUtilityPage } from "@/lib/overview/overview-utility-page-filter";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export type SitemapFuzzyLinkCandidate = {
  url: string;
  title: string;
  slug: string;
  bucket: "page" | "post";
  focusKeyword?: string;
  excerpt?: string;
  score?: number;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "get", "had", "has",
  "have", "he", "how", "i", "if", "in", "into", "is", "it", "its", "just",
  "may", "me", "might", "more", "my", "no", "not", "of", "on", "or", "our",
  "out", "she", "should", "so", "some", "such", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "too", "up", "use",
  "very", "was", "we", "were", "what", "when", "where", "which", "while",
  "who", "whom", "why", "will", "with", "would", "you", "your",
]);

function slugFromUrl(url: string): string {
  try {
    const pathname = new URL(url.trim()).pathname.replace(/\/+$/, "");
    return (pathname.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  } catch {
    return (url.trim().replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "").toLowerCase();
  }
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function urlPathLower(url: string): string {
  try {
    return new URL(url.trim()).pathname.toLowerCase().replace(/-/g, " ");
  } catch {
    return url.toLowerCase().replace(/-/g, " ");
  }
}

function urlPathHyphenLower(url: string): string {
  try {
    return new URL(url.trim()).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Rough word stem ("motorized" -> "motoriz", "blinds" -> "blind") matching Neo_Pulse_Wp_Search::match_stem. */
export function matchStem(term: string): string {
  const t = term.toLowerCase().trim();
  if (t.length < 5) return "";
  const suffixes = ["ing", "ed", "es", "ers", "er", "ly", "s"];
  for (const suffix of suffixes) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 4) {
      return t.slice(0, t.length - suffix.length);
    }
  }
  return "";
}

function tokenizeWords(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < lower.length; i += 1) {
    const code = lower.charCodeAt(i);
    const isAlphaNum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
    if (isAlphaNum) {
      cur += lower[i];
    } else if (cur.length > 0) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** Whole-word or word-start match (so "blind" matches "blinds" but "art" does not match "start"). */
function hasWordPrefix(text: string, term: string): boolean {
  if (!text || !term) return false;
  const words = tokenizeWords(text);
  return words.some((w) => w === term || w.startsWith(term));
}

/** Extract single terms + hyphenated/spaced bigrams matching Neo_Pulse_Wp_Chat_Rag::extract_match_terms. */
export function extractFuzzyMatchTerms(
  query: string,
  extraPhrases: string[] = [],
): { words: string[]; matchTerms: string[] } {
  const rawWords = tokenizeWords(query);
  const words: string[] = [];
  const seenWords = new Set<string>();
  for (const w of rawWords) {
    if (w.length < 2 || STOP_WORDS.has(w) || seenWords.has(w)) continue;
    seenWords.add(w);
    words.push(w);
  }

  const terms = new Set<string>(words);
  for (let i = 0; i < rawWords.length - 1; i += 1) {
    const w1 = rawWords[i]!;
    const w2 = rawWords[i + 1]!;
    if (w1.length < 2 || w2.length < 2) continue;
    if (STOP_WORDS.has(w1) || STOP_WORDS.has(w2)) continue;
    terms.add(`${w1}-${w2}`);
    terms.add(`${w1} ${w2}`);
  }

  for (const phrase of extraPhrases) {
    const pWords = tokenizeWords(phrase).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
    if (pWords.length === 0) continue;
    const joinedSpace = pWords.join(" ");
    const joinedHyphen = pWords.join("-");
    terms.add(joinedSpace);
    terms.add(joinedHyphen);
    for (const pw of pWords) {
      terms.add(pw);
      if (!seenWords.has(pw)) {
        seenWords.add(pw);
        words.push(pw);
      }
    }
  }

  return { words, matchTerms: Array.from(terms) };
}

/**
 * Score one candidate using Neo_Pulse_Wp_Search::rank_results + match_percent and
 * Neo_Pulse_Wp_Chat_Rag::fuzzy_page_score. Product/commercial pages get a strong priority boost over posts.
 */
export function scoreFuzzySitemapCandidate(
  candidate: SitemapFuzzyLinkCandidate,
  queryText: string,
  extraPhrases: string[] = [],
): number {
  const { words, matchTerms } = extractFuzzyMatchTerms(queryText, extraPhrases);
  if (matchTerms.length === 0) {
    return candidate.bucket === "page" ? 65 : 10;
  }

  const titleLower = candidate.title.toLowerCase();
  const slugLower = candidate.slug.toLowerCase();
  const pathSpaceLower = urlPathLower(candidate.url);
  const pathHyphenLower = urlPathHyphenLower(candidate.url);
  const metaLower = `${candidate.focusKeyword ?? ""} ${candidate.excerpt ?? ""}`.toLowerCase();

  let ragFuzzyScore = 0;
  for (const term of matchTerms) {
    if (term.length < 2) continue;
    const hitSlug = slugLower.includes(term);
    const hitPath = pathSpaceLower.includes(term);
    const hitHyphen = pathHyphenLower.includes(term);
    const hitTitle = titleLower.includes(term);

    if (hitSlug || hitPath || hitHyphen || hitTitle) {
      ragFuzzyScore += term.length;
    }
    if (term.includes("-") && !term.includes(" ") && (hitSlug || hitHyphen)) {
      ragFuzzyScore += 15;
    }
  }

  let weightTotal = 0;
  const evalWords = words.slice(0, 18);
  for (const term of evalWords) {
    const stem = matchStem(term);
    let weight = 0;
    if (hasWordPrefix(titleLower, term)) {
      weight = 1.0;
    } else if (hasWordPrefix(`${slugLower} ${pathSpaceLower}`, term)) {
      weight = 0.85;
    } else if (hasWordPrefix(metaLower, term)) {
      weight = 0.7;
    } else if (stem && titleLower.includes(stem)) {
      weight = 0.6;
    } else if (stem && (slugLower.includes(stem) || pathSpaceLower.includes(stem) || metaLower.includes(stem))) {
      weight = 0.4;
    }
    weightTotal += weight;
  }

  const coverage = evalWords.length > 0 ? weightTotal / evalWords.length : 0;
  const matchPct = weightTotal > 0 ? Math.round(20 + 80 * coverage) : 0;

  // Content priority boost from Neo_Pulse_Wp_Search::content_priority_boost (pages +45, posts -18)
  const typeBoost = candidate.bucket === "page" ? 45 : -18;
  const pageHitBonus = candidate.bucket === "page" && ragFuzzyScore > 0 ? 25 : 0;

  return typeBoost + pageHitBonus + ragFuzzyScore + matchPct;
}

export function isEligibleSitemapLinkCandidate(
  item: { url?: string; title?: string; slug?: string; collection?: string; postType?: string },
  currentPageUrl?: string,
): boolean {
  const url = item.url?.trim() ?? "";
  if (!url) return false;
  if (isServiceAreaUrl(url)) return false;
  if (!isBlogPlayLinkTarget({ link: url, collection: item.collection, postType: item.postType })) {
    return false;
  }
  if (isNumberedSlugDuplicateHref(url)) return false;
  if (currentPageUrl?.trim()) {
    if (normalizePageUrlKey(url) === normalizePageUrlKey(currentPageUrl)) {
      return false;
    }
  }
  const coll = (item.collection || item.postType || "").toLowerCase().trim();
  const isPage = coll === "pages" || coll === "page" || (!coll && !url.toLowerCase().includes("/blog/"));
  if (isPage && isOverviewUtilityPage({ url, slug: item.slug, title: item.title })) {
    return false;
  }
  return true;
}

/** Collect all eligible product/service pages and blog posts from warm/session caches (never entity URLs). */
export async function resolveSitemapFuzzyLinkPool(args: {
  site?: WordPressSite | null;
  siteId?: string | null;
  pageUrl?: string;
}): Promise<SitemapFuzzyLinkCandidate[]> {
  const siteId = (args.site?.id || args.siteId || "").trim();
  const pageUrl = args.pageUrl?.trim();
  const byUrlKey = new Map<string, SitemapFuzzyLinkCandidate>();

  const addCandidate = (raw: {
    url?: string;
    title?: string;
    slug?: string;
    bucket?: "page" | "post";
    collection?: string;
    postType?: string;
    focusKeyword?: string;
    excerpt?: string;
  }) => {
    const url = raw.url?.trim() ?? "";
    if (!isEligibleSitemapLinkCandidate(raw, pageUrl)) return;
    const key = normalizePageUrlKey(url);
    if (!key) return;
    const slug = (raw.slug?.trim() || slugFromUrl(url)).toLowerCase();
    const title = (raw.title?.trim() || titleFromSlug(slug)).trim();
    const coll = (raw.collection || raw.postType || raw.bucket || "").toLowerCase().trim();
    const bucket: "page" | "post" =
      raw.bucket ??
      (coll === "posts" || coll === "post" || url.toLowerCase().includes("/blog/") ? "post" : "page");

    const existing = byUrlKey.get(key);
    if (existing) {
      if (!existing.title && title) existing.title = title;
      if (!existing.focusKeyword && raw.focusKeyword) existing.focusKeyword = raw.focusKeyword;
      if (!existing.excerpt && raw.excerpt) existing.excerpt = raw.excerpt;
      if (bucket === "page") existing.bucket = "page";
      return;
    }

    byUrlKey.set(key, {
      url,
      title,
      slug,
      bucket,
      focusKeyword: raw.focusKeyword?.trim() || undefined,
      excerpt: raw.excerpt?.trim() || undefined,
    });
  };

  if (siteId) {
    const warmRows = getBulkGenerationWpInventoryIfReady(siteId);
    if (warmRows?.length) {
      for (const r of warmRows) {
        addCandidate({
          url: r.url,
          title: r.fields?.title,
          slug: r.slug,
          collection: r.collection,
          focusKeyword: r.fields?.keyword || r.fields?.focus_keyword,
          excerpt: r.fields?.excerpt || r.fields?.meta,
        });
      }
    }

    const warmBundle = getEntitySiteWarmCacheIfReady(siteId);
    if (warmBundle) {
      for (const r of warmBundle.bulkInventoryRows ?? []) {
        addCandidate({
          url: r.url,
          title: r.fields?.title,
          slug: r.slug,
          collection: r.collection,
          focusKeyword: r.fields?.keyword || r.fields?.focus_keyword,
          excerpt: r.fields?.excerpt || r.fields?.meta,
        });
      }
      const pageJson = warmBundle.inventory?.buckets?.pages?.json;
      if (pageJson) {
        try {
          for (const u of parseCompactInventoryUrls(pageJson)) {
            addCandidate({ url: u, bucket: "page", collection: "pages" });
          }
        } catch {
          /* ignore */
        }
      }
      const postJson = warmBundle.inventory?.buckets?.posts?.json;
      if (postJson) {
        try {
          for (const u of parseCompactInventoryUrls(postJson)) {
            addCandidate({ url: u, bucket: "post", collection: "posts" });
          }
        } catch {
          /* ignore */
        }
      }
    }

    const sessionPages = getOverviewRowsSessionCache(siteId, "pages");
    if (sessionPages?.length) {
      for (const r of sessionPages) {
        addCandidate({
          url: r.url,
          title: r.aiTitle || r.title,
          bucket: "page",
          collection: "pages",
          focusKeyword: r.focusKeyword,
          excerpt: r.aiMeta || r.metaDescription,
        });
      }
    }

    const sessionPosts = getOverviewRowsSessionCache(siteId, "posts");
    if (sessionPosts?.length) {
      for (const r of sessionPosts) {
        addCandidate({
          url: r.url,
          title: r.aiTitle || r.title,
          bucket: "post",
          collection: "posts",
          focusKeyword: r.focusKeyword,
          excerpt: r.aiMeta || r.metaDescription,
        });
      }
    }

    const sessionPool = getBlogLinksLinkPoolFromSession(siteId);
    if (sessionPool) {
      for (const p of sessionPool.pageInventory) {
        addCandidate({
          url: p.url,
          title: p.title,
          slug: p.slug,
          bucket: "page",
          collection: "pages",
          focusKeyword: p.focusKeyword,
        });
      }
      for (const p of sessionPool.postInventory) {
        addCandidate({
          url: p.url,
          title: p.title,
          slug: p.slug,
          bucket: "post",
          collection: "posts",
          focusKeyword: p.focusKeyword,
        });
      }
    }
  }

  if (byUrlKey.size === 0 && args.site) {
    try {
      const loaded = await loadBlogLinksLinkInventory(args.site);
      if (loaded?.pool) {
        for (const p of loaded.pool.pageInventory) {
          addCandidate({
            url: p.url,
            title: p.title,
            slug: p.slug,
            bucket: "page",
            collection: "pages",
            focusKeyword: p.focusKeyword,
          });
        }
        for (const p of loaded.pool.postInventory) {
          addCandidate({
            url: p.url,
            title: p.title,
            slug: p.slug,
            bucket: "post",
            collection: "posts",
            focusKeyword: p.focusKeyword,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return Array.from(byUrlKey.values());
}

/**
 * Fuzzy-match and rank top sitemap link candidates for a specific section.
 * Product/commercial pages are prioritized over blog posts; already-used URLs are de-prioritized.
 */
export function rankFuzzySitemapLinksForSection(args: {
  pool: SitemapFuzzyLinkCandidate[];
  sectionTitle: string;
  sectionBodyHtml: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl?: string;
  usedUrls?: ReadonlySet<string>;
  limit?: number;
}): SitemapFuzzyLinkCandidate[] {
  const {
    pool,
    sectionTitle,
    sectionBodyHtml,
    articleTitle,
    focusKeyword,
    pageUrl,
    usedUrls,
    limit = 8,
  } = args;

  const eligible = pool.filter((c) =>
    isEligibleSitemapLinkCandidate(
      {
        url: c.url,
        title: c.title,
        slug: c.slug,
        collection: c.bucket === "page" ? "pages" : "posts",
      },
      pageUrl,
    ),
  );
  if (eligible.length === 0) return [];

  const bodyPlain = prosePlainText(sectionBodyHtml).slice(0, 600);
  const queryText = [sectionTitle, focusKeyword, bodyPlain].filter(Boolean).join(" ");
  const extraPhrases = [sectionTitle, focusKeyword, articleTitle].filter(Boolean);

  const scored = eligible.map((candidate) => {
    const baseScore = scoreFuzzySitemapCandidate(candidate, queryText, extraPhrases);
    const key = normalizePageUrlKey(candidate.url);
    const usedPenalty = usedUrls?.has(key) ? -80 : 0;
    return {
      ...candidate,
      score: baseScore + usedPenalty,
    };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const picked: SitemapFuzzyLinkCandidate[] = [];
  const seenKeys = new Set<string>();

  // Ensure product/service pages lead the candidate list
  const topPages = scored.filter((c) => c.bucket === "page");
  const topPosts = scored.filter((c) => c.bucket === "post");

  for (const page of topPages.slice(0, Math.min(5, limit))) {
    const k = normalizePageUrlKey(page.url);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    picked.push(page);
  }

  for (const item of [...scored, ...topPosts]) {
    if (picked.length >= limit) break;
    const k = normalizePageUrlKey(item.url);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    picked.push(item);
  }

  return picked;
}

/**
 * Fuzzy-match and rank ONLY page-sitemap money pages (product/service/commercial pages, never blog posts or entity URLs)
 * for the Direct Answer section so the Answer always links toward a transactional product/service page.
 */
export function rankFuzzyMoneyPageLinksForAnswer(args: {
  pool: SitemapFuzzyLinkCandidate[];
  articleTitle: string;
  focusKeyword: string;
  bodyH2Titles?: string[];
  pageUrl?: string;
  limit?: number;
}): SitemapFuzzyLinkCandidate[] {
  const {
    pool,
    articleTitle,
    focusKeyword,
    bodyH2Titles = [],
    pageUrl,
    limit = 6,
  } = args;

  const pageOnlyPool = pool.filter(
    (c) =>
      c.bucket === "page" &&
      isEligibleSitemapLinkCandidate(
        {
          url: c.url,
          title: c.title,
          slug: c.slug,
          collection: "pages",
        },
        pageUrl,
      ),
  );
  if (pageOnlyPool.length === 0) return [];

  const queryText = [focusKeyword, articleTitle, ...bodyH2Titles].filter(Boolean).join(" ");
  const extraPhrases = [focusKeyword, articleTitle, ...bodyH2Titles.slice(0, 4)].filter(Boolean);

  const scored = pageOnlyPool.map((candidate) => ({
    ...candidate,
    score: scoreFuzzySitemapCandidate(candidate, queryText, extraPhrases),
  }));

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, limit);
}

export function formatAnswerMoneyPageLinksPromptBlock(
  candidates: SitemapFuzzyLinkCandidate[],
): string {
  if (candidates.length === 0) return "";
  return [
    "PAGE SITEMAP MONEY PAGE TARGETS (MANDATORY IN ANSWER: WEAVE 1 PRODUCT/SERVICE LINK):",
    "You MUST weave 1 contextual <a href=\"...\">anchor text</a> link inside the Answer <p> pointing to the best-matching [PRODUCT / SERVICE MONEY PAGE] below to support the customer's transaction.",
    "- Point directly toward the relevant product, collection, or service page (never a blog post, never an entity/service-area URL).",
    "- Front-load the linked product/service phrase naturally in a sentence (2-5 word descriptive anchor, never \"click here\" or a raw URL).",
    ...candidates.map((p) => `- [PRODUCT / SERVICE MONEY PAGE] "${p.title}" -> ${p.url}`),
  ].join("\n");
}

export function formatFuzzySitemapLinksPromptBlock(
  candidates: SitemapFuzzyLinkCandidate[],
  lockedLinks: string[],
): string {
  const lines: string[] = [];

  if (lockedLinks.length > 0) {
    lines.push(
      "EXISTING SECTION LINKS (keep or upgrade in context):",
      ...lockedLinks.map((tag, idx) => `${idx + 1}. ${tag}`),
      "",
    );
  }

  if (candidates.length > 0) {
    const pages = candidates.filter((c) => c.bucket === "page");
    const posts = candidates.filter((c) => c.bucket === "post");
    lines.push(
      "SITEMAP INTERNAL LINK TARGETS (MANDATORY: WEAVE 1 TO 3 LINKS IN THIS SECTION):",
      "You MUST include 1 to 3 internal <a href=\"...\">anchor text</a> links in bodyHtml using URLs from this sitemap list (or EXISTING SECTION LINKS above).",
      "- PRIORITIZE [PRODUCT / PAGE] URLs first over [BLOG POST] URLs.",
      "- FRONT-LOAD LINKS IN SENTENCES: place the linked anchor phrase in the opening clause / first half of the sentence so readers see the link early.",
      "- ALWAYS IN CONTEXT, NO LINK DUMPS: weave natural 2-5 word descriptive anchor phrases directly inside <p> or <li> sentences. Never tack links onto the end of a paragraph, never write \"Learn more\" / \"Click here\", and never list standalone links.",
      "- NEVER invent URLs and NEVER link to service-area / city entity URLs.",
    );
    if (pages.length > 0) {
      lines.push("Priority Product & Service Pages ([PRODUCT / PAGE]):");
      for (const p of pages) {
        lines.push(`- [PRODUCT / PAGE] "${p.title}" -> ${p.url}`);
      }
    }
    if (posts.length > 0) {
      lines.push("Related Blog Articles ([BLOG POST]):");
      for (const p of posts) {
        lines.push(`- [BLOG POST] "${p.title}" -> ${p.url}`);
      }
    }
    return lines.join("\n");
  }

  if (lockedLinks.length > 0) {
    return [
      ...lines,
      "Weave 1 to 3 internal links in context and front-load linked phrases in the opening half of sentences; never dump links at the end of a paragraph.",
    ].join("\n");
  }

  return "INTERNAL LINKS: keep any existing <a href> links intact in context; do not invent URLs or service-area URLs.";
}
