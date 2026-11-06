import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES, LOCAL_ANALYSIS_SAP_MAX, LOCAL_ANALYSIS_SAP_MIN, LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET } from "@/lib/local-analysis-target-constants";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
import { enrichSapRowsWithWikipediaLookupsInBatches, type EntityHintWikiLookup, type LookupEntityHintWikipediaOptions } from "@/lib/wikipedia-api";

export const PER_ROW_SAP_DEFAULT = LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET;
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { groupKeywordTargetRowsInOrder, inheritKeywordTargetEntityHints, keywordTargetsInGenerationOrder, migrateClusterSapToMembers, splitIntegerTotalAcrossMemberSlots } from "@/lib/local-analysis-keyword-cluster";
import { repairSapPageAllocation, type SuggestedKeywordTarget } from "@/lib/local-analysis-suggest-keyword-targets";
import type { EntityTitleClusterKeywordTarget } from "@/lib/local-analysis/entity-sap-title-cluster-jobs";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";

export { DEFAULT_SAP_PAGES };

export type SapGeneratorLocalWorkspaceMode = "connected" | "temp";

export type LocalAnalysisWorkspaceControls = {
  mode: SapGeneratorLocalWorkspaceMode;
  onModeChange: (m: SapGeneratorLocalWorkspaceMode) => void;
  tempSeedUrl: string;
  onTempSeedUrlChange: (v: string) => void;
  showConnectedToggle: boolean;
  connectedSiteUrl: string | null;
  onPickTempFromConnected: () => void;
};

export type WikiCellState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; lookup: EntityHintWikiLookup }
  | { status: "error" };

