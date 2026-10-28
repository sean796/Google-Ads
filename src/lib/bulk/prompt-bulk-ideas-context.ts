import type { WordPressSite } from "@/components/integrations/types";
import {
  fetchCompetitorGscQueries,
  getGscSixMonthCompetitorDateRange,
} from "@/lib/competitor-research/competitor-gsc-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import {
  gscKeywordsForOpenRouter,
  sortGscQueriesByStats,
} from "@/lib/bulk/bulk-gsc-site-queries";
import { parseContentBucketRichRows } from "@/lib/bulk/inventory-json-slim";
import {
  buildPromptBulkKwConnectedSiteContext,
  type PromptBulkKwConnectedSiteContext,
} from "@/lib/bulk/prompt-bulk-kw-research-agent";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
  type EntitySiteWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";

/** Top GSC query strings for Prompt Ideas (last 6 months, stats-sorted). */
export const PROMPT_IDEAS_GSC_LIMIT = 500;

export type PromptBulkIdeasContext = {
  siteInventoryJson: string;
  gscKeywords: string[];
  connectedSite: PromptBulkKwConnectedSiteContext;
  inventoryUrlCount: number;
  isReady: boolean;
};

type InventoryPost = {
  slug: string;
  title: string;
  link: string;
};

function richRowsToPosts(
  rows: Array<{ url?: string; fields?: { title?: string; keyword?: string } }>,
): InventoryPost[] {
  const out: InventoryPost[] = [];
  for (const row of rows) {
    const link = row.url?.trim() ?? "";
    if (!link) continue;
    const title = row.fields?.title?.trim() || row.fields?.keyword?.trim() || link;
    const slug =
      link
        .replace(/^https?:\/\/[^/]+\//i, "")
        .replace(/\/$/, "")
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? "";
    out.push({ slug, title, link });
  }
  return out;
}

function postsFromBucketJson(json: string): InventoryPost[] {
  if (!json.trim()) return [];
  return richRowsToPosts(parseContentBucketRichRows(json));
}

function warmInventoryBucketLegsCommitted(bundle: EntitySiteWarmBundle): boolean {
  const buckets = bundle.inventory.buckets;
  return (
    typeof buckets.pages.json === "string" &&
    typeof buckets.posts.json === "string" &&
    typeof buckets.sap.json === "string"
  );
}

export function promptBulkIdeasContextIsReady(
  bundle: EntitySiteWarmBundle,
  gscKeywordCount: number,
): boolean {
  if (bundle.error) return false;
  if (bundle.counts.inventoryTotal <= 0) return false;
  if (!warmInventoryBucketLegsCommitted(bundle)) return false;
  return gscKeywordCount > 0;
}

export async function fetchPromptIdeasGscQueries(site: WordPressSite): Promise<GscSiteQueryRow[]> {
  const siteUrl = site.siteUrl?.trim();
  if (!siteUrl) {
    throw new Error("Site URL is required to load GSC keywords.");
  }
  const dateRange = getGscSixMonthCompetitorDateRange();
  const res = await fetchCompetitorGscQueries({
    siteUrl,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    rowLimit: PROMPT_IDEAS_GSC_LIMIT,
  });
  if (!res.ok) {
    throw new Error(res.error || "Google Search Console returned no keywords for this site.");
  }
  const queries = sortGscQueriesByStats(res.queries.filter((q) => q.query?.trim()));
  if (queries.length === 0) {
    throw new Error(
      "Google Search Console returned no keywords for this site. Connect GSC and ensure query data exists.",
    );
  }
  return queries.slice(0, PROMPT_IDEAS_GSC_LIMIT);
}

export function buildPromptBulkIdeasContextFromWarm(
  site: WordPressSite,
  bundle: EntitySiteWarmBundle,
  gscQueries: GscSiteQueryRow[],
): PromptBulkIdeasContext | null {
  const connectedSite = buildPromptBulkKwConnectedSiteContext(site);
  if (!connectedSite) return null;

  const buckets = bundle.inventory.buckets;
  const siteInventoryObj = {
    pages: { source: "pages", posts: postsFromBucketJson(buckets.pages.json) },
    posts: { source: "posts", posts: postsFromBucketJson(buckets.posts.json) },
    sap: { source: "sap", posts: postsFromBucketJson(buckets.sap.json) },
  };

  const gscKeywords = gscKeywordsForOpenRouter(gscQueries, PROMPT_IDEAS_GSC_LIMIT);
  const inventoryUrlCount = bundle.counts.inventoryTotal;
  const isReady = promptBulkIdeasContextIsReady(bundle, gscKeywords.length);

  return {
    siteInventoryJson: JSON.stringify(siteInventoryObj),
    gscKeywords,
    connectedSite,
    inventoryUrlCount,
    isReady,
  };
}

/** Loads Pages + Posts + SAP inventory and GSC from the entity site warm cache only. */
export async function resolvePromptBulkIdeasContext(
  site: WordPressSite,
): Promise<PromptBulkIdeasContext> {
  const bundle = await ensureEntitySiteWarmCache(site, { requireGsc: true });
  const gscQueries = gscAllQueriesFromWarmBundle(bundle);
  const ctx = buildPromptBulkIdeasContextFromWarm(site, bundle, gscQueries);
  if (!ctx?.isReady) {
    const detail = bundle.error?.trim();
    throw new Error(
      detail ||
        "Site sitemap inventory and GSC keywords are still loading. Wait for site data to finish warming, then try again.",
    );
  }
  return ctx;
}
