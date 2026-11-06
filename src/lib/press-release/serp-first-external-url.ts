import { extractDataForSeoSerpBrief } from "@/lib/overview-seo-content-brief";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { mcp_DataForSEO_serp_organic_live_advanced } from "@/lib/mcp-tools";

/** Same URL shape as Overview / bulk SERP helper ([bulk-optimization-missing-seo-research.ts](b:/USE THIS/NEO Pulse/src/hooks/content-optimization/bulk-optimization-missing-seo-research.ts)). */
function serpDumpFilenameUrl(filename: string): string {
  return backendApiUrl(`/dataforseo/serp-dump/${encodeURIComponent(filename)}`);
}

/**
 * Live DataForSEO organic SERP for a keyword; returns the parsed JSON root (tasks/result/items).
 */
export async function fetchSerpRootForKeyword(keyword: string): Promise<unknown | null> {
  const k = keyword.trim();
  if (!k) return null;

  try {
    const json = (await mcp_DataForSEO_serp_organic_live_advanced({
      keyword: k,
      location_name: "United States",
      language_code: "en",
      depth: 10,
      people_also_ask_click_depth: 4,
    })) as Record<string, unknown> | undefined;
    const storedFile =
      (json?.stored_file as string | undefined) ||
      (json?.storedFile as string | undefined) ||
      (json?.storedFilename as string | undefined) ||
      null;
    if (!storedFile || typeof storedFile !== "string") return null;

    const serpRes = await fetch(serpDumpFilenameUrl(storedFile), { headers: neoPulseApiHeaders() });
    if (!serpRes.ok) return null;
    return serpRes.json().catch(() => null);
  } catch {
    return null;
  }
}

function normalizeHostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function targetSiteHostNorm(siteUrl: string): string {
  const raw = siteUrl.trim();
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return normalizeHostFromUrl(withProto);
}

/**
 * First organic result URL that is not on the connected site (hosts compared without leading `www.`).
 * Uses the same organic extraction as [extractDataForSeoSerpBrief](b:/USE THIS/NEO Pulse/src/lib/overview-seo-content-brief.ts).
 */
export function pickFirstExternalOrganicUrl(serpRoot: unknown, siteUrl?: string | null): string | null {
  const list = pickExternalOrganicResults(serpRoot, siteUrl, 1);
  return list[0]?.url ?? null;
}

export type SerpExternalOrganicPick = {
  url: string;
  title: string;
};

/** External organic SERP rows (not on connected site), in rank order. */
export function pickExternalOrganicResults(
  serpRoot: unknown,
  siteUrl?: string | null,
  limit = 3,
): SerpExternalOrganicPick[] {
  const brief = extractDataForSeoSerpBrief(serpRoot);
  const siteNorm = siteUrl?.trim() ? targetSiteHostNorm(siteUrl) : "";
  const out: SerpExternalOrganicPick[] = [];

  for (const row of brief.organic) {
    if (out.length >= limit) break;
    const u = (row.url ?? "").trim();
    if (!u || !/^https?:\/\//i.test(u)) continue;
    const hostNorm = normalizeHostFromUrl(u);
    if (!hostNorm) continue;
    if (siteNorm && hostNorm === siteNorm) continue;
    const title = (row.title ?? "").trim() || hostNorm;
    out.push({ url: u, title: title.slice(0, 75) });
  }
  return out;
}
