import { prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import {
  isEligibleSitemapLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-pool";
import {
  scoreFuzzySitemapCandidate,
  type SitemapFuzzyLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-score";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export type { SitemapFuzzyLinkCandidate };
export { scoreFuzzySitemapCandidate, isEligibleSitemapLinkCandidate };
export {
  matchStem,
  extractFuzzyMatchTerms,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-score";
export {
  resolveSitemapFuzzyLinkPool,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-pool";

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
