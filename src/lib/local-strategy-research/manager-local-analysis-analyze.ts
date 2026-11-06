import {
  fetchCompetitorResearchForTab,
  fetchManualCompetitorDomainForTab,
} from "@/lib/competitor-research/competitor-research-fetch";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import { isNonMainCompetitorDomain } from "@/lib/competitor-research/filter-main-competitor-rows";
import {
  fetchCompetitorGscQueries,
  getDefaultGscCompetitorDateRange,
  isGscSiteNotInListFailure,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import { filterMainCompetitorResearchResponse } from "@/lib/competitor-research/filter-main-competitor-rows";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import type {
  CompetitorResearchSemrushResponse,
  GscSiteQueryRow,
  GscCompetitorDateRange,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import type { WordPressSite } from "@/components/integrations/types";
import type { LocalStrategyGmbOauthWire } from "@/lib/local-strategy-research/local-strategy-report-wire";
import {
  fetchLocalStrategyGmbDfsRaw,
  fetchLocalStrategyGmbOauthSnapshot,
} from "@/lib/local-strategy-research/local-strategy-gmb-fetch";
export type ManagerLocalAnalysisAnalyzeParams = {
  /** DataForSEO Labs vs Semrush-enhanced organic fetch */
  semrushEnhanced: boolean;
  seedSiteUrl: string;
  portfolioBlockedHosts: string[];
  neutralResearchWire: boolean;
  tierSiteId?: string;
  tierSiteName?: string;
  /**
   * User-entered business name for GBP (optional). Do not pre-fill with the seed domain here.
   * DataForSEO GMB runs only when this and `geoLabel` are both non-empty (temp), or when `geoLabel` and a
   * resolved keyword exist (connected). No implicit country-from-TLD GMB query when geo is blank.
   */
  businessNameQuery: string;
  geoLabel: string;
  site?: WordPressSite | null;
};

export type ManagerLocalAnalysisAnalyzeResult = {
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  gscQueries: GscSiteQueryRow[];
  gscDateRange: GscCompetitorDateRange | null;
  gscError: string | null;
  gmbDfsRaw: unknown;
  gmbOauth: LocalStrategyGmbOauthWire | null;
};

function parseOneManualCompetitorLine(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.startsWith("#")) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const h = u.hostname.replace(/^www\./i, "");
      return h || null;
    } catch {
      return null;
    }
  }
  const first = (t.split(/[\s,;]/)[0] ?? "").trim();
  if (!first) return null;
  return (
    first
      .split("/")[0]
      ?.replace(/^www\./i, "")
      .trim() || null
  );
}

/**
 * One hostname or URL per line; `#` starts a comment. Dedupes by normalized domain key.
 */
export function parseManualCompetitorDomainLines(text: string): string[] {
  const hosts: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const host = parseOneManualCompetitorLine(line);
    if (!host) continue;
    const dk = normalizeCompetitorDomainKey(host);
    if (!dk || seen.has(dk)) continue;
    seen.add(dk);
    hosts.push(host);
  }
  return hosts;
}

function domainIsPortfolioBlocked(dk: string, blocked: string[]): boolean {
  if (!dk || blocked.length === 0) return false;
  for (const b of blocked) {
    if (!b) continue;
    if (dk === b) return true;
    if (dk.endsWith(`.${b}`)) return true;
  }
  return false;
}

export type ManagerManualCompetitorsOnlyParams =
  ManagerLocalAnalysisAnalyzeParams & {
    /** Hostnames to research (no organic competitor list); must be non-empty. */
    manualHosts: string[];
  };

/**
 * Proposal / Local analysis: load **only** user-listed competitor domains (DataForSEO manual-domain),
 * seed metrics from the seed URL, tier agent, then force those domains into the direct tier.
 */
