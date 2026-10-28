import type { WordPressSite } from "@/components/integrations/types";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/content-generation/internal-link-routing-rules";
import {
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
} from "@/lib/content-generation/link-anchor-text-case";
import { overviewSitemapSourcesForSite, pageSitemapXmlUrlForPlay } from "@/lib/overview/overview-sitemap-source";
import { parseSitemap } from "@/lib/wordpress-api/connection";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import { fetchAllOverviewInventoriesParallel } from "@/lib/overview/overview-parallel-inventory-fetch";
import { ensureEntitySiteWarmInventory } from "@/lib/local-analysis/entity-site-warm-cache";
import {
  clearBulkGenerationWpInventoryCache,
  getBulkGenerationWpInventoryEntry,
  getBulkGenerationWpInventoryIfReady,
  seedBulkGenerationWpInventoryFromParallel,
  seedBulkGenerationWpInventoryFromBundle,
  setBulkGenerationWpInventoryEntry,
  type BulkGenerationWpInventory,
} from "@/lib/bulk/bulk-generation-inventory-cache-store";

export {
  INTERNAL_LINK_ANCHOR_MATCH_RULE,
  INTERNAL_LINK_INTENT_ROUTING_RULE,
} from "@/lib/content-generation/internal-link-routing-rules";

export type { BulkGenerationWpInventory };
export {
  getBulkGenerationWpInventoryIfReady,
  seedBulkGenerationWpInventoryFromParallel,
  seedBulkGenerationWpInventoryFromBundle,
};

export type BulkGenerationLinkable = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  collection?: string;
};

const PAGE_COLLECTIONS = new Set(["pages", "page"]);
const POST_COLLECTIONS = new Set(["posts", "post"]);

export function blogPlayLinkInventoryLabel(
  collection?: string,
  postType?: string,
): "PAGE" | "BLOG" {
  const bucket = (collection || postType || "").toLowerCase();
  if (POST_COLLECTIONS.has(bucket) || bucket === "post") return "BLOG";
  return "PAGE";
}

export function isBlogPlayLinkCollection(collection: string | undefined): boolean {
  const c = (collection ?? "").toLowerCase().trim();
  if (!c) return false;
  if (c === "sap" || c.includes("service-area") || c.includes("service_area") || c.includes("entity")) {
    return false;
  }
  return PAGE_COLLECTIONS.has(c) || POST_COLLECTIONS.has(c);
}

export function isServiceAreaUrl(link: string): boolean {
  const n = link.toLowerCase();
  return (
    n.includes("/service-area") ||
    n.includes("/service_area") ||
    n.includes("/service-areas") ||
    n.includes("service-area-sitemap")
  );
}

export function isServiceAreaInventoryRow(input: {
  link?: string;
  collection?: string;
  postType?: string;
}): boolean {
  if (isServiceAreaUrl(input.link ?? "")) return true;
  const bucket = (input.collection || input.postType || "").toLowerCase();
  return bucket === "sap" || bucket.includes("service-area") || bucket.includes("service_area");
}

export function findServiceAreaPageForPlace<
  T extends { title: string; link: string; collection?: string; postType?: string },
>(posts: T[], place: string): { title: string; link: string; anchor: string } | undefined {
  const raw = place.trim();
  if (!raw || !posts.length) return undefined;
  const sap = posts.filter((p) => p.link?.trim() && isServiceAreaInventoryRow(p));
  if (!sap.length) return undefined;
  const placeLower = raw.toLowerCase();
  const short = raw.split(",")[0]?.trim() ?? raw;
  const shortLower = short.toLowerCase();
  const exact =
    sap.find((p) => p.title.trim().toLowerCase() === placeLower)
    || sap.find((p) => p.title.trim().toLowerCase() === shortLower)
    || sap.find((p) => p.title.toLowerCase().includes(shortLower));
  if (!exact) return undefined;
  return { title: exact.title.trim(), link: exact.link.trim(), anchor: short };
}

export function isBlogPlayLinkTarget(input: {
  link?: string;
  collection?: string;
  postType?: string;
}): boolean {
  const link = input.link?.trim() ?? "";
  if (!link || isServiceAreaUrl(link)) return false;
  const bucket = (input.collection || input.postType || "").toLowerCase().trim();
  if (!bucket) return true;
  if (
    bucket === "sap" ||
    bucket.includes("service-area") ||
    bucket.includes("service_area") ||
    bucket.includes("entity")
  ) {
    return false;
  }
  return (
    PAGE_COLLECTIONS.has(bucket) ||
    POST_COLLECTIONS.has(bucket) ||
    bucket === "page" ||
    bucket === "post"
  );
}

export function keepBlogPlayLinkTargets<
  T extends { link?: string; collection?: string; postType?: string },