export async function enrichSapRowsWithWikiLinks(
  rows: CSVRow[],
  options: LookupEntityHintWikipediaOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<{ enriched: CSVRow[]; wikiByIndex: Record<number, WikiCellState> }> {
  const total = rows.length;
  let done = 0;
  const enriched = await enrichSapRowsWithWikipediaLookupsInBatches(rows, options, 12);
  const wikiByIndex: Record<number, WikiCellState> = {};
  for (let gIdx = 0; gIdx < enriched.length; gIdx++) {
    wikiByIndex[gIdx] = sapRowToWikiCellState(enriched[gIdx]!);
    done += 1;
    onProgress?.(done, total);
  }
  return { enriched, wikiByIndex };
}

/** Build Wikipedia cell state from enriched SAP row (URLs from `enrichSapRowsWithWikipediaLookups*`). */
export function sapRowToWikiCellState(row: CSVRow): WikiCellState {
  const url = row.wikipedia_url?.trim();
  const title = row.wikipedia_title?.trim();
  if (url && title) {
    return { status: "done", lookup: { kind: "exact", title, url } };
  }
  const entity = (row.entity ?? "").trim();
  if (!entity.length) return { status: "idle" };
  return { status: "done", lookup: { kind: "none", searchedQuery: entity } };
}

export const SAP_COUNT_MIN = LOCAL_ANALYSIS_SAP_MIN;
export const SAP_COUNT_MAX = LOCAL_ANALYSIS_SAP_MAX;
/** Soft warning when a large unfiltered grid may include many competitor rows. */

export const LA_SESSION_KEY = (siteId: string) => `neo-pulse.local-analysis.v1.${siteId}`;

export function newTargetRowId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** SAP rows worth showing instead of preload slots (post-Clusters or titled generate). */
export function sapRowsHaveDisplayContent(rows: readonly CSVRow[]): boolean {
  return rows.some(
    (r) =>
      Boolean(r.title?.trim()) ||
      Boolean(r.keyword?.trim()) ||
      Boolean((r.entity ?? "").trim()),
  );
}

export interface KeywordTargetRow {
  id: string;
  keyword: string;
  /** Optional geographic/service-area hint for SAP rows for this keyword; blank = model chooses from grid. */
  entityHint: string;
  sapPages: number;
  /** Semantic cluster: members inherit seed Wikipedia; omitted = single-row cluster. */
  clusterId?: string;
  clusterRole?: "seed" | "member";
}

export type NormalizedKeywordTarget = {
  id: string;
  keyword: string;
  sapPages: number;
  entityHint?: string;
  clusterId?: string;
  clusterRole?: "seed" | "member";
};

export function normalizeKeywordTargets(rows: KeywordTargetRow[]): {
  targets: NormalizedKeywordTarget[];
  total: number;
} {
  const migrated = migrateClusterSapToMembers(rows);
  const inherited = inheritKeywordTargetEntityHints(migrated) as KeywordTargetRow[];
  const hasMemberByCluster = new Set<string>();
  for (const r of inherited) {
    if (r.clusterRole === "member" && r.clusterId?.trim()) hasMemberByCluster.add(r.clusterId.trim());
  }
  const targets = inherited
    .map((r) => {
      const keyword = r.keyword.trim();
      const hint = normalizeEntityHintCommaLabel(r.entityHint ?? "");
      const isMember = r.clusterRole === "member";
      const cid = r.clusterId?.trim();
      const seedWithMembers = !isMember && cid != null && hasMemberByCluster.has(cid);
      const sapPages = isMember
        ? Math.min(SAP_COUNT_MAX, Math.max(SAP_COUNT_MIN, Math.floor(r.sapPages) || 0))
        : seedWithMembers
          ? 0
          : Math.min(SAP_COUNT_MAX, Math.max(SAP_COUNT_MIN, Math.floor(r.sapPages) || SAP_COUNT_MIN));
      const base: NormalizedKeywordTarget = {
        id: r.id,
        keyword,
        sapPages,
        ...(hint.length > 0 ? { entityHint: hint } : {}),
      };
      if (r.clusterId) base.clusterId = r.clusterId;
      if (r.clusterRole) base.clusterRole = r.clusterRole;
      return base;
    })
    .filter((r) => r.keyword.length > 0);
  const total = targets.reduce((s, t) => s + t.sapPages, 0);
  return { targets, total };
}

export function sapBearingTargetsForAllocation(targets: NormalizedKeywordTarget[]): NormalizedKeywordTarget[] {
  const rowsForGrouping: KeywordTargetRow[] = targets.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    clusterId: t.clusterId,
    clusterRole: t.clusterRole,
  }));
  const groups = groupKeywordTargetRowsInOrder(rowsForGrouping);
  const out: NormalizedKeywordTarget[] = [];
  for (const g of groups) {
    if (g.members.length > 0) {
      for (const m of g.members) {
        const nt = targets.find((x) => x.id === m.id);
        if (nt) out.push(nt);
      }
    } else if (g.seed.keyword.trim() && (Math.floor(g.seed.sapPages) || 0) > 0) {
      const nt = targets.find((x) => x.id === g.seed.id);
      if (nt) out.push(nt);
    }
  }
  return out;
}

export function mergeRepairedSapBearingIntoTargets(
  allTargets: NormalizedKeywordTarget[],
  sapBearing: NormalizedKeywordTarget[],
  repaired: SuggestedKeywordTarget[]
): NormalizedKeywordTarget[] {
  if (repaired.length === sapBearing.length) {
    const byId = new Map(sapBearing.map((t, i) => [t.id, repaired[i]!.sapPages]));
    return allTargets.map((t) => (byId.has(t.id) ? { ...t, sapPages: byId.get(t.id)! } : t));
  }
  const totalRepaired = repaired.reduce((s, r) => s + r.sapPages, 0);
  if (totalRepaired <= 0 || sapBearing.length === 0) return allTargets;
  const splits = splitIntegerTotalAcrossMemberSlots(
    totalRepaired,
    sapBearing.length,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX
  );
  const byId = new Map(sapBearing.map((t, i) => [t.id, splits[i]!]));
  return allTargets.map((t) => (byId.has(t.id) ? { ...t, sapPages: byId.get(t.id)! } : t));
}