export async function runManagerManualCompetitorsOnlyAnalyze(
  params: ManagerManualCompetitorsOnlyParams,
): Promise<ManagerLocalAnalysisAnalyzeResult> {
  const {
    semrushEnhanced,
    seedSiteUrl,
    portfolioBlockedHosts,
    neutralResearchWire,
    tierSiteId,
    tierSiteName,
    businessNameQuery,
    geoLabel,
    site,
    manualHosts,
  } = params;

  if (manualHosts.length === 0) {
    throw new Error("Add at least one competitor domain in the manual list.");
  }

  let gscRes: FetchCompetitorGscQueriesResult;
  if (neutralResearchWire) {
    gscRes = { ok: false, dateRange: getDefaultGscCompetitorDateRange(), error: "neutral" };
  } else {
    gscRes = await fetchCompetitorGscQueries({ siteUrl: seedSiteUrl });
  }

  const srRaw = await fetchCompetitorResearchForTab({
    semrushEnhanced,
    siteUrl: seedSiteUrl,
    portfolioBlockedHosts,
    displayLimit: 50,
  });
  const sr = filterMainCompetitorResearchResponse(srRaw);

  let merged: CompetitorResearchSemrushResponse = {
    ...sr,
    rows: [],
    enrichmentByDomain: {},
    domainOrganicCsvByDomain: {},
  };

  const seedKey = normalizeCompetitorDomainKey(seedSiteUrl);
  const importedKeys: string[] = [];
  const failures: string[] = [];

  let mergedRows = [...merged.rows];
  let enrichmentByDomain = { ...(merged.enrichmentByDomain ?? {}) };
  let domainOrganicCsvByDomain = { ...(merged.domainOrganicCsvByDomain ?? {}) };

  for (const host of manualHosts) {
    const dk = normalizeCompetitorDomainKey(host);
    if (!dk || dk === seedKey) continue;
    if (isNonMainCompetitorDomain(host)) {
      failures.push(`${host}: skipped (platform / non-business domain)`);
      continue;
    }
    if (domainIsPortfolioBlocked(dk, portfolioBlockedHosts)) {
      failures.push(`${host}: skipped (portfolio blocklist)`);
      continue;
    }
    try {
      const {
        row,
        enrichment,
        domainOrganicCsv,
        errors: manualErrors,
      } = await fetchManualCompetitorDomainForTab({
        semrushEnhanced,
        domain: host,
        siteUrl: seedSiteUrl,
      });
      if (manualErrors?.length) {
        failures.push(
          `${host}: ${manualErrors.map((e) => e.message).join("; ")}`,
        );
      }
      importedKeys.push(dk);
      const csvRow =
        domainOrganicCsv.trim() ||
        buildDomainOrganicCsvFromKeywordRows(
          enrichment.topKeywords,
          DOMAIN_ORGANIC_CSV_TOP_ROWS,
        );
      const existingIdx = mergedRows.findIndex(
        (r) => normalizeCompetitorDomainKey(r.domain) === dk,
      );
      if (existingIdx >= 0) {
        mergedRows = mergedRows.map((r, i) => (i === existingIdx ? row : r));
      } else {
        mergedRows = [...mergedRows, row];
      }
      enrichmentByDomain = { ...enrichmentByDomain, [dk]: enrichment };
      domainOrganicCsvByDomain = { ...domainOrganicCsvByDomain, [dk]: csvRow };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${host}: ${msg}`);
    }
  }

  merged = {
    ...merged,
    rows: mergedRows,
    enrichmentByDomain,
    domainOrganicCsvByDomain,
  };

  if (merged.rows.length === 0) {
    throw new Error(
      failures.length > 0
        ? `Could not load manual competitors. ${failures.join(" ")}`
        : "Could not load manual competitors.",
    );
  }

  const tieredRaw = await runCompetitorTierAgent(merged, {
    siteId: tierSiteId,
    siteName: tierSiteName,
    seedSiteUrl,
    semrushDatabase: merged.database,
    gscSiteQueries:
      gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined,
    gscDateRange: gscRes.ok ? gscRes.dateRange : null,
  });

  const tiered = mergeGridCompetitorsAsDirectTier(
    tieredRaw,
    importedKeys,
    merged.rows,
    {
      itemRationale:
        "From your manual competitor list (proposal scope: these domains only).",
      summaryNote: ` Manual competitors: ${importedKeys.length} domain(s) classified as direct.`,
    },
  );

  const userBiz = businessNameQuery.trim();
  const userGeo = geoLabel.trim();
  const gmbKeywordConnected =
    userBiz ||
    (neutralResearchWire ? "" : site?.name?.trim()) ||
    normalizeCompetitorDomainKey(seedSiteUrl) ||
    "";
  const shouldFetchGmbDfs =
    userGeo.length > 0 &&
    (neutralResearchWire ? userBiz.length > 0 : gmbKeywordConnected.length > 0);
  const gmbKeywordForDfs = neutralResearchWire ? userBiz : gmbKeywordConnected;

  let gmbDfs: unknown = null;
  let gmbAuth: LocalStrategyGmbOauthWire | null = null;
  try {
    const oauthPromise = neutralResearchWire
      ? Promise.resolve(null)
      : site?.gbpLocationId?.trim()
        ? fetchLocalStrategyGmbOauthSnapshot({
            locationIds: [site.gbpLocationId.trim()],
          })
        : fetchLocalStrategyGmbOauthSnapshot().catch(() => null);

    const [dfsRes, oauthRes] = await Promise.all([
      shouldFetchGmbDfs
        ? fetchLocalStrategyGmbDfsRaw({
            keyword: gmbKeywordForDfs,
            locationName: userGeo,
            websiteUrl: site?.siteUrl?.trim() || seedSiteUrl,
          }).catch(() => null)
        : Promise.resolve(null),
      oauthPromise,
    ]);
    gmbDfs = dfsRes;
    gmbAuth = oauthRes;
  } catch {
    /* gmb optional */
  }

  let gscQueries: GscSiteQueryRow[] = [];
  let gscDateRange: GscCompetitorDateRange | null = null;
  let gscError: string | null = null;

  if (neutralResearchWire) {
    const dr = getDefaultGscCompetitorDateRange();
    const demandGq = buildDemandQueriesFromSeedKeywords(
      sr.seedTopKeywords ?? [],
    );
    gscDateRange = dr;
    gscQueries = demandGq;
    gscError = null;
  } else if (gscRes.ok === false) {
    gscQueries = [];
    gscDateRange = gscRes.dateRange;
    gscError = isGscSiteNotInListFailure(gscRes) ? null : gscRes.error;
  } else {
    gscQueries = gscRes.queries;
    gscDateRange = gscRes.dateRange;
    gscError = null;
  }

  const result: ManagerLocalAnalysisAnalyzeResult = {
    semrush: merged,
    tiers: tiered,
    gscQueries,
    gscDateRange,
    gscError,
    gmbDfsRaw: gmbDfs,
    gmbOauth: gmbAuth,
  };

  return result;
}

/**
 * Same network work as the Manager Local Analysis tab “Analyze” button: organic competitors, GSC, tier agent, optional GBP snapshots.
 * Used by Proposal (auto-run) and by the tab’s manual Analyze.
 */
export async function runManagerLocalAnalysisAnalyze(
  params: ManagerLocalAnalysisAnalyzeParams,
): Promise<ManagerLocalAnalysisAnalyzeResult> {
  const {
    semrushEnhanced,
    seedSiteUrl,
    portfolioBlockedHosts,
    neutralResearchWire,
    tierSiteId,
    tierSiteName,
    businessNameQuery,
    geoLabel,
    site,
  } = params;

  const srRaw = await fetchCompetitorResearchForTab({
    semrushEnhanced,
    siteUrl: seedSiteUrl,
    portfolioBlockedHosts,
    displayLimit: 50,
  });

  const sr = filterMainCompetitorResearchResponse(srRaw);

  let gscRes: FetchCompetitorGscQueriesResult;
  if (neutralResearchWire) {
    gscRes = { ok: false, dateRange: getDefaultGscCompetitorDateRange(), error: "neutral" };
  } else {
    gscRes = await fetchCompetitorGscQueries({ siteUrl: seedSiteUrl });
  }

  const tiered = await runCompetitorTierAgent(sr, {
    siteId: tierSiteId,
    siteName: tierSiteName,
    seedSiteUrl,
    semrushDatabase: sr.database,
    gscSiteQueries:
      gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined,
    gscDateRange: gscRes.ok ? gscRes.dateRange : null,
  });

  const userBiz = businessNameQuery.trim();
  const userGeo = geoLabel.trim();
  /** Resolved keyword for connected mode when user leaves Business name empty (site name or domain). */
  const gmbKeywordConnected =
    userBiz ||
    (neutralResearchWire ? "" : site?.name?.trim()) ||
    normalizeCompetitorDomainKey(seedSiteUrl) ||
    "";
  /** DataForSEO GMB: explicit geo + keyword only (no empty geo with TLD-inferred country). */
  const shouldFetchGmbDfs =
    userGeo.length > 0 &&
    (neutralResearchWire
      ? userBiz.length > 0
      : gmbKeywordConnected.length > 0);
  const gmbKeywordForDfs = neutralResearchWire
    ? userBiz
    : gmbKeywordConnected;

  let gmbDfs: unknown = null;
  let gmbAuth: LocalStrategyGmbOauthWire | null = null;
  try {
    const oauthPromise = neutralResearchWire
      ? Promise.resolve(null)
      : site?.gbpLocationId?.trim()
        ? fetchLocalStrategyGmbOauthSnapshot({
            locationIds: [site.gbpLocationId.trim()],
          })
        : fetchLocalStrategyGmbOauthSnapshot().catch(() => null);

    const [dfsRes, oauthRes] = await Promise.all([
      shouldFetchGmbDfs
        ? fetchLocalStrategyGmbDfsRaw({
            keyword: gmbKeywordForDfs,
            locationName: userGeo,
            websiteUrl: site?.siteUrl?.trim() || seedSiteUrl,
          }).catch(() => null)
        : Promise.resolve(null),
      oauthPromise,
    ]);
    gmbDfs = dfsRes;
    gmbAuth = oauthRes;
  } catch {
    /* gmb optional */
  }

  let gscQueries: GscSiteQueryRow[] = [];
  let gscDateRange: GscCompetitorDateRange | null = null;
  let gscError: string | null = null;

  if (neutralResearchWire) {
    const dr = getDefaultGscCompetitorDateRange();
    const demandGq = buildDemandQueriesFromSeedKeywords(
      sr.seedTopKeywords ?? [],
    );
    gscDateRange = dr;
    gscQueries = demandGq;
    gscError = null;
  } else if (gscRes.ok === false) {
    gscQueries = [];
    gscDateRange = gscRes.dateRange;
    gscError = isGscSiteNotInListFailure(gscRes) ? null : gscRes.error;
  } else {
    gscQueries = gscRes.queries;
    gscDateRange = gscRes.dateRange;
    gscError = null;
  }

  const result: ManagerLocalAnalysisAnalyzeResult = {
    semrush: sr,
    tiers: tiered,
    gscQueries,
    gscDateRange,
    gscError,
    gmbDfsRaw: gmbDfs,
    gmbOauth: gmbAuth,
  };

  return result;
}
