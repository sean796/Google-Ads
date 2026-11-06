import { sortKeywordsByTrafficThenVolume } from "@/lib/competitor-research/competitor-keyword-sort";
import type { CompetitorKeywordRow } from "@/lib/competitor-research/types";

export const MAX_SEMANTIC_CLUSTERS = 25;

export function normalizePhraseKey(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merge rows that share the same normalized phrase so each exact `phrase` is unique.
 * Sums volume/traffic; position is best (lowest). Model output is then aligned via
 * `repairClustersToCanonicalPartition` (fuzzy match to these phrases).
 */
export function dedupeKeywordRowsForClustering(rows: CompetitorKeywordRow[]): CompetitorKeywordRow[] {
  type Acc = {
    phrase: string;
    volumeSum: number;
    volumeAny: boolean;
    trafficSum: number;
    trafficAny: boolean;
    positions: number[];
  };
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    const k = normalizePhraseKey(r.phrase);
    if (!k) continue;
    if (!byKey.has(k)) {
      byKey.set(k, {
        phrase: r.phrase.trim(),
        volumeSum: 0,
        volumeAny: false,
        trafficSum: 0,
        trafficAny: false,
        positions: [],
      });
    }
    const acc = byKey.get(k)!;
    if (r.volume != null && Number.isFinite(r.volume)) {
      acc.volumeSum += r.volume;
      acc.volumeAny = true;
    }
    if (r.traffic != null && Number.isFinite(r.traffic)) {
      acc.trafficSum += r.traffic;
      acc.trafficAny = true;
    }
    if (r.position != null && Number.isFinite(r.position)) {
      acc.positions.push(r.position);
    }
  }
  const merged: CompetitorKeywordRow[] = [];
  for (const acc of byKey.values()) {
    merged.push({
      phrase: acc.phrase,
      volume: acc.volumeAny ? acc.volumeSum : null,
      traffic: acc.trafficAny ? acc.trafficSum : null,
      position: acc.positions.length > 0 ? Math.min(...acc.positions) : null,
    });
  }
  return sortKeywordsByTrafficThenVolume(merged);
}