/** Map suggest API rows to panel rows; normalize (0→1 for lone seeds) then repair down to wand budget if needed. */
export function keywordTargetsFromSuggestResult(
  result: SuggestedKeywordTarget[],
  maxSapBudget: number,
): KeywordTargetRow[] {
  const rows: KeywordTargetRow[] = result.map((t) => ({
    id: newTargetRowId(),
    keyword: t.keyword,
    entityHint: t.clusterRole === "member" ? "" : (t.entityHint ?? ""),
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
  const { targets, total } = normalizeKeywordTargets(rows);
  if (targets.length === 0) return rows;
  const sapBearing = sapBearingTargetsForAllocation(targets);
  if (sapBearing.length === 0) return rows;
  if (total === maxSapBudget) {
    return targets.map((t) => ({
      id: t.id,
      keyword: t.keyword,
      entityHint: t.entityHint ?? "",
      sapPages: t.sapPages,
      ...(t.clusterId ? { clusterId: t.clusterId } : {}),
      ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
    }));
  }
  const repaired = repairSapPageAllocation(
    sapBearing.map((t) => ({
      keyword: t.keyword,
      sapPages: t.sapPages,
      ...(t.entityHint ? { entityHint: t.entityHint } : {}),
      ...(t.clusterId ? { clusterId: t.clusterId } : {}),
      ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
    })),
    maxSapBudget,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX,
  );
  const merged = mergeRepairedSapBearingIntoTargets(targets, sapBearing, repaired);
  return merged.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
}

export function keywordTargetsForApi(targets: NormalizedKeywordTarget[]): { keyword: string; sapPages: number; entityHint?: string }[] {
  return targets
    .filter((t) => t.sapPages > 0)
    .map(({ keyword, sapPages, entityHint }) => ({
      keyword,
      sapPages,
      ...(entityHint != null && entityHint.length > 0 ? { entityHint } : {}),
    }));
}

export function keywordTargetRowsToTitleTargets(rows: KeywordTargetRow[]): EntityTitleClusterKeywordTarget[] {
  return rows.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
}

/** Slots from OpenRouter cluster targets — entity is the OpenRouter neighbourhood label only. */
export function previewRowsFromKeywordTargets(
  rows: KeywordTargetRow[],
  maxBudget: number,
): { rows: CSVRow[]; seedKeywords: string[] } {
  const ordered = keywordTargetsInGenerationOrder(
    rows.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      entityHint: r.entityHint ?? "",
      sapPages: r.sapPages,
      ...(r.clusterId ? { clusterId: r.clusterId } : {}),
      ...(r.clusterRole ? { clusterRole: r.clusterRole } : {}),
    })),
  ) as KeywordTargetRow[];
  const { targets } = normalizeKeywordTargets(ordered);
  const out: CSVRow[] = [];
  const seedKeywords: string[] = [];
  for (const t of targets) {
    if (!t.keyword.trim() || t.sapPages <= 0) continue;
    const entity = normalizeEntityHintCommaLabel((t.entityHint ?? "").trim());
    if (!entity) {
      throw new Error(`Cluster target missing neighbourhood entity for keyword «${t.keyword}».`);
    }
    for (let p = 0; p < t.sapPages; p++) {
      out.push({
        keyword: "",
        entity,
        title: "",
        modifier: "",
        featuredImage: "google-maps",
      });
      seedKeywords.push(t.keyword);
      if (out.length >= maxBudget) return { rows: out, seedKeywords };
    }
  }
  return { rows: out, seedKeywords };
}

/** First row index in `apiTargets` that shares the cluster and is not a member (seed). */
export function seedRowIndexForTargetTi(apiTargets: NormalizedKeywordTarget[], ti: number): number {
  const row = apiTargets[ti];
  if (!row) return ti;
  const cid = row.clusterId?.trim();
  if (cid) {
    const idx = apiTargets.findIndex((x) => x.clusterId?.trim() === cid && x.clusterRole !== "member");
    if (idx >= 0) return idx;
  }
  return ti;
}

