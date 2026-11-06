import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { CompetitorKeywordRow } from "@/lib/competitor-research/types";

export type SeedRankedKeywordsResponse = {
  seedDomain: string;
  database: string;
  dataSource: string;
  seedTopKeywords: CompetitorKeywordRow[];
  errors?: { step: string; message: string }[];
};

/**
 * DataForSEO Labs ranked organic keywords for the seed domain (server: one ranked_keywords call).
 * Used by Local Analysis AI suggest to align targets with phrases the site actually ranks for.
 */
export async function fetchSeedRankedKeywordsForSite(siteUrl: string): Promise<SeedRankedKeywordsResponse> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/api/dataforseo/seed-ranked-keywords`;
  const res = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ siteUrl: siteUrl ?? "" }),
  });
  const j = (await res.json()) as { error?: string } & Partial<SeedRankedKeywordsResponse>;
  if (!res.ok) {
    throw new Error(j.error || `Seed ranked keywords failed (${res.status})`);
  }
  return {
    seedDomain: typeof j.seedDomain === "string" ? j.seedDomain : "",
    database: typeof j.database === "string" ? j.database : "dfs",
    dataSource: typeof j.dataSource === "string" ? j.dataSource : "dfs",
    seedTopKeywords: Array.isArray(j.seedTopKeywords) ? j.seedTopKeywords : [],
    errors: j.errors,
  };
}
