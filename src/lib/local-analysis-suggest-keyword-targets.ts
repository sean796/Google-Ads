import { LOCAL_ANALYSIS_SAP_MIN } from "@/lib/local-analysis-target-constants";
import type { ClusterRole } from "@/lib/local-analysis-keyword-cluster";

export interface SuggestedKeywordTarget {
  keyword: string;
  sapPages: number;
  /** Optional service-area / neighborhood hint for local SAP rows. */
  entityHint?: string;
  /** Semantic group: one Wikipedia anchor per cluster (seed row). */
  clusterId?: string;
  clusterRole?: ClusterRole;
}

type SapRowInput = {
  keyword: string;
  sapPages: number;
  entityHint?: string;
  clusterId?: string;
  clusterRole?: ClusterRole;
};

function normalizeSapRowInput(r: {
  keyword: unknown;
  sapPages: unknown;
  entityHint?: unknown;
  clusterId?: unknown;
  clusterRole?: unknown;
}): SapRowInput {
  const keyword = String(r.keyword ?? "");
  const sapPages = Math.floor(Number(r.sapPages));
  const raw = r.entityHint;
  const hint = typeof raw === "string" ? raw.trim() : "";
  const cid = typeof r.clusterId === "string" && r.clusterId.trim().length > 0 ? r.clusterId.trim() : undefined;
  const cr = r.clusterRole === "seed" || r.clusterRole === "member" ? r.clusterRole : undefined;
  const base: SapRowInput = hint.length > 0 ? { keyword, sapPages, entityHint: hint } : { keyword, sapPages };
  if (cid) base.clusterId = cid;
  if (cr) base.clusterRole = cr;
  return base;
}

/**
 * Deterministically assign integer SAP page counts per keyword so the sum equals `total`,
 * with each count in [min, max]. Drops excess keyword rows if needed, or duplicates the last
 * keyword row until enough capacity exists to absorb `total`.
 */
export function repairSapPageAllocation(
  rows: SapRowInput[],
  total: number,
  min: number,
  max: number
): SuggestedKeywordTarget[] {
  if (total < LOCAL_ANALYSIS_SAP_MIN) {
    throw new Error(`Total must be at least ${LOCAL_ANALYSIS_SAP_MIN}.`);
  }
  const floor = Math.min(min, total);

  let cleaned = rows.map(normalizeSapRowInput).filter((r) => r.keyword.length > 0);

  if (cleaned.length === 0) {
    throw new Error("No valid keywords in suggestion.");
  }

  while (cleaned.length > 1 && cleaned.length * floor > total) {
    cleaned = cleaned.slice(0, -1);
  }

  if (cleaned.length * floor > total) {
    const one = cleaned[0]!;
    return [
      {
        keyword: one.keyword,
        sapPages: Math.min(max, Math.max(floor, total)),
        ...(one.entityHint ? { entityHint: one.entityHint } : {}),
        ...(one.clusterId ? { clusterId: one.clusterId } : {}),
        ...(one.clusterRole ? { clusterRole: one.clusterRole } : {}),
      },
    ];
  }

  const out: SapRowInput[] = [...cleaned];
  while (out.length > 0 && out.length * max < total) {
    const ref = out[out.length - 1]!;
    out.push({
      keyword: ref.keyword,
      sapPages: min,
      ...(ref.entityHint ? { entityHint: ref.entityHint } : {}),
      ...(ref.clusterId ? { clusterId: ref.clusterId } : {}),
      ...(ref.clusterRole ? { clusterRole: ref.clusterRole } : {}),
    });
  }

  if (out.length * max < total) {
    throw new Error("Cannot allocate SAP pages within per-keyword limits.");
  }

  const n = out.length;
  const pages = Array.from({ length: n }, () => floor);
  let rem = total - n * floor;
  let guard = 0;
  while (rem > 0 && guard < total * n + 20) {
    guard++;
    for (let i = 0; i < n && rem > 0; i++) {
      if (pages[i]! < max) {
        pages[i]!++;
        rem--;
      }
    }
    if (pages.every((p) => p >= max) && rem > 0) {
      throw new Error("Failed to normalize SAP page allocation.");
    }
  }

  if (rem !== 0) {
    throw new Error("Failed to normalize SAP page allocation.");
  }

  return out.map((r, i) => ({
    keyword: r.keyword,
    sapPages: pages[i]!,
    ...(r.entityHint ? { entityHint: r.entityHint } : {}),
    ...(r.clusterId ? { clusterId: r.clusterId } : {}),
    ...(r.clusterRole ? { clusterRole: r.clusterRole } : {}),
  }));
}

