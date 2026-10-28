import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { blogPlayLinkInventoryLabel } from "@/lib/bulk/bulk-generation-wp-inventory";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/content-generation/internal-link-routing-rules";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export type InternalLinkCatalogItem = {
  title: string;
  url: string;
  slug?: string;
  collection?: string;
  postType?: string;
  excerpt?: string;
};

export type InternalLinkQuery = {
  id: string;
  query: string;
  anchor: string;
  bucket?: "PAGE" | "BLOG";
};

const SUGGEST_LINK_SYSTEM =
  "You are an internal-linking assistant. Rank inventory numbers for the highlighted query.\n" +
  "Each inventory row is labeled [PAGE] (page-sitemap product, service, or general page) or [BLOG] (blog post).\n" +
  INTERNAL_LINK_INTENT_ROUTING_RULE +
  "\nBrand, product, service, and commercial queries: rank [PAGE] rows only. Informational queries: rank [BLOG] rows only. A query that copies a [PAGE] title: that [PAGE] row.\n" +
  "Always return 1 to 5 inventory numbers from the allowed bucket, ranked closest first. Never return 0. Never return an empty answer. Rank the closest rows in that bucket even when none is a perfect topical match.\n" +
  "Return ONLY a comma-separated list of numbers.\n" +
  "Example: 3,7,12,1,5";

export function normalizeInternalLinkUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

export function formatSuggestLinkInventory(catalog: InternalLinkCatalogItem[]): string {
  return catalog
    .map((item, i) => {
      const title = item.title.trim();
      const excerpt = item.excerpt?.trim() ?? "";
      const label = blogPlayLinkInventoryLabel(item.collection, item.postType);
      let entry = `${i + 1}. [${label}] "${title}"`;
      if (excerpt) entry += ` - ${excerpt.slice(0, 120)}`;
      return entry;
    })
    .join("\n");
}

/** Same as plugin intval(preg_split('/[,\\s]+/', $answer)). Digits only. */
export function parseSuggestLinkNumbers(answer: string): number[] {
  const nums: number[] = [];
  let current = "";
  for (const ch of answer.trim()) {
    if (ch >= "0" && ch <= "9") {
      current += ch;
      continue;
    }
    if (current) {
      nums.push(Number(current));
      current = "";
    }
  }
  if (current) nums.push(Number(current));
  return nums.filter((n) => n > 0);
}

export function pickSuggestLinkUrl(
  numbers: number[],
  catalog: InternalLinkCatalogItem[],
  usedUrls: Set<string>,
): string {
  return pickSuggestLinkUrls(numbers, catalog, usedUrls, 1)[0] ?? "";
}

export function pickSuggestLinkUrls(
  numbers: number[],
  catalog: InternalLinkCatalogItem[],
  usedUrls: Set<string>,
  maxPicks: number,
): string[] {
  if (maxPicks < 1) return [];
  const picks: string[] = [];
  const seen = new Set<number>();
  for (const pick of numbers) {
    if (picks.length >= maxPicks) break;
    if (pick < 1 || pick > catalog.length || seen.has(pick)) continue;
    seen.add(pick);
    const url = catalog[pick - 1]?.url.trim() ?? "";
    if (!url) continue;
    const key = normalizeInternalLinkUrl(url);
    if (usedUrls.has(key)) continue;
    usedUrls.add(key);
    picks.push(url);
  }
  return picks;
}

export async function matchInternalLinkQueriesToCatalog(args: {
  queries: InternalLinkQuery[];
  catalog: InternalLinkCatalogItem[];
  apiKey: string;
  model?: string;
  siteId?: string;
  signal?: AbortSignal;
  /** Default 1. Link-targets harness uses 2 to take the top two ranked inventory picks per query. */
  picksPerQuery?: number;
}): Promise<Map<string, string>> {
  const queries = args.queries.filter((q) => q.query.trim() && q.id.trim());
  if (!queries.length) return new Map();
  if (!args.catalog.length) return new Map();

  const picksPerQuery = Math.max(1, Math.min(5, args.picksPerQuery ?? 1));
  const list = formatSuggestLinkInventory(args.catalog);
  const apiKey = args.apiKey.trim();
  const usedUrls = new Set<string>();
  const out = new Map<string, string>();

  for (const q of queries) {
    let numbers: number[] = [];
    if (apiKey) {
      const { content } = await callOpenRouterChatCompletion({
        apiKey,
        model: getResearchModel(args.siteId),
        system: SUGGEST_LINK_SYSTEM,
        user:
          `Highlighted text: "${q.query.trim()}"\n` +
          (q.bucket ? `Allowed bucket: [${q.bucket}]. Rank only [${q.bucket}] rows.\n` : "") +
          `Must return 1 to 5 inventory numbers from the allowed bucket. Never return 0.\n\n` +
          `Available pages:\n${list}`,
        maxTokens: 1024,
        temperature: 0,
        signal: args.signal,
      });
      numbers = parseSuggestLinkNumbers(content);
    }
    const urls = pickSuggestLinkUrls(numbers, args.catalog, usedUrls, picksPerQuery);
    urls.forEach((url, pickIndex) => {
      const key = pickIndex === 0 ? q.id : `${q.id}~${pickIndex + 1}`;
      out.set(key, url);
    });
  }

  return out;
}
