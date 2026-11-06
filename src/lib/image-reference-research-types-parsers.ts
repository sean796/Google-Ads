/**
 * Types, constants, and pure parsers for Google Images reference research.
 */

import type { GoogleImagesSerpItem } from "@/lib/overview/overview-local-image-dfs-normalize";

export const IMAGE_REF_CANDIDATE_LIMIT = 10;
export const IMAGE_REF_FIT_MIN = 0.4;
export const IMAGE_REF_QUALITY_MIN = 0.2;
/** Featured/section classify path: max grounding targets. */
export const IMAGE_REF_MAX_TARGETS = 3;

export const IMAGE_REF_SOLO_MAX_TARGETS = 7;
/** Legacy Solo per-target helper. Intent plan uses per-need pickCount instead. */
export const IMAGE_REF_SOLO_MAX_PER_TARGET = 2;
/** Max place queries after spatial fan-out (same place, different street angles). */
export const IMAGE_REF_PLACE_FANOUT_MAX = 3;
/** Max subject queries after fan-out (identity + action/angles). */
export const IMAGE_REF_SUBJECT_FANOUT_MAX = 3;
/** When a place setting exists, keep subject lean so more slots go to wide street refs. */
export const IMAGE_REF_SUBJECT_WITH_PLACE_MAX = 2;


/** Allocate Solo fan-out caps so backgrounds get enough wide street views. */
export function allocateSoloFanOutCaps(params: {
  hasSubject: boolean;
  hasPlace: boolean;
  maxTargets?: number;
}): { subjectCap: number; placeCap: number } {
  const maxTargets = Math.max(
    1,
    params.maxTargets ?? IMAGE_REF_SOLO_MAX_TARGETS,
  );
  if (params.hasSubject && params.hasPlace) {
    const subjectCap = Math.min(IMAGE_REF_SUBJECT_WITH_PLACE_MAX, maxTargets - 1);
    const placeCap = Math.min(
      IMAGE_REF_PLACE_FANOUT_MAX,
      Math.max(2, maxTargets - subjectCap),
    );
    return { subjectCap, placeCap };
  }
  if (params.hasPlace) {
    return {
      subjectCap: 0,
      placeCap: Math.min(IMAGE_REF_PLACE_FANOUT_MAX, maxTargets),
    };
  }
  return {
    subjectCap: Math.min(IMAGE_REF_SUBJECT_FANOUT_MAX, maxTargets),
    placeCap: 0,
  };
}


export type ImageGroundingKind = "place" | "product" | "howto" | "other";

/** Scene depth role so refs compose as one photo, not separate pasted subjects. */
export type ImageGroundingLayer = "foreground" | "midground" | "background";

export type ImageGroundingTarget = {
  kind: ImageGroundingKind;
  query: string;
  role: string;
  /** Depth role in the final photo. Defaults from kind when omitted. */
  layer?: ImageGroundingLayer;
  /** DataForSEO Google Images location (e.g. Canada, United States). */
  location_name?: string;
  /** What must be visibly true for a candidate photo to satisfy this need. */
  acceptanceBrief?: string;
  /** How many photos to keep for this need (AI-decided). Default 1. */
  pickCount?: number;
};

/** One visual evidence need from intent planning (Solo). */
export type ImageEvidenceNeed = {
  kind: ImageGroundingKind;
  layer: ImageGroundingLayer;
  query: string;
  role: string;
  location_name?: string;
  acceptanceBrief: string;
  /** How many photos to keep for this need (AI-decided). Default 1. */
  pickCount: number;
};

export type ImageEvidencePlan = {
  mode: "abstract" | "grounded";
  needs: ImageEvidenceNeed[];
};

export type ImageGroundingClassification = {
  mode: "abstract" | "grounded";
  targets: ImageGroundingTarget[];
};

export type ImageReferenceResult = {
  dataUrl: string;
  imageUrl: string;
  sourceUrl?: string;
  query: string;
  /** Role label from the grounding target this ref was picked for. */
  role?: string;
  kind: ImageGroundingKind;
  layer: ImageGroundingLayer;
  why: string;
  visualDescription: string;
  fitScore: number;
  qualityScore: number;
  /** What the generator SHOULD copy from this photo. */
  useFromImage?: string[];
  /** What the generator must IGNORE from this photo. */
  ignoreFromImage?: string[];
};