function weightsAreUniform(weights: number[]): boolean {
  if (weights.length === 0) return true;
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  return hi - lo < 1e-9;
}

/** Integer split of `rem` proportional to `weights` (largest remainder). */
function distributeRemainderByWeights(weights: number[], rem: number): number[] {
  const n = weights.length;
  if (n === 0 || rem <= 0) return Array.from({ length: n }, () => 0);
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return Array.from({ length: n }, () => 0);
  const raw = weights.map((w) => (rem * w) / sumW);
  const floors = raw.map((r) => Math.floor(r));
  const s = floors.reduce((a, b) => a + b, 0);
  const leftover = rem - s;
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i]! }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < leftover; k++) {
    floors[order[k]!.i]!++;
  }
  return floors;
}

/**
 * Like `repairSapPageAllocation`, but assigns the remainder after `min` using `weights`
 * (higher weight → more SAP pages), respecting `max` per row.
 */
export function repairSapPageAllocationWeighted(
  rows: SapRowInput[],
  weights: number[],
  total: number,
  min: number,
  max: number
): SuggestedKeywordTarget[] {
  if (total < LOCAL_ANALYSIS_SAP_MIN) {
    throw new Error(`Total must be at least ${LOCAL_ANALYSIS_SAP_MIN}.`);
  }
  const floor = Math.min(min, total);

  let cleaned = rows.map(normalizeSapRowInput).filter((r) => r.keyword.length > 0);

  if (cleaned.length === 0) {
    throw new Error("No valid keywords in suggestion.");
  }

  let w = weights.slice(0, cleaned.length).map((x) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  while (w.length < cleaned.length) w.push(1);

  while (cleaned.length > 1 && cleaned.length * floor > total) {
    cleaned = cleaned.slice(0, -1);
    w = w.slice(0, cleaned.length);
  }

  if (cleaned.length * floor > total) {
    const one = cleaned[0]!;
    return [
      {
        keyword: one.keyword,
        sapPages: Math.min(max, Math.max(floor, total)),
        ...(one.entityHint ? { entityHint: one.entityHint } : {}),
        ...(one.clusterId ? { clusterId: one.clusterId } : {}),
        ...(one.clusterRole ? { clusterRole: one.clusterRole } : {}),
      },
    ];
  }

  const out: SapRowInput[] = [...cleaned];
  const wOut = [...w];
  while (out.length > 0 && out.length * max < total) {
    const ref = out[out.length - 1]!;
    out.push({
      keyword: ref.keyword,
      sapPages: floor,
      ...(ref.entityHint ? { entityHint: ref.entityHint } : {}),
      ...(ref.clusterId ? { clusterId: ref.clusterId } : {}),
      ...(ref.clusterRole ? { clusterRole: ref.clusterRole } : {}),
    });
    wOut.push(wOut[wOut.length - 1] ?? 1);
  }

  if (out.length * max < total) {
    throw new Error("Cannot allocate SAP pages within per-keyword limits.");
  }

  const n = out.length;
  if (weightsAreUniform(wOut)) {
    return repairSapPageAllocation(out, total, min, max);
  }

  const pages = Array.from({ length: n }, () => floor);
  const rem = total - n * floor;
  const extras = distributeRemainderByWeights(wOut, rem);
  for (let i = 0; i < n; i++) {
    pages[i]! += extras[i]!;
  }

  // Enforce max: spill overflow back into the pool and reassign to slots under max by weight.
  let overflow = 0;
  for (let i = 0; i < n; i++) {
    if (pages[i]! > max) {
      overflow += pages[i]! - max;
      pages[i] = max;
    }
  }
  while (overflow > 0) {
    let bestI = -1;
    let bestW = -Infinity;
    for (let i = 0; i < n; i++) {
      if (pages[i]! >= max) continue;
      const wi = wOut[i]!;
      if (wi > bestW || (wi === bestW && (bestI < 0 || i < bestI))) {
        bestW = wi;
        bestI = i;
      }
    }
    if (bestI < 0) {
      throw new Error("Failed to normalize weighted SAP page allocation (max cap).");
    }
    pages[bestI]!++;
    overflow--;
  }

  const sumPages = pages.reduce((a, b) => a + b, 0);
  if (sumPages !== total) {
    throw new Error("Failed to normalize weighted SAP page allocation.");
  }

  return out.map((r, i) => ({
    keyword: r.keyword,
    sapPages: pages[i]!,
    ...(r.entityHint ? { entityHint: r.entityHint } : {}),
    ...(r.clusterId ? { clusterId: r.clusterId } : {}),
    ...(r.clusterRole ? { clusterRole: r.clusterRole } : {}),
  }));
}