function rowByPhraseMap(rows: CompetitorKeywordRow[]): Map<string, CompetitorKeywordRow> {
  const m = new Map<string, CompetitorKeywordRow>();
  for (const r of rows) {
    const k = normalizePhraseKey(r.phrase);
    if (!k) continue;
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}

/** Build multiset pools: exact phrase string -> stack of rows (consumes duplicates). */
function buildPhrasePools(rows: CompetitorKeywordRow[]): Map<string, CompetitorKeywordRow[]> {
  const m = new Map<string, CompetitorKeywordRow[]>();
  for (const r of rows) {
    const p = r.phrase;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(r);
  }
  return m;
}

export type RawSemanticCluster = { label: string; members: string[] };

/** Levenshtein distance on Unicode code units (fine for short keyword phrases). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n]!;
}

function phraseMatchScore(modelMember: string, canonicalPhrase: string): number {
  const a = normalizePhraseKey(modelMember);
  const b = normalizePhraseKey(canonicalPhrase);
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  return levenshtein(a, b);
}

/**
 * Prefer normalized exact match; else smallest Levenshtein if within a loose cap (typos/spacing).
 * Returns -1 when no safe match (phrase stays in pool for a singleton cluster).
 */
function pickBestPoolIndexForModelMember(modelMember: string, pool: string[]): number {
  if (pool.length === 0) return -1;
  const nm = normalizePhraseKey(modelMember);
  for (let i = 0; i < pool.length; i++) {
    if (normalizePhraseKey(pool[i]!) === nm) return i;
  }
  let bestIdx = -1;
  let best = Infinity;
  for (let i = 0; i < pool.length; i++) {
    const s = phraseMatchScore(modelMember, pool[i]!);
    if (s < best) {
      best = s;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return -1;
  const pk = normalizePhraseKey(pool[bestIdx]!);
  const cap = Math.max(2, Math.floor(Math.max(nm.length, pk.length, 1) * 0.35));
  return best <= cap ? bestIdx : -1;
}

/**
 * Maps model cluster members to canonical INPUT phrases (fuzzy), consumes each input phrase at most once,
 * adds missing phrases as singleton clusters, drops extra model members when pool is exhausted,
 * merges down to MAX_SEMANTIC_CLUSTERS if needed. Does not throw for count/spelling drift.
 */
/** Exported for unit tests; maps model output to canonical INPUT phrases without throwing. */
export function repairClustersToCanonicalPartition(
  clusters: RawSemanticCluster[] | undefined,
  inputRows: CompetitorKeywordRow[],
): RawSemanticCluster[] {
  if (inputRows.length === 0) {
    return [];
  }
  const pool: string[] = inputRows.map((r) => r.phrase);
  const repaired: RawSemanticCluster[] = [];

  if (clusters && Array.isArray(clusters)) {
    for (const c of clusters) {
      if (!c || typeof c.label !== "string" || !Array.isArray(c.members)) continue;
      const label = c.label.trim() || "Cluster";
      const members: string[] = [];
      const seenNorm = new Set<string>();
      for (const m of c.members) {
        if (typeof m !== "string" || pool.length === 0) continue;
        const mn = normalizePhraseKey(m);
        if (mn && seenNorm.has(mn)) continue;
        const idx = pickBestPoolIndexForModelMember(m, pool);
        if (idx < 0) continue;
        const picked = pool[idx]!;
        seenNorm.add(normalizePhraseKey(picked));
        members.push(picked);
        pool.splice(idx, 1);
      }
      if (members.length > 0) {
        repaired.push({ label, members });
      }
    }
  }

  for (const p of pool) {
    const t = p.trim();
    repaired.push({ label: t || "Keyword", members: [p] });
  }

  if (repaired.length > MAX_SEMANTIC_CLUSTERS) {
    return mergeClustersDownToMax(repaired, MAX_SEMANTIC_CLUSTERS);
  }
  return repaired;
}

function mergeClustersDownToMax(clusters: RawSemanticCluster[], max: number): RawSemanticCluster[] {
  if (clusters.length <= max) return clusters;
  const c = clusters.map((x) => ({ label: x.label.trim(), members: [...x.members] }));
  while (c.length > max) {
    const last = c.pop()!;
    const prev = c.pop()!;
    c.push({
      label: `${prev.label} · ${last.label}`.slice(0, 220),
      members: [...prev.members, ...last.members],
    });
  }
  return c;
}

function aggregateCluster(label: string, members: string[], pools: Map<string, CompetitorKeywordRow[]>): CompetitorKeywordRow {
  let volSum = 0;
  let trSum = 0;
  let volAny = false;
  let trAny = false;
  const positions: number[] = [];
  const take = new Map<string, number>();

  for (const m of members) {
    const stack = pools.get(m);
    const idx = take.get(m) ?? 0;
    if (!stack || idx >= stack.length) {
      throw new Error(`Keyword clustering: internal pool miss for phrase "${m}".`);
    }
    take.set(m, idx + 1);
    const row = stack[idx]!;
    if (row.volume != null && Number.isFinite(row.volume)) {
      volSum += row.volume;
      volAny = true;
    }
    if (row.traffic != null && Number.isFinite(row.traffic)) {
      trSum += row.traffic;
      trAny = true;
    }
    if (row.position != null && Number.isFinite(row.position)) {
      positions.push(row.position);
    }
  }

  const bestPos = positions.length > 0 ? Math.min(...positions) : null;

  return {
    phrase: label.trim(),
    volume: volAny ? volSum : null,
    traffic: trAny ? trSum : null,
    position: bestPos,
    clusterMembers: members.slice(),
  };
}

export function clustersToRows(clusters: RawSemanticCluster[], inputRows: CompetitorKeywordRow[]): CompetitorKeywordRow[] {
  const repaired = repairClustersToCanonicalPartition(clusters, inputRows);
  const pools = buildPhrasePools(inputRows);
  return repaired.map((c) => aggregateCluster(c.label.trim(), c.members, pools));
}

/** @deprecated Legacy one-row-per-cluster validator; kept for tests that import it. */
export function validateClusterPicksAgainstInput(
  picks: CompetitorKeywordRow[] | undefined,
  allowed: CompetitorKeywordRow[],
  max: number,
): CompetitorKeywordRow[] {
  const map = rowByPhraseMap(allowed);
  const out: CompetitorKeywordRow[] = [];
  const seen = new Set<string>();
  for (const row of picks ?? []) {
    const k = normalizePhraseKey(row.phrase);
    if (!k || seen.has(k)) continue;
    const canon = map.get(k);
    if (!canon) continue;
    seen.add(k);
    out.push(canon);
    if (out.length >= max) break;
  }
  return out;
}
