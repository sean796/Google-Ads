import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { getGridContentYear } from "@/lib/sitemap-optimizer/grid-title-year";
import { gridMemberSourceUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import { parseGridTemporalCannibalizationJson } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization-parse";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

export type TemporalCannibalizationExemptResult = {
  clusters: SitemapOptimizerCluster[];
  exemptPostIds: Set<string>;
};

const TEMPORAL_CLUSTER_SYSTEM = `You are a senior SEO strategist reviewing a NEO Pulse redirect redirect CSV.

Your ONLY job: find **time-sliced URL series** that must merge into **one live pillar post** to avoid keyword cannibalization — even when the CSV assigns different new_url destinations per row.

Time-sliced series examples:
- Quarterly updates on the same topic (interest rates Q2/Q3/Q4 across years)
- Tax-season or fiscal-year variants of the same guide
- Dated archive posts that are really the same recurring topic

Rules:
- Group URLs that are the same recurring topic across different time periods into ONE temporal group.
- **Critical:** When legacy URLs share a topic stem (e.g. canadian-interest-rates-q2-2024, q3-2024, q4-2025, q2-2026) but the CSV assigns different destinations (canadian-interest-rates-q2-2026/, cra-prescribed-interest-rate/, etc.), they STILL belong in ONE temporal group.
- A temporal group may exceed 5 URLs — that is intentional.
- Do NOT group unrelated topics that merely share a calendar year.
- pillarSlugStem: one blog slug WITHOUT quarter/month suffix and WITHOUT year (e.g. canadian-interest-rates).
- sectionHeaders: one H2 title per member URL describing that time slice (e.g. "Q3 2024 update", "Q2 2026 update").
- memberPostIds must come ONLY from the catalog — every id exactly once across all groups OR omitted if not temporal.
- URLs that are NOT part of a time-sliced series should be omitted entirely from temporalGroups.
- Return ONLY valid JSON.`;

function buildTemporalCatalog(rows: readonly SitemapOptimizerPostRow[]) {
  return rows.map((r) => ({
    postId: r.postId,
    legacySourceUrl: gridMemberSourceUrl(r),
    csvDestinationUrl: r.url.trim(),
    title: r.title ?? "",
    uploadRowIndex: r.uploadRowIndex ?? 0,
  }));
}

function buildTemporalClustersFromGroups(
  rows: readonly SitemapOptimizerPostRow[],
  groups: ReturnType<typeof parseGridTemporalCannibalizationJson>,
): TemporalCannibalizationExemptResult {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const assigned = new Set<string>();
  const clusters: SitemapOptimizerCluster[] = [];
  const exemptPostIds = new Set<string>();

  let temporalIndex = 0;
  for (const group of groups) {
    const memberPostIds = group.memberPostIds.filter((id) => {
      if (!rowById.has(id) || assigned.has(id)) return false;
      return true;
    });
    if (memberPostIds.length < 2) continue;
    if (!group.pillarSlugStem) continue;
    if (group.sectionHeaders.length < memberPostIds.length) continue;

    temporalIndex += 1;
    const sortedIds = [...memberPostIds].sort((a, b) => {
      const ra = rowById.get(a);
      const rb = rowById.get(b);
      return (ra?.uploadRowIndex ?? 0) - (rb?.uploadRowIndex ?? 0);
    });
    for (const id of sortedIds) {
      assigned.add(id);
      exemptPostIds.add(id);
    }
    const first = rowById.get(sortedIds[0]!);
    clusters.push({
      clusterId: `grid-temporal-${temporalIndex}`,
      label: group.label || first?.title?.trim() || first?.gridTagLabel?.trim() || "Temporal topic pillar",
      intent: "mixed",
      memberPostIds: sortedIds,
      confidence: "high",
      rationale:
        group.rationale ||
        `${sortedIds.length} time-sliced URLs — one live pillar (temporal cannibalization exempt).`,
      temporalPillarSlugStem: group.pillarSlugStem,
      temporalSectionHeaders: group.sectionHeaders.slice(0, memberPostIds.length),
    });
  }

  return { clusters, exemptPostIds };
}

/** Gemini-first temporal series detection — no regex fallback. */
export async function runGridTemporalCannibalizationAgent(
  rows: readonly SitemapOptimizerPostRow[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<TemporalCannibalizationExemptResult> {
  const empty: TemporalCannibalizationExemptResult = { clusters: [], exemptPostIds: new Set() };
  if (!rows.length || !rows.every((r) => r.gridRedirectFromUrl?.trim())) {
    return empty;
  }

  const contentYear = getGridContentYear();
  const catalog = buildTemporalCatalog(rows);
  const user = JSON.stringify({
    task: "detect_temporal_cannibalization_groups",
    contentYear,
    allowedPostIds: catalog.map((c) => c.postId),
    catalog,
    outputSchema: {
      temporalGroups: [
        {
          groupId: "string",
          label: "string",
          memberPostIds: ["postId"],
          pillarSlugStem: "string-without-year-or-quarter",
          sectionHeaders: ["Q2 2024 update"],
          rationale: "string",
        },
      ],
    },
    example: {
      temporalGroups: [
        {
          groupId: "canadian_interest_rates",
          label: "Canadian interest rates",
          memberPostIds: ["wp:91", "wp:89", "wp:78"],
          pillarSlugStem: "canadian-interest-rates",
          sectionHeaders: ["Q2 2024 update", "Q3 2024 update", "Q4 2024 update"],
          rationale:
            "Quarterly interest-rate posts are one recurring series; merge to one pillar with quarter H2 sections.",
        },
      ],
    },
  });

  let content = "";
  try {
    const res = await callOpenRouterChatCompletion({
      apiKey,
      model: getResearchModel(),
      system: TEMPORAL_CLUSTER_SYSTEM,
      user,
      maxTokens: 8000,
      temperature: 0.1,
      responseFormat: { type: "json_object" },
      signal,
    });
    content = res.content ?? "";
  } catch (err) {
    return empty;
  }

  const groups = parseGridTemporalCannibalizationJson(content);
  if (!groups.length) {
    return empty;
  }

  return buildTemporalClustersFromGroups(rows, groups);
}