export type ImageReferenceResearchResult = {
  mode: "abstract" | "grounded";
  targets: ImageGroundingTarget[];
  references: ImageReferenceResult[];
  /** Street-side / traffic layout contract derived from place refs. */
  spatialLayout?: string;
};


export type ImageReferenceResearchContext = {
  title?: string;
  purpose?: string;
  sectionHeader?: string;
  sectionContent?: string;
  userPrompt?: string;
  /** Extra free-text (outline, body excerpt). */
  body?: string;
};


export type SoftPick = {
  chosenIndex: number;
  why: string;
  fitScore: number;
  qualityScore: number;
  visualDescription: string;
};

function normalizeUnitScore(raw: number): number {
  let n = raw;
  if (!Number.isFinite(n)) return NaN;
  if (n > 1 && n <= 10) n = n / 10;
  else if (n > 10) n = 1;
  if (n < 0) n = 0;
  return n;
}

export function capGoogleImagesCandidates(
  items: GoogleImagesSerpItem[],
  limit: number = IMAGE_REF_CANDIDATE_LIMIT,
): GoogleImagesSerpItem[] {
  return items.slice(0, Math.max(0, limit));
}

const KIND_SET = new Set<ImageGroundingKind>(["place", "product", "howto", "other"]);
const LAYER_SET = new Set<ImageGroundingLayer>(["foreground", "midground", "background"]);

export function defaultLayerForKind(kind: ImageGroundingKind): ImageGroundingLayer {
  if (kind === "product") return "foreground";
  if (kind === "place") return "background";
  if (kind === "howto") return "midground";
  return "midground";
}

export function parseImageGroundingClassification(
  raw: Record<string, unknown>,
): ImageGroundingClassification {
  const modeRaw = String(raw.mode ?? "").trim().toLowerCase();
  const mode: "abstract" | "grounded" =
    modeRaw === "grounded" ? "grounded" : "abstract";
  const targetsRaw = Array.isArray(raw.targets) ? raw.targets : [];
  const targets: ImageGroundingTarget[] = [];
  for (const row of targetsRaw) {
    if (!row || typeof row !== "object") continue;
    const t = row as Record<string, unknown>;
    const kindRaw = String(t.kind ?? "other").trim().toLowerCase() as ImageGroundingKind;
    const kind = KIND_SET.has(kindRaw) ? kindRaw : "other";
    const query = String(t.query ?? "").trim();
    if (!query) continue;
    const role = String(t.role ?? kind).trim() || kind;
    const layerRaw = String(t.layer ?? "").trim().toLowerCase() as ImageGroundingLayer;
    const layer = LAYER_SET.has(layerRaw) ? layerRaw : defaultLayerForKind(kind);
    const location_name = String(t.location_name ?? "").trim() || undefined;
    const acceptanceBrief = String(t.acceptanceBrief ?? "").trim() || undefined;
    targets.push({ kind, query, role, layer, location_name, acceptanceBrief });
    if (targets.length >= IMAGE_REF_MAX_TARGETS) break;
  }
  if (mode === "grounded" && targets.length === 0) {
    return { mode: "abstract", targets: [] };
  }
  if (mode === "abstract") {
    return { mode: "abstract", targets: [] };
  }
  return { mode, targets };
}

/** Parse Solo evidence-plan needs (query + acceptanceBrief + optional pickCount). No product count cap. */

