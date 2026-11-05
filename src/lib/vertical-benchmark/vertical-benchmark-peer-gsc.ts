import type { GscTop10CsvRow, VerticalBenchmarkContentKind } from "@/lib/vertical-benchmark/vertical-benchmark-types";
import {
  normalizeGscPositionForTokens,
  type GscTop10RagPage,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-rag";
import { normalizeInventoryUrl } from "@/lib/vertical-benchmark/vertical-benchmark-inventory-gsc";
import { isBlockedContentTopicPhrase } from "@/lib/content-topic-blocklist";
import { QUARTER_EDITORIAL_POSTS_GOAL } from "@/lib/quarter-editorial-gap";

export const BENCHMARK_BLOG_COUNT_MIN = 0;
export const BENCHMARK_BLOG_COUNT_MAX = 50;
export const BENCHMARK_BLOG_COUNT_DEFAULT = QUARTER_EDITORIAL_POSTS_GOAL;

export function clampBenchmarkBlogCount(n: number): number {
  if (!Number.isFinite(n)) return BENCHMARK_BLOG_COUNT_MIN;
  return Math.max(BENCHMARK_BLOG_COUNT_MIN, Math.min(BENCHMARK_BLOG_COUNT_MAX, Math.floor(n)));
}

const KEYWORD_FILLER = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "in",
  "on",
  "with",
  "vs",
  "versus",
  "how",
  "what",
  "why",
  "best",
  "guide",
  "complete",
  "explained",
  "diy",
  "steps",
  "safely",
]);

/** Keyword pulled from a peer GSC URL path (last segment). */
export function keywordFromPeerGscUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last).replace(/[-_]+/g, " ").trim();
  } catch {
    return url.trim();
  }
}

function stemPickToken(token: string): string {
  if (token === "removal") return "remove";
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

/** Same keyword string once (case, order, filler words). */
export function uniquePeerKeywordKey(keyword: string): string {
  return keyword
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !KEYWORD_FILLER.has(t))
    .map(stemPickToken)
    .sort()
    .join(" ");
}

/** Best GSC blog URLs from other sites, ranked by clicks, unique by keyword. */
export function pickBestPeerGscPages(args: {
  targetSiteId: string;
  rows: GscTop10CsvRow[];
  count: number;
  contentKind?: VerticalBenchmarkContentKind;
}): GscTop10RagPage[] {
  const kind = args.contentKind ?? "post";
  const count = clampBenchmarkBlogCount(args.count);
  const seenUrls = new Set<string>();
  const seenKeywords = new Set<string>();
  const ranked = args.rows
    .filter((row) => row.content_kind === kind && row.site_id !== args.targetSiteId)
    .sort((a, b) => {
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return b.impressions - a.impressions;
    });

  const pages: GscTop10RagPage[] = [];
  for (const row of ranked) {
    const urlKey = normalizeInventoryUrl(row.url);
    const keyword = keywordFromPeerGscUrl(row.url);
    if (isBlockedContentTopicPhrase(row.url, keyword)) continue;
    const keywordKey = uniquePeerKeywordKey(keyword) || keyword.trim().toLowerCase();
    if (!urlKey || !keywordKey || seenUrls.has(urlKey) || seenKeywords.has(keywordKey)) continue;
    seenUrls.add(urlKey);
    seenKeywords.add(keywordKey);
    pages.push({
      rank: pages.length + 1,
      url: row.url,
      clicks: row.clicks,
      impressions: row.impressions,
      position: normalizeGscPositionForTokens(row.position),
      content_kind: row.content_kind,
    });
    if (pages.length >= count) break;
  }
  return pages;
}
