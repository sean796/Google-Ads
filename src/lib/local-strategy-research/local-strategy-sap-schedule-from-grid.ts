import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import type {
  CompetitorResearchSemrushResponse,
  GscSiteQueryRow,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import {
  extractContentOpportunityMatrixRows,
} from "@/lib/competitor-research/competitor-report-keyword-extract";
import type { GridKeywordWeight } from "@/lib/process-local-dominator-upload";
import {
  defaultSeedEntityHintFromGrid,
  wikipediaSearchAugmentFromGridRows,
  type LocalDominatorRow,
} from "@/lib/local-dominator-csv";
import { buildSapRowsFromGridDirectWithWikiPool } from "@/lib/local-strategy-research/build-sap-rows-from-grid-direct";
import { fetchLocalSeoStrategyFromGrid, type LocalKeywordTarget } from "@/lib/local-seo-strategy-from-grid";
import {
  LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS,
  buildLocalStrategySapKeywordTargets,
  buildLocalStrategySapKeywordTargetsFromGrid,
  buildLocalStrategySapKeywordTargetsFromProposalMatrix,
  buildWeightedKeywordPoolForSap,
  matchGridWeightForSapKeyword,
} from "@/lib/local-strategy-research/local-strategy-sap-keyword-targets";

export {
  LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS,
  buildLocalStrategySapKeywordTargets,
  buildLocalStrategySapKeywordTargetsFromGrid,
  buildLocalStrategySapKeywordTargetsFromProposalMatrix,
  buildWeightedKeywordPoolForSap,
  matchGridWeightForSapKeyword,
};
/**
 * Markdown evidence block for SAP (competitor organic grid: tiers, traffic, sample keywords).
 * Passed as `supplementalUserEvidenceMarkdown` with manual SAP prompts so the model sees competitor data without requiring a Dominator grid schema.
 * Exposed for tests and optional UI/debug.
 */
export function buildLocalStrategyCompetitorGridSummaryMarkdown(args: {
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  geoLabel?: string | null;
}): string {
  const lines: string[] = [];
  lines.push("## Organic competitor grid (DataForSEO Labs)");
  if (args.geoLabel?.trim()) {
    lines.push(`- **Market / geo label:** ${args.geoLabel.trim()}`);
  }
  lines.push(`- **Seed domain:** ${args.semrush.seedDomain}`);
  const seedKw = (args.semrush.seedTopKeywords ?? [])
    .slice(0, 8)
    .map((r) => r.phrase?.trim())
    .filter(Boolean);
  if (seedKw.length) {
    lines.push(`- **Seed keyword samples:** ${seedKw.join("; ")}`);
  }
  for (const g of args.tiers.tiers) {
    lines.push(`### ${g.label} (${g.tier})`);
    for (const c of g.competitors) {
      const dk = normalizeCompetitorDomainKey(c.domain);
      const row = (args.semrush.rows ?? []).find((r) => normalizeCompetitorDomainKey(r.domain) === dk);
      const traf = row?.organicTraffic ?? " - ";
      const okw = row?.organicKeywords ?? " - ";
      const top = args.semrush.enrichmentByDomain?.[dk]?.topKeywords ?? [];
      const topPhrases = top
        .slice(0, 5)
        .map((k) => k.phrase?.trim())
        .filter(Boolean)
        .join("; ");
      lines.push(
        `- **${dk}** - AI relevance ${typeof c.score === "number" ? c.score : " - "}; organic traffic ${traf}; organic kw ${okw}${topPhrases ? `. Top phrases: ${topPhrases}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}


export type RunLocalStrategySapScheduleParams = {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  siteId?: string;
  siteName: string;
  siteUrl?: string | null;
  entityLocation?: string | null;
  semrush: CompetitorResearchSemrushResponse;
  tiers: TieredCompetitorsResult;
  selectedDomainKeys: Set<string>;
  gscQueries?: GscSiteQueryRow[];
  geoLabel?: string | null;
  signal?: AbortSignal;
  /** Total SAP bulk rows (default: {@link LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS}). */
  targetTotal?: number;
  /** Non-empty after processing a Local Dominator grid CSV - enables grid system prompt + weighted targets when weights exist. */
  gridSummaryMarkdown?: string | null;
  gridPlaceHints?: string[];
  gridKeywordWeights?: GridKeywordWeight[];
  /**
   * When set with a parseable Content Opportunity Matrix, SAP keyword targets can come from that matrix (with optional
   * grid weights for allocation). **Proposal** uses `proposalGridOnly` instead - do not pass matrix markdown for entity SAP.
   */
  proposalCompetitorReportMarkdown?: string | null;
  /**
   * When true: require a parseable Content Opportunity Matrix in `proposalCompetitorReportMarkdown` and **do not** fall
   * back to grid/Semrush keyword pools if matrix parsing fails.
   */
  proposalStrictMatrix?: boolean;
  /**
   * Proposal entity SAP: **only** the Local Dominator grid path - `gridSummaryMarkdown` is used as-is (no trim), keyword
   * targets from `buildLocalStrategySapKeywordTargetsFromGrid` only; throws if grid text or weights missing (no Semrush pool).
   */
  proposalGridOnly?: boolean;
  /**
   * When set (from grid CSV import), SAP rows are built **deterministically** from grid pins + local analysis - no OpenRouter
   * JSON for row content. Ignores `apiKey` for that step.
   */
  gridParsedRows?: LocalDominatorRow[];
};

/**
 * SAP-shaped bulk rows: either **direct** from grid pins (no OpenRouter row model) or via `fetchLocalSeoStrategyFromGrid`.
 */
export async function runLocalStrategySapSchedule(
  params: RunLocalStrategySapScheduleParams,
): Promise<{ sapRows: CSVRow[]; usedFallback: boolean; builtFromGridDirect?: boolean }> {
  const targetTotal = params.targetTotal ?? LOCAL_STRATEGY_SAP_SCHEDULE_TOTAL_ROWS;
  const gridParsed = params.gridParsedRows;
  if (gridParsed && gridParsed.length > 0) {
    const sapRows = await buildSapRowsFromGridDirectWithWikiPool({
      rows: gridParsed,
      targetTotal,
      placeHints: params.gridPlaceHints ?? [],
      geoLabel: params.geoLabel ?? null,
      entityLocation: params.entityLocation ?? null,
      semrush: params.semrush,
      tiers: params.tiers,
      apiKey: params.apiKey,
      siteId: params.siteId,
    });
    return { sapRows, usedFallback: false, builtFromGridDirect: true };
  }

  const proposalGridOnly = params.proposalGridOnly === true;
  const gridWeights = params.gridKeywordWeights ?? [];
  const hasGridWeights = gridWeights.length > 0;
  let gridMd: string;
  if (proposalGridOnly) {
    gridMd = params.gridSummaryMarkdown ?? "";
  } else {
    gridMd = params.gridSummaryMarkdown?.trim() ?? "";
  }
  const hasGridMd = gridMd.length > 0;
  const proposalMd = params.proposalCompetitorReportMarkdown?.trim() ?? "";
  const proposalMatrixTablePresent =
    proposalMd.length > 0 && extractContentOpportunityMatrixRows(proposalMd).length > 0;
  const proposalStrict = params.proposalStrictMatrix === true;

  if (proposalStrict) {
    if (!proposalMd) {
      throw new Error("Proposal SAP requires the competitor strategist markdown.");
    }
    if (!proposalMatrixTablePresent) {
      throw new Error(
        "Proposal requires a Content Opportunity Matrix in the competitor report (Traffic & Intent Gaps). Regenerate the competitor strategist section.",
      );
    }
  }

  let proposalKeywordMode = false;
  let keywordTargets: LocalKeywordTarget[];

  if (proposalGridOnly) {
    if (!hasGridMd || !hasGridWeights) {
      throw new Error(
        "Import a Local Dominator grid CSV before generating a proposal - entity SAP uses the grid scan (keywords + rank evidence).",
      );
    }
    keywordTargets = buildLocalStrategySapKeywordTargetsFromGrid({
      gridKeywordWeights: gridWeights,
      placeHints: params.gridPlaceHints ?? [],
      geoLabel: params.geoLabel ?? null,
      entityLocation: params.entityLocation ?? null,
      targetTotal,
    });
  } else if (proposalStrict) {
    keywordTargets = buildLocalStrategySapKeywordTargetsFromProposalMatrix({
      competitorReportMd: proposalMd,
      gridKeywordWeights: gridWeights,
      placeHints: params.gridPlaceHints ?? [],
      geoLabel: params.geoLabel ?? null,
      entityLocation: params.entityLocation ?? null,
      targetTotal,
    });
    proposalKeywordMode = true;
  } else if (proposalMatrixTablePresent) {
    try {
      keywordTargets = buildLocalStrategySapKeywordTargetsFromProposalMatrix({
        competitorReportMd: proposalMd,
        gridKeywordWeights: gridWeights,
        placeHints: params.gridPlaceHints ?? [],
        geoLabel: params.geoLabel ?? null,
        entityLocation: params.entityLocation ?? null,
        targetTotal,
      });
      proposalKeywordMode = true;
    } catch {
      keywordTargets =
        hasGridMd && hasGridWeights
          ? buildLocalStrategySapKeywordTargetsFromGrid({
              gridKeywordWeights: gridWeights,
              placeHints: params.gridPlaceHints ?? [],
              geoLabel: params.geoLabel ?? null,
              entityLocation: params.entityLocation ?? null,
              targetTotal,
            })
          : buildLocalStrategySapKeywordTargets({
              semrush: params.semrush,
              tiers: params.tiers,
              selectedDomainKeys: params.selectedDomainKeys,
              gscQueries: params.gscQueries,
              entityHint: params.geoLabel?.trim() || params.entityLocation?.trim() || null,
              targetTotal,
            });
    }
  } else {
    keywordTargets =
      hasGridMd && hasGridWeights
        ? buildLocalStrategySapKeywordTargetsFromGrid({
            gridKeywordWeights: gridWeights,
            placeHints: params.gridPlaceHints ?? [],
            geoLabel: params.geoLabel ?? null,
            entityLocation: params.entityLocation ?? null,
            targetTotal,
          })
        : buildLocalStrategySapKeywordTargets({
            semrush: params.semrush,
            tiers: params.tiers,
            selectedDomainKeys: params.selectedDomainKeys,
            gscQueries: params.gscQueries,
            entityHint: params.geoLabel?.trim() || params.entityLocation?.trim() || null,
            targetTotal,
          });
  }

  let entityLocation: string | undefined;
  if (hasGridMd) {
    const fromGrid = defaultSeedEntityHintFromGrid(params.gridPlaceHints ?? [], null).trim();
    entityLocation = fromGrid.length > 0 ? fromGrid : undefined;
  } else {
    entityLocation =
      params.entityLocation?.trim() ||
      params.geoLabel?.trim() ||
      undefined;
  }

  const supplementalUserEvidenceMarkdown = buildLocalStrategyCompetitorGridSummaryMarkdown({
    semrush: params.semrush,
    tiers: params.tiers,
    geoLabel: params.geoLabel ?? null,
  });

  const wikipediaSearchAugment =
    params.gridParsedRows?.length ? wikipediaSearchAugmentFromGridRows(params.gridParsedRows) : undefined;

  const result = await fetchLocalSeoStrategyFromGrid({
    apiKey: params.apiKey,
    model: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    topP: params.topP,
    signal: params.signal,
    targetSapCount: targetTotal,
    keywordTargets,
    gridSummaryMarkdown: hasGridMd ? gridMd : "",
    manualTargetsOnly: !hasGridMd,
    supplementalUserEvidenceMarkdown,
    siteName: params.siteName,
    siteUrl: params.siteUrl?.trim() || undefined,
    entityLocation,
    siteId: params.siteId,
    wikipediaSearchAugment,
    proposalKeywordMode,
    proposalGridSap: proposalGridOnly,
    refineSapRowKeywordsWithRag: true,
    gridParsedRows: params.gridParsedRows,
    gridPlaceHints: params.gridPlaceHints,
  });

  return { sapRows: result.sapRows, usedFallback: false };
}