export function parseImageEvidenceNeeds(
  raw: Record<string, unknown>,
): ImageEvidencePlan {
  const modeRaw = String(raw.mode ?? "").trim().toLowerCase();
  const mode: "abstract" | "grounded" =
    modeRaw === "grounded" ? "grounded" : "abstract";
  const needsRaw = Array.isArray(raw.needs)
    ? raw.needs
    : Array.isArray(raw.targets)
      ? raw.targets
      : [];
  const needs: ImageEvidenceNeed[] = [];
  for (const row of needsRaw) {
    if (!row || typeof row !== "object") continue;
    const t = row as Record<string, unknown>;
    const kindRaw = String(t.kind ?? "other").trim().toLowerCase() as ImageGroundingKind;
    const kind = KIND_SET.has(kindRaw) ? kindRaw : "other";
    const query = String(t.query ?? "").trim();
    if (!query) continue;
    const role = String(t.role ?? kind).trim() || kind;
    const layerRaw = String(t.layer ?? "").trim().toLowerCase() as ImageGroundingLayer;
    const layer = LAYER_SET.has(layerRaw) ? layerRaw : defaultLayerForKind(kind);
    const location_name = String(t.location_name ?? "").trim() || undefined;
    const acceptanceBrief =
      String(t.acceptanceBrief ?? t.acceptance_brief ?? "").trim() ||
      `Photo must clearly satisfy: ${query}`;
    const pickRaw = Number(t.pickCount ?? t.pick_count ?? 1);
    const pickCount =
      Number.isFinite(pickRaw) && pickRaw >= 1 ? Math.floor(pickRaw) : 1;
    needs.push({ kind, layer, query, role, location_name, acceptanceBrief, pickCount });
  }
  if (mode === "grounded" && needs.length === 0) {
    return { mode: "abstract", needs: [] };
  }
  if (mode === "abstract") {
    return { mode: "abstract", needs: [] };
  }
  return { mode, needs };
}

export function evidenceNeedsToTargets(needs: ImageEvidenceNeed[]): ImageGroundingTarget[] {
  return needs.map((n) => ({
    kind: n.kind,
    query: n.query,
    role: n.role,
    layer: n.layer,
    location_name: n.location_name,
    acceptanceBrief: n.acceptanceBrief,
    pickCount: n.pickCount,
  }));
}


export function parseSoftReferencePick(raw: Record<string, unknown>): SoftPick {
  const chosenIndex = Number(raw.chosenIndex);
  let fitScore = Number(raw.fitScore ?? raw.placeMatchConfidence);
  let qualityScore = Number(raw.qualityScore);
  const why = String(raw.why ?? "").trim();
  const visualDescription = String(raw.visualDescription ?? "").trim();
  if (!Number.isFinite(chosenIndex) || chosenIndex < 0) {
    throw new Error("Vision pick missing chosenIndex");
  }
  if (!Number.isFinite(fitScore)) {
    throw new Error("Vision pick missing fitScore");
  }
  fitScore = normalizeUnitScore(fitScore);
  if (!Number.isFinite(qualityScore)) {
    qualityScore = fitScore >= IMAGE_REF_FIT_MIN ? 0.6 : 0.3;
  } else {
    qualityScore = normalizeUnitScore(qualityScore);
  }
  if (!Number.isFinite(qualityScore)) {
    throw new Error("Vision pick missing qualityScore");
  }
  if (!visualDescription) {
    throw new Error("Vision pick missing visualDescription");
  }
  return {
    chosenIndex: Math.floor(chosenIndex),
    why,
    fitScore,
    qualityScore,
    visualDescription,
  };
}

/** Ranked multi-pick for Solo / multi-ref grounding. Falls back to a single chosenIndex. */
export function parseSoftReferenceMultiPick(
  raw: Record<string, unknown>,
  maxRefs: number,
): SoftPick[] {
  const cap = Math.max(1, Math.floor(maxRefs));
  const picksRaw = Array.isArray(raw.picks) ? raw.picks : null;
  if (picksRaw) {
    const out: SoftPick[] = [];
    const seen = new Set<number>();
    for (const row of picksRaw) {
      if (!row || typeof row !== "object") continue;
      try {
        const pick = parseSoftReferencePick(row as Record<string, unknown>);
        if (seen.has(pick.chosenIndex)) continue;
        seen.add(pick.chosenIndex);
        out.push(pick);
        if (out.length >= cap) break;
      } catch {
        // skip invalid row
      }
    }
    if (out.length) return out;
  }
  return [parseSoftReferencePick(raw)].slice(0, cap);
}

function readNumberFieldFromPartialJson(text: string, key: string): number | null {
  const needle = `"${key}"`;
  const i = text.indexOf(needle);
  if (i < 0) return null;
  let j = i + needle.length;
  while (
    j < text.length &&
    (text[j] === " " || text[j] === ":" || text[j] === "\n" || text[j] === "\t" || text[j] === "\r")
  ) {
    j += 1;
  }
  let numStr = "";
  if (text[j] === "-") {
    numStr = "-";
    j += 1;
  }
  while (j < text.length) {
    const ch = text[j]!;
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      numStr += ch;
      j += 1;
      continue;
    }
    break;
  }
  const n = Number(numStr);
  return Number.isFinite(n) ? n : null;
}