>(items: T[]): T[] {
  return items.filter(isBlogPlayLinkTarget);
}

export function clearBulkGenerationWpInventory(siteId?: string): void {
  clearBulkGenerationWpInventoryCache(siteId);
}

export function inventoryRowsToWordPressLinkables(rows: SiteInventoryBulkRow[]): BulkGenerationLinkable[] {
  const seen = new Set<string>();
  const out: BulkGenerationLinkable[] = [];
  for (const row of rows) {
    const link = row.url?.trim();
    if (!link) continue;
    const norm = link.toLowerCase().replace(/\/+$/, "");
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      id: row.id ?? 0,
      slug: row.slug ?? "",
      title: row.fields?.title ?? "",
      excerpt: row.fields?.excerpt ?? "",
      link,
      date_gmt: row.date_gmt ?? "",
      collection: row.collection,
    });
  }
  return out;
}

/** Blog Play internal links: pages sitemap first, then post sitemap. Never service-area / SAP. */
export function inventoryRowsToBlogPlayLinkables(rows: SiteInventoryBulkRow[]): BulkGenerationLinkable[] {
  const pages = rows.filter((row) => PAGE_COLLECTIONS.has((row.collection ?? "").toLowerCase()));
  const posts = rows.filter((row) => POST_COLLECTIONS.has((row.collection ?? "").toLowerCase()));
  const untyped = rows.filter((row) => {
    const c = (row.collection ?? "").trim();
    return !c && row.url?.trim() && !isServiceAreaUrl(row.url);
  });
  return inventoryRowsToWordPressLinkables([...pages, ...posts, ...untyped]);
}

function titleFromPageSitemapSlug(url: string): string {
  const slug = url.split("/").filter(Boolean).pop() ?? "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLinkKey(link: string): string {
  return link.trim().toLowerCase().replace(/\/+$/, "");
}

function isPageCollection(collection: string | undefined): boolean {
  return PAGE_COLLECTIONS.has((collection ?? "").toLowerCase());
}

/** Merge page-sitemap.xml URLs into the Play pool as pages. Pages stay first. */
export function mergePageSitemapUrlsIntoBlogPlayLinkables(
  existing: BulkGenerationLinkable[],
  pageSitemapUrls: string[],
): BulkGenerationLinkable[] {
  const byLink = new Map(existing.map((item) => [normalizeLinkKey(item.link), item]));
  const pages: BulkGenerationLinkable[] = [];
  const seen = new Set<string>();
  for (const raw of pageSitemapUrls) {
    const link = raw.trim();
    if (!link || isServiceAreaUrl(link)) continue;
    const key = normalizeLinkKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    const prior = byLink.get(key);
    pages.push({
      id: prior?.id ?? 0,
      slug: prior?.slug || (link.split("/").filter(Boolean).pop() ?? ""),
      title: prior?.title?.trim() || titleFromPageSitemapSlug(link),
      excerpt: prior?.excerpt ?? "",
      link: prior?.link || link,
      date_gmt: prior?.date_gmt ?? "",
      collection: "pages",
    });
  }
  const rest = existing.filter((item) => !seen.has(normalizeLinkKey(item.link)));
  return [...pages, ...rest];
}

export async function loadBlogPlayLinkablesForSite(
  site: WordPressSite,
  rows: SiteInventoryBulkRow[],
): Promise<BulkGenerationLinkable[]> {
  const base = inventoryRowsToBlogPlayLinkables(rows);
  const xmlUrl = pageSitemapXmlUrlForPlay(site);
  if (!xmlUrl) {
    throw new Error("page-sitemap.xml URL is missing for this WordPress site.");
  }
  const parsed = await parseSitemap(site.siteUrl, xmlUrl, site.username, site.appPassword);
  const pageUrls = parsed.urls ?? [];
  const merged = mergePageSitemapUrlsIntoBlogPlayLinkables(base, pageUrls);
  if (!merged.some((item) => isPageCollection(item.collection))) {
    throw new Error("page-sitemap.xml returned no page URLs.");
  }
  return merged;
}