export function recoverSoftPickFromPartialText(text: string): SoftPick | null {
  const chosenIndex = readNumberFieldFromPartialJson(text, "chosenIndex");
  if (chosenIndex === null || chosenIndex < 0) return null;
  let fitScore = readNumberFieldFromPartialJson(text, "fitScore");
  if (fitScore === null) {
    fitScore = readNumberFieldFromPartialJson(text, "placeMatchConfidence");
  }
  if (fitScore === null) fitScore = 0.7;
  fitScore = normalizeUnitScore(fitScore);
  let qualityScore = readNumberFieldFromPartialJson(text, "qualityScore");
  if (qualityScore === null) qualityScore = 0.6;
  qualityScore = normalizeUnitScore(qualityScore);
  return {
    chosenIndex: Math.floor(chosenIndex),
    why: "partial vision reply",
    fitScore,
    qualityScore,
    visualDescription: "Match the chosen reference photograph for accurate depiction.",
  };
}

export function softPickPasses(pick: SoftPick): boolean {
  return pick.fitScore >= IMAGE_REF_FIT_MIN && pick.qualityScore >= IMAGE_REF_QUALITY_MIN;
}


export function parseQueryFanOutTargets(
  raw: Record<string, unknown>,
  base: ImageGroundingTarget,
  maxTargets: number,
): ImageGroundingTarget[] {
  const queriesRaw = Array.isArray(raw.queries) ? raw.queries : [];
  const out: ImageGroundingTarget[] = [];
  const seen = new Set<string>();
  const baseQ = base.query.trim().toLowerCase();
  if (baseQ) {
    seen.add(baseQ);
    out.push({
      ...base,
      layer: base.layer || defaultLayerForKind(base.kind),
    });
  }
  for (const row of queriesRaw) {
    if (out.length >= maxTargets) break;
    let query = "";
    let role = "fan-out angle";
    let layer: ImageGroundingLayer = base.layer || defaultLayerForKind(base.kind);
    if (typeof row === "string") {
      query = row.trim();
    } else if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      query = String(o.query ?? "").trim();
      role = String(o.role ?? role).trim() || role;
      const layerRaw = String(o.layer ?? "").trim().toLowerCase() as ImageGroundingLayer;
      if (LAYER_SET.has(layerRaw)) layer = layerRaw;
    }
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: base.kind,
      query,
      role,
      layer,
      location_name: base.location_name,
    });
  }
  return out.slice(0, maxTargets);
}

/** @deprecated Prefer parseQueryFanOutTargets */
export function parsePlaceFanOutTargets(
  raw: Record<string, unknown>,
  base: ImageGroundingTarget,
  maxPlace: number,
): ImageGroundingTarget[] {
  return parseQueryFanOutTargets(raw, { ...base, kind: "place" }, maxPlace);
}

/**
 * Subject fan-out. When namedPerson is true, returned queries replace the primary
 * (identity portrait first) so action-only stock does not crowd out the person.
 */
export function parseSubjectFanOutTargets(
  raw: Record<string, unknown>,
  base: ImageGroundingTarget,
  maxTargets: number,
): ImageGroundingTarget[] {
  const namedPerson = raw.namedPerson === true;
  if (!namedPerson) {
    return parseQueryFanOutTargets(raw, base, maxTargets);
  }
  const queriesRaw = Array.isArray(raw.queries) ? raw.queries : [];
  const out: ImageGroundingTarget[] = [];
  const seen = new Set<string>();
  for (const row of queriesRaw) {
    if (out.length >= maxTargets) break;
    let query = "";
    let role = "subject";
    let layer: ImageGroundingLayer = base.layer || ("foreground" as const);
    if (typeof row === "string") {
      query = row.trim();
    } else if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      query = String(o.query ?? "").trim();
      role = String(o.role ?? role).trim() || role;
      const layerRaw = String(o.layer ?? "").trim().toLowerCase() as ImageGroundingLayer;
      if (LAYER_SET.has(layerRaw)) layer = layerRaw;
    }
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: base.kind,
      query,
      role,
      layer,
      location_name: base.location_name,
    });
  }
  if (!out.length) {
    return parseQueryFanOutTargets(raw, base, maxTargets);
  }
  return out.slice(0, maxTargets);
}

/** Fan out one place setting into spatial Google Images queries (same place, street angles). */