export function formatBlogPlayLinkTargetsPrompt(
  posts: Array<{ title?: string; link?: string; collection?: string; postType?: string }>,
): string {
  const pages: string[] = [];
  const blogs: string[] = [];
  for (const post of posts) {
    const title = (post.title || "").replace(/"/g, "'").trim();
    const url = (post.link || "").trim();
    if (!url) continue;
    if (!isBlogPlayLinkTarget({ link: url, collection: post.collection, postType: post.postType })) continue;
    const bucket = (post.collection || post.postType || "").toLowerCase();
    const line = `- "${title}"`;
    const labeledBlog = POST_COLLECTIONS.has(bucket) || bucket === "post";
    const pathIsBlog = !bucket && url.toLowerCase().includes("/blog/");
    if (labeledBlog || pathIsBlog) blogs.push(line);
    else pages.push(line);
  }
  if (!pages.length && !blogs.length) return "";
  const pageBlock = pages.length ? `PAGES\n${pages.join("\n")}` : "";
  const blogBlock = blogs.length ? `BLOG POSTS\n${blogs.join("\n")}` : "";
  return `
=== INTERNAL LINK TARGETS (page-sitemap.xml first, then blog posts, never service-area) ===
${[pageBlock, blogBlock].filter(Boolean).join("\n\n")}
${INTERNAL_LINK_INTENT_ROUTING_RULE}
Weave that token mid-sentence. Never as the last words of a sentence. Never on bold copy.
Titles from this list only. Do not paste hrefs. URLs resolve after generation.
Forbidden: service-area, city landing, or /service-area/ URLs.
=== END INTERNAL LINK TARGETS ===`;
}

export type LinkTargetPlanEntry = {
  url: string;
  title: string;
  query: string;
  sectionHints: string[];
  suggestedAnchor?: string;
};

export type LinkTargetsPlan = {
  pageTargets: LinkTargetPlanEntry[];
  blogTargets: LinkTargetPlanEntry[];
};

function normLinkPlanSectionTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function allLinkTargetPlanEntries(plan: LinkTargetsPlan): LinkTargetPlanEntry[] {
  return [...plan.pageTargets, ...plan.blogTargets];
}

/** Entries whose sectionHints include this H2 title (normalized match). */
export function linkTargetEntriesForSection(
  plan: LinkTargetsPlan,
  sectionTitle: string,
): LinkTargetPlanEntry[] {
  const key = normLinkPlanSectionTitleKey(sectionTitle);
  if (!key) return [];
  return allLinkTargetPlanEntries(plan).filter((entry) =>
    entry.sectionHints.some((hint) => normLinkPlanSectionTitleKey(hint) === key),
  );
}

/** Per-H2 mandatory block appended to harness section user prompts. */
export function formatLinkTargetsPlanForSection(
  plan: LinkTargetsPlan,
  sectionTitle: string,
): string {
  const entries = linkTargetEntriesForSection(plan, sectionTitle);
  if (!entries.length) return "";

  const lines = entries.map((entry, index) => {
    const anchor = entry.suggestedAnchor?.trim()
      ? ` → anchor "${entry.suggestedAnchor.trim()}"`
      : "";
    return `${index + 1}. [[LINK:${entry.query}|…]] — destination "${entry.title}" (copy query exactly)${anchor}`;
  });

  const assigned = entries.length;

  return `
=== THIS SECTION LINK ASSIGNMENTS (H2: ${sectionTitle.trim()}) ===
You MUST emit ${MIN_INTERNAL_LINKS_PER_BODY_H2} to ${TARGET_INTERNAL_LINKS_PER_BODY_H2} distinct [[LINK:query|anchor]] placeholders in THIS section only (non-negotiable).
First: emit one placeholder for EACH numbered assignment below (copy each query string exactly).
Then: if you still have fewer than ${MIN_INTERNAL_LINKS_PER_BODY_H2} placeholders, add more [[LINK:query|anchor]] from PAGES or BLOG POSTS in the system prompt until you reach at least ${MIN_INTERNAL_LINKS_PER_BODY_H2}.
${lines.join("\n")}
Weave every [[LINK]] mid-sentence in prose and/or table cells. Spread across the section; never dump links after the final period.
=== END THIS SECTION LINK ASSIGNMENTS ===`;
}

function formatLinkTargetsPlanPerSectionSummary(plan: LinkTargetsPlan): string {
  const bySection = new Map<string, LinkTargetPlanEntry[]>();
  for (const entry of allLinkTargetPlanEntries(plan)) {
    for (const hint of entry.sectionHints) {
      const key = hint.trim();
      if (!key) continue;
      const list = bySection.get(key) ?? [];
      list.push(entry);
      bySection.set(key, list);
    }
  }
  if (!bySection.size) return "";
  const blocks: string[] = ["## Per-section link counts (mandatory minimum per body H2)"];
  for (const [title, entries] of bySection) {
    blocks.push(
      `- **${title}**: ${entries.length} assigned queries → emit at least ${Math.min(MIN_INTERNAL_LINKS_PER_BODY_H2, entries.length)} [[LINK]] placeholders (target ${Math.min(TARGET_INTERNAL_LINKS_PER_BODY_H2, entries.length)}).`,
    );
  }
  return blocks.join("\n");
}

export function formatLinkTargetsPlanPrompt(plan: LinkTargetsPlan): string {
  const formatEntries = (entries: LinkTargetPlanEntry[], label: string) => {
    if (!entries.length) return "";
    const lines = entries.map((entry) => {
      const hints =
        entry.sectionHints?.length > 0
          ? ` (sections: ${entry.sectionHints.join("; ")})`
          : "";
      const anchor = entry.suggestedAnchor?.trim()
        ? ` → suggested anchor "${entry.suggestedAnchor.trim()}"`
        : "";
      return `- "${entry.title}" → URL ${entry.url} → query "${entry.query}" (copy query exactly)${anchor}${hints}`;
    });
    return `${label}\n${lines.join("\n")}`;
  };
  const pageBlock = formatEntries(plan.pageTargets, "ASSIGNED PAGE LINKS (product/service/commercial)");
  const blogBlock = formatEntries(plan.blogTargets, "ASSIGNED BLOG LINKS (informational)");
  if (!pageBlock && !blogBlock) return "";
  const perSectionSummary = formatLinkTargetsPlanPerSectionSummary(plan);
  return `
=== LINK TARGETS PLAN (predetermined — use these queries in [[LINK:query|anchor]]) ===
${perSectionSummary ? `${perSectionSummary}\n\n` : ""}${[pageBlock, blogBlock].filter(Boolean).join("\n\n")}
${INTERNAL_LINK_INTENT_ROUTING_RULE}
Every body H2 section (not Overview, not FAQ, not Answer) MUST include ${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} distinct [[LINK:query|anchor]] placeholders. Use every assigned query for that H2 from the per-section summary before reusing queries.
Copy each query string EXACTLY from this plan. Anchor must match suggested anchor casing or share words from the destination title in sentence case (brands capitalized only).
Product, service, and brand terms: use ASSIGNED PAGE LINKS queries only. Informational terms: use ASSIGNED BLOG LINKS queries only.
=== END LINK TARGETS PLAN ===`;
}

/** Pages bucket rows for entity What We Offer table linking. */
export function inventoryRowsToWordPressPagesForOffer(
  rows: SiteInventoryBulkRow[],
): BulkGenerationLinkable[] {
  return inventoryRowsToWordPressLinkables(
    rows.filter((row) => row.collection === "pages"),
  );
}

/**
 * Reads site prefetch cache first (instant when warm). Falls back to prefetch fetch only on cold miss.
 * Pass `{ force: true }` to bypass cache and re-fetch inventory (includes scheduled posts).
 */
export async function ensureBulkGenerationWpInventory(
  site: WordPressSite,
  onProgress?: (message: string) => void,
  options?: { force?: boolean },
): Promise<BulkGenerationWpInventory> {
  const force = options?.force === true;
  if (!force) {
    const existing = getBulkGenerationWpInventoryEntry(site.id);
    if (existing && (existing.rows?.length ?? 0) > 0) {
      return { ...existing, error: undefined };
    }
  } else {
    clearBulkGenerationWpInventory(site.id);
  }

  if (!site.siteUrl?.trim() || !site.username?.trim() || !site.appPassword?.trim()) {
    const empty: BulkGenerationWpInventory = {
      siteId: site.id,
      rows: [],
      fetchedAt: Date.now(),
      error: "WordPress site credentials are required.",
    };
    setBulkGenerationWpInventoryEntry(empty);
    return empty;
  }

  const sourceCount = overviewSitemapSourcesForSite(site).length;
  const prefetchReady = !force && getBulkGenerationWpInventoryIfReady(site.id);
  if (!prefetchReady) {
    onProgress?.(`Loading WordPress site inventory (${sourceCount} sitemap buckets in parallel)…`);
  }

  if (force && site.siteUrl?.trim() && site.username?.trim() && site.appPassword?.trim()) {
    const parallel = await fetchAllOverviewInventoriesParallel(site, {
      includeScheduled: true,
    });
    seedBulkGenerationWpInventoryFromParallel(site, parallel);
    const forced = getBulkGenerationWpInventoryEntry(site.id);
    if (forced && (forced.rows?.length ?? 0) > 0) {
      return { ...forced, error: undefined };
    }
  }

  await ensureEntitySiteWarmInventory(site);
  const cached = getBulkGenerationWpInventoryEntry(site.id);
  if (cached && (cached.rows?.length ?? 0) > 0) {
    return { ...cached, error: undefined };
  }

  const failed: BulkGenerationWpInventory = {
    siteId: site.id,
    rows: [],
    fetchedAt: cached?.fetchedAt ?? Date.now(),
    error: cached?.error ?? "No inventory rows returned.",
  };
  setBulkGenerationWpInventoryEntry(failed);
  return failed;
}

/** Re-export for callers seeding from overview parallel fetch. */
export type { OverviewParallelInventoryResult } from "@/lib/overview/overview-parallel-inventory-fetch";
