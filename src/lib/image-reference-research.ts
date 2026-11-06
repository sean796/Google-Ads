/**
 * Shared Google Images (DataForSEO) reference research for AI image generation.
 * Solo: intent evidence plan → parallel SERP → vision fit vs acceptanceBrief → data URLs.
 * Other modes: classify → SERP → soft vision pick.
 * Does not scrape publisher sites; only DFS Google Images + image file prefetch.
 */

import {
  openRouterVisionChatCompletion,
  parseJsonObjectFromModelText,
  type OpenRouterVisionContentPart,
} from "@/lib/openrouter-vision-chat";
import {
  IMAGE_EVIDENCE_PLAN_RESPONSE_FORMAT,
  IMAGE_GROUNDING_CLASSIFICATION_RESPONSE_FORMAT,
} from "@/lib/image-grounding-classification-schema";
import { getMetaModel, getResearchModel } from "@/lib/optimization-settings-storage";
import {
  type GoogleImagesSerpItem,
} from "@/lib/overview/overview-local-image-dfs-normalize";
import { BACKEND_API_BASE, backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  isWindowTreatmentImageContext,
  WINDOW_TREATMENT_IMAGE_PROMPT_RULES,
} from "@/lib/image-window-treatment-prompt-rules";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";

export const IMAGE_REF_CANDIDATE_LIMIT = 10;
export const IMAGE_REF_FIT_MIN = 0.4;
export const IMAGE_REF_QUALITY_MIN = 0.2;
/** Featured/section classify path: max grounding targets. */
export const IMAGE_REF_MAX_TARGETS = 3;

function groundingClassificationFromModelPayload(args: {
  parsed?: Record<string, unknown>;
  content: string;
}): ImageGroundingClassification {
  if (args.parsed && typeof args.parsed === "object" && !Array.isArray(args.parsed)) {
    return parseImageGroundingClassification(args.parsed);
  }
  const trimmed = args.content.trim();
  if (!trimmed) {
    throw new Error("Image grounding classification returned empty output");
  }
  try {
    return parseImageGroundingClassification(parseJsonObjectFromModelText(trimmed));
  } catch (err) {
    const preview = trimmed.slice(0, 120).replace(/\s+/g, " ");
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail} (preview: ${preview})`);
  }
}
/** Legacy Solo fan-out helper only (allocateSoloFanOutCaps). Intent plan path has no product count cap. */
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

export type PlaceSpatialLayout = {
  /** exterior street/facade vs interior room. */
  settingType: "exterior" | "interior" | "unclear";
  cameraFacing: string;
  namedBuildingSide: string;
  oppositeSide: string;
  trafficLanes: string;
  /** Barriers, railings, fences, walkway separators visible in place refs. */
  barriersFencing: string;
  mustMatch: string[];
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

type SoftPick = {
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

export function parsePlaceSpatialLayout(raw: Record<string, unknown>): PlaceSpatialLayout {
  const mustRaw = Array.isArray(raw.mustMatch) ? raw.mustMatch : [];
  const mustMatch = mustRaw
    .map((m) => String(m ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
  const settingRaw = String(raw.settingType ?? raw.setting_type ?? "")
    .trim()
    .toLowerCase();
  const settingType: PlaceSpatialLayout["settingType"] =
    settingRaw === "interior"
      ? "interior"
      : settingRaw === "exterior"
        ? "exterior"
        : "unclear";
  return {
    settingType,
    cameraFacing: String(raw.cameraFacing ?? "").trim() || "unclear",
    namedBuildingSide: String(raw.namedBuildingSide ?? "").trim() || "unclear",
    oppositeSide: String(raw.oppositeSide ?? "").trim() || "unclear",
    trafficLanes: String(raw.trafficLanes ?? "").trim() || "unclear",
    barriersFencing:
      String(raw.barriersFencing ?? raw.barriers ?? "").trim() || "unclear",
    mustMatch,
  };
}

export function formatSpatialLayoutContract(layout: PlaceSpatialLayout): string {
  const isInterior = layout.settingType === "interior";
  const lines = [
    "SPATIAL LAYOUT CONTRACT (from place reference photos):",
    `Setting type: ${layout.settingType}`,
    `Camera facing: ${layout.cameraFacing}`,
    isInterior
      ? `Primary room side / equipment (viewer perspective): ${layout.namedBuildingSide}`
      : `Named building / structure side (viewer perspective): ${layout.namedBuildingSide}`,
    `Opposite side: ${layout.oppositeSide}`,
    isInterior
      ? `Floor zones / circulation: ${layout.trafficLanes}`
      : `Ground / circulation: ${layout.trafficLanes}`,
    `Barriers / railings / fencing: ${layout.barriersFencing}`,
  ];
  if (layout.mustMatch.length) {
    lines.push("Must match:");
    for (const m of layout.mustMatch) lines.push(`- ${m}`);
  }
  if (isInterior) {
    lines.push(
      "INTERIOR MATCH (critical): the final photo must be THIS room, not a generic similar venue.",
      "Match floor zones/materials, wall finishes, ceiling structure and fixtures, fixed equipment rows/colors, and branding from the place refs.",
      "A logo alone is not enough if the floor plan, walls, and equipment layout disagree with the place refs.",
      "Do not invent a different gym/store layout, different rack colors, or different wall/ceiling materials.",
    );
  } else {
    lines.push(
      "Do not mirror the layout.",
      "Record ground honestly: if place refs show a parking lot, keep a parking lot — do not invent a public roadway or traffic lanes.",
      "Record barriers/railings/fencing exactly as visible in the place photos.",
      "Do not invent concrete jersey barriers, walls, or dividers that are not visible in the place refs.",
      "Prefer place-ref geometry over inventing structures absent from those photos.",
    );
  }
  return lines.join("\n");
}

function parseStringListField(raw: unknown, max = 10): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export type ReferenceUsageGuidance = {
  index: number;
  useFromImage: string[];
  ignoreFromImage: string[];
  summary: string;
};

/** Parse per-ref USE / DO NOT USE guidance from vision JSON. */
export function parseReferenceUsageGuidanceList(
  raw: Record<string, unknown>,
  refCount: number,
): ReferenceUsageGuidance[] {
  const rows = Array.isArray(raw.refs) ? raw.refs : Array.isArray(raw.references) ? raw.references : [];
  const out: ReferenceUsageGuidance[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const index = Number(o.index ?? o.refIndex);
    if (!Number.isFinite(index) || index < 0 || index >= refCount) continue;
    out.push({
      index: Math.floor(index),
      useFromImage: parseStringListField(o.useFromImage ?? o.use),
      ignoreFromImage: parseStringListField(o.ignoreFromImage ?? o.ignore),
      summary: String(o.summary ?? "").trim(),
    });
  }
  return out;
}

export function applyReferenceUsageGuidance(
  references: ImageReferenceResult[],
  guidance: ReferenceUsageGuidance[],
): ImageReferenceResult[] {
  if (!guidance.length) return references;
  return references.map((ref, i) => {
    const g = guidance.find((row) => row.index === i);
    if (!g) return ref;
    return {
      ...ref,
      useFromImage: g.useFromImage.length ? g.useFromImage : ref.useFromImage,
      ignoreFromImage: g.ignoreFromImage.length ? g.ignoreFromImage : ref.ignoreFromImage,
      visualDescription: g.summary || ref.visualDescription,
    };
  });
}

/** Fan-out parser for place or subject targets (preserves base kind/location). */
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
export async function fanOutPlaceSpatialTargets(params: {
  apiKey: string;
  model?: string;
  sceneKeyword: string;
  placeTarget: ImageGroundingTarget;
  maxPlaceTargets?: number;
}): Promise<ImageGroundingTarget[]> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const maxPlace = Math.max(
    1,
    Math.min(params.maxPlaceTargets ?? IMAGE_REF_PLACE_FANOUT_MAX, IMAGE_REF_PLACE_FANOUT_MAX),
  );
  const base = {
    ...params.placeTarget,
    kind: "place" as const,
    layer: params.placeTarget.layer || ("background" as const),
  };

  const system = [
    "You expand ONE place/setting into Google Images queries for spatial layout fidelity.",
    "Keep the SAME city + street + named store/building identity in every query. Do not invent new businesses.",
    "Name the place as street + store + city together: \"Jasper Avenue Save On Foods Edmonton\". Never phrase as \"by Save On Foods\".",
    "Choose additional angles that help depict what the scene keyword needs for this place.",
    "Return compact JSON only:",
    '{"queries":[{"query":"google images query","role":"why","layer":"background"|"midground"}]}',
    `Return up to ${maxPlace - 1} ADDITIONAL queries (the primary setting query already exists).`,
    "Do not invent new businesses. Do not use Avenue-by-StoreName phrasing.",
  ].join(" ");

  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Scene keyword: ${params.sceneKeyword}\nPrimary place query: ${base.query}\nLocation: ${base.location_name || "United States"}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    return [base];
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return [base];
  try {
    return parseQueryFanOutTargets(parseJsonObjectFromModelText(content), base, maxPlace);
  } catch {
    return [base];
  }
}

/** Fan out one foreground subject (person/product) into pose/angle Google Images queries. */
export async function fanOutSubjectTargets(params: {
  apiKey: string;
  model?: string;
  sceneKeyword: string;
  subjectTarget: ImageGroundingTarget;
  maxSubjectTargets?: number;
}): Promise<ImageGroundingTarget[]> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const maxSubject = Math.max(
    1,
    Math.min(
      params.maxSubjectTargets ?? IMAGE_REF_SUBJECT_FANOUT_MAX,
      IMAGE_REF_SUBJECT_FANOUT_MAX,
    ),
  );
  const base = {
    ...params.subjectTarget,
    layer: params.subjectTarget.layer || ("foreground" as const),
  };

  const system = [
    "You expand ONE foreground subject into Google Images queries for accurate depiction.",
    "Keep the SAME subject (named person, generic person, vehicle, product). Do not invent new subjects.",
    "Return compact JSON only:",
    '{"namedPerson":true|false,"queries":[{"query":"google images query","role":"identity|action|angle|primary|detail","layer":"foreground"}]}',
    `Return up to ${maxSubject} queries total in priority order.`,
    "NAMED PERSON (celebrity, public figure, or specific proper name of a real person): set namedPerson true.",
    "When namedPerson is true, queries REPLACE the primary. First query MUST be identity-only (clear face): e.g. \"Steve Buscemi portrait face\" or \"Steve Buscemi headshot\".",
    "Second query may be the person doing the named action (e.g. \"Steve Buscemi riding Segway\") or a generic action pose if needed.",
    "Do NOT return only action variants that omit a dedicated identity/portrait query.",
    "PRODUCT (blinds, vehicle, brand item): set namedPerson false. First query = primary lifestyle/hero product shot. Extra queries = side profile or close-up DETAIL of the SAME product line — role detail or angle. Do not fan out into unrelated product types. NEVER put city, street, or place names into product queries (place refs handle setting).",
    "GENERIC subject (unnamed runner): set namedPerson false. Keep the primary as first; add up to max-1 angle/pose variants.",
    'Example namedPerson: {"namedPerson":true,"queries":[{"query":"Steve Buscemi portrait face","role":"identity","layer":"foreground"},{"query":"Steve Buscemi riding Segway","role":"action","layer":"foreground"}]}',
    'Example product: {"namedPerson":false,"queries":[{"query":"Hunter Douglas blinds living room","role":"primary","layer":"foreground"},{"query":"Hunter Douglas cellular shade close up fabric","role":"detail","layer":"foreground"}]}',
    'Example generic: {"namedPerson":false,"queries":[{"query":"runner jogging toward camera outdoor","role":"angle","layer":"foreground"}]}',
    "Do not turn the subject into a place query.",
  ].join(" ");

  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Scene keyword: ${params.sceneKeyword}\nPrimary subject query: ${base.query}\nKind: ${base.kind}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return [base];
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return [base];
  try {
    return parseSubjectFanOutTargets(parseJsonObjectFromModelText(content), base, maxSubject);
  } catch {
    return [base];
  }
}

async function describePlaceSpatialLayout(params: {
  apiKey: string;
  model: string;
  sceneKeyword: string;
  placeRefs: ImageReferenceResult[];
}): Promise<string | undefined> {
  if (!params.placeRefs.length) return undefined;
  const refs = params.placeRefs.slice(0, 3);
  const parts: OpenRouterVisionContentPart[] = [
    {
      type: "text",
      text: `Full scene keyword: "${params.sceneKeyword}"
Describe the PLACE LAYOUT literally visible in these place reference photos for composing one coherent photograph.
Use settingType "interior" for indoor rooms (gyms, stores, lobbies) and "exterior" for outdoor facades/streets.
Return compact JSON only:
{"settingType":"interior"|"exterior","cameraFacing":"short","namedBuildingSide":"left|right|center — for interior: main equipment/wall side from viewer","oppositeSide":"what is opposite","trafficLanes":"for exterior: ground circulation (parking lot / stalls / roadway). for interior: floor zones/materials as shown (turf lanes, rubber, wood, etc.)","barriersFencing":"barriers/railings/fences/separators if any — say none if none","mustMatch":["short bullet", "..."]}
mustMatch must list durable place identity visible across the place refs (up to 12): for INTERIOR include floor zones, wall finishes, ceiling structure/fixtures, fixed equipment rows/colors, branding/signage walls. for EXTERIOR include facade, signage, ground type.
Never invent geometry not visible. Prefer interior layout when the keyword places the subject inside a named venue and refs are interiors.
Do not ignore interior photos.`,
    },
  ];
  for (let i = 0; i < refs.length; i += 1) {
    const r = refs[i]!;
    parts.push({
      type: "text",
      text: `Place ref[${i}] query="${r.query}" why=${JSON.stringify(r.why)}:`,
    });
    parts.push({ type: "image_url", image_url: { url: r.dataUrl } });
  }

  const rawText = await openRouterVisionChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You extract place layout from place photos for AI image grounding. Handle interiors and exteriors. Never invent geometry not visible. Return only compact valid JSON.",
      },
      { role: "user", content: parts },
    ],
    temperature: 0.1,
    maxTokens: 1400,
  });

  try {
    const layout = parsePlaceSpatialLayout(parseJsonObjectFromModelText(rawText));
    return formatSpatialLayoutContract(layout);
  } catch {
    return undefined;
  }
}

/** Broader per-image USE / DO NOT USE so generation does not copy wrong details. */
async function enrichReferencesUsageGuidance(params: {
  apiKey: string;
  model: string;
  sceneKeyword: string;
  references: ImageReferenceResult[];
}): Promise<ImageReferenceResult[]> {
  if (!params.references.length) return params.references;
  const refs = params.references.slice(0, 6);
  const hasPlaceRef = refs.some(
    (r) => r.kind === "place" || r.layer === "background" || r.layer === "midground",
  );
  const parts: OpenRouterVisionContentPart[] = [
    {
      type: "text",
      text: `Full scene keyword: "${params.sceneKeyword}"
For EACH attached reference photo, write a grounding brief: what the image generator SHOULD copy (USE) vs MUST IGNORE (DO NOT USE).

LITERAL PIXELS ONLY (critical):
- summary, useFromImage, and ignoreFromImage must describe what is ACTUALLY in that photo.
- Never invent geometry or landmarks not visible in the photo.
- Name ground/floors honestly as shown.

Rules by layer/kind:
- Place / background / midground when the keyword names that place: USE the full durable place identity visible in THAT photo — walls, floor zones/materials, ceiling structure and fixtures that belong to the room, signage/branding, fixed equipment rows/colors, facade/exterior as shown. The setting IS what the keyword asks for. DO NOT USE only: watermarks, UI overlays, annotations, photo chrome, and people/actions not required by the keyword. NEVER put authentic place architecture, room lighting fixtures, wall/floor materials, branded fixed equipment, or room layout into ignoreFromImage.
- Foreground subject (person/product/other): USE only identity/appearance cues required by the keyword. ${hasPlaceRef ? "DO NOT USE that photo's foreign background/environment when place refs supply the setting. For product subjects with place refs: USE product identity only; ignore cutout-transplant of the whole subject photo and any incidental details not implied by the keyword." : "DO NOT USE watermarks, logos, UI markup, and incidental details not implied by the keyword."}
- PRODUCT / SAME SUBJECT multi-ref: one primary depiction; detail refs are material cues only — never collage multiple variants.

Return compact JSON only:
{"refs":[{"index":0,"summary":"one line","useFromImage":["detail required by keyword"],"ignoreFromImage":["photo chrome"]}]}
Example when keyword places a person inside a named gym and the photo is that gym interior:
{"index":0,"summary":"named gym interior","useFromImage":["floor zones as shown","wall finishes","ceiling structure/fixtures","fixed equipment rows/colors","place branding"],"ignoreFromImage":["watermarks","incidental people not required by keyword"]}
Example when keyword names a store exterior and the photo is that exterior:
{"index":0,"summary":"named store exterior","useFromImage":["store signage","facade","ground as shown"],"ignoreFromImage":["watermarks","annotations"]}
Example when keyword names a vehicle + place and the product photo has extra incidental content:
{"index":1,"summary":"named vehicle identity only","useFromImage":["vehicle body identity"],"ignoreFromImage":["cutout transplant","foreign background","incidental details not implied by keyword"]}
Index must match Ref[i] order below. Every attached ref needs an entry.`,
    },
  ];
  for (let i = 0; i < refs.length; i += 1) {
    const r = refs[i]!;
    parts.push({
      type: "text",
      text: `Ref[${i}] layer=${r.layer} kind=${r.kind} query="${r.query}" why=${JSON.stringify(r.why)}:`,
    });
    parts.push({ type: "image_url", image_url: { url: r.dataUrl } });
  }

  const rawText = await openRouterVisionChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You write per-reference USE vs DO NOT USE from PIXELS. For named places, USE full durable place identity (interior or exterior); never ignore authentic place architecture, room lights, floors, walls, or fixed equipment. Subject refs: identity only when place refs supply setting. Return only compact valid JSON.",
      },
      { role: "user", content: parts },
    ],
    temperature: 0.1,
    maxTokens: 2500,
  });

  try {
    const guidance = parseReferenceUsageGuidanceList(
      parseJsonObjectFromModelText(rawText),
      refs.length,
    );
    const enriched = applyReferenceUsageGuidance(refs, guidance);
    if (params.references.length <= refs.length) return enriched;
    return [...enriched, ...params.references.slice(refs.length)];
  } catch {
    return params.references;
  }
}

export async function classifyImageGroundingTargets(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
}): Promise<ImageGroundingClassification> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  /** Reasoning research models (e.g. DeepSeek) often ignore JSON mode; meta model handles json_object reliably. */
  const model = getMetaModel();
  const c = params.context;
  const lines: string[] = [];
  if (c.title?.trim()) lines.push(`Title: ${c.title.trim()}`);
  if (c.purpose?.trim()) lines.push(`Purpose: ${c.purpose.trim()}`);
  if (c.sectionHeader?.trim()) lines.push(`Section: ${c.sectionHeader.trim()}`);
  if (c.sectionContent?.trim()) {
    lines.push(`Section content: ${c.sectionContent.trim().slice(0, 800)}`);
  }
  if (c.userPrompt?.trim()) lines.push(`User prompt: ${c.userPrompt.trim().slice(0, 400)}`);
  if (c.body?.trim()) lines.push(`Body: ${c.body.trim().slice(0, 1000)}`);
  if (!lines.length) return { mode: "abstract", targets: [] };

  const system = [
    "You classify whether an AI image needs real-world Google Images reference photos for ONE coherent scene.",
    "Grounded = named places, products/brands, people/actions, or concrete how-to scenes that must look accurate.",
    "Abstract = mood, generic concepts, metaphors, or scenes that do not need a specific real entity.",
    "Return compact JSON only:",
    '{"mode":"abstract"|"grounded","targets":[{"kind":"place"|"product"|"howto"|"other","layer":"foreground"|"midground"|"background","query":"google images query","role":"why this ref","location_name":"Canada"|"United States"|"United Kingdom"|"Australia"}]}',
    `Max ${IMAGE_REF_MAX_TARGETS} targets. Prefer subject + setting when both are named.`,
    "Think like a photograph: foreground = movable subject (person, vehicle, product); background = fixed setting (place).",
    "CRITICAL: if the text names a person/action (person running, jogger, runner), emit a foreground target kind other with a searchable query.",
    "NAMED PERSON: if a specific real person is named (e.g. Steve Buscemi), the foreground query MUST include that full name (e.g. \"Steve Buscemi riding Segway\"). Do not drop the name for a generic stand-in.",
    "Only include entities EXPLICITLY named in the text. Never invent extra businesses or landmarks.",
    "CONTEXT RULE (critical): city + street + named store/building/bridge belong in ONE place/setting query together.",
    "Named stores on a street are the place itself — phrase as \"Jasper Avenue Save On Foods Edmonton\", never \"Jasper Avenue by Save On Foods\". Do not use \"by\" to detach the store from the street.",
    "Do NOT drop the foreground subject when a place is also named.",
    "Return ONLY one JSON object. No prose, markdown, code fences, or explanation before or after the JSON.",
    'Example: "person running across high level bridge when it is about to rain" →',
    '{"mode":"grounded","targets":[{"kind":"other","layer":"foreground","query":"person running jogging","role":"foreground runner","location_name":"United States"},{"kind":"place","layer":"background","query":"High Level Bridge Edmonton pedestrian walkway","role":"bridge setting","location_name":"Canada"}]}',
    'Example: "Steve Buscemi riding a Segway on Whyte Avenue Edmonton" →',
    '{"mode":"grounded","targets":[{"kind":"other","layer":"foreground","query":"Steve Buscemi riding Segway","role":"named person subject","location_name":"United States"},{"kind":"place","layer":"background","query":"Whyte Avenue Edmonton street view","role":"street setting","location_name":"Canada"}]}',
    'Example: "cyber truck in downtown edmonton jasper ave save on foods" →',
    '{"mode":"grounded","targets":[{"kind":"product","layer":"foreground","query":"Tesla Cybertruck","role":"foreground vehicle","location_name":"United States"},{"kind":"place","layer":"background","query":"Jasper Avenue Save On Foods Edmonton","role":"street setting","location_name":"Canada"}]}',
    "Set location_name to the country that best matches the place (Canada for Edmonton, etc.). Subject-only searches may use United States.",
    'If abstract, return {"mode":"abstract","targets":[]}.',
  ].join(" ");

  const { content, parsed } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system,
    user: `Classify grounding needs. Reply with JSON only.\n\n${lines.join("\n")}`,
    temperature: 0,
    maxTokens: 800,
    responseFormat: IMAGE_GROUNDING_CLASSIFICATION_RESPONSE_FORMAT,
  });
  return groundingClassificationFromModelPayload({ parsed, content });
}

function buildContextLines(
  c: ImageReferenceResearchContext,
  options?: { maxBodyChars?: number; maxSectionChars?: number },
): string[] {
  const maxBody = options?.maxBodyChars;
  const maxSection = options?.maxSectionChars ?? 800;
  const lines: string[] = [];
  if (c.title?.trim()) lines.push(`Title: ${c.title.trim()}`);
  if (c.purpose?.trim()) lines.push(`Purpose: ${c.purpose.trim()}`);
  if (c.sectionHeader?.trim()) lines.push(`Section: ${c.sectionHeader.trim()}`);
  if (c.sectionContent?.trim()) {
    const section = c.sectionContent.trim();
    lines.push(
      `Section content: ${
        section.length > maxSection ? `${section.slice(0, maxSection)}...` : section
      }`,
    );
  }
  if (c.userPrompt?.trim()) lines.push(`User prompt: ${c.userPrompt.trim()}`);
  if (c.body?.trim()) {
    const body = c.body.trim();
    if (maxBody === 0 || maxBody === undefined) {
      lines.push(`Body: ${body}`);
    } else {
      lines.push(
        `Body: ${body.length > maxBody ? `${body.slice(0, maxBody)}...` : body}`,
      );
    }
  }
  return lines;
}

/** Never throw: bad model JSON must not block featured image generation. */
function safeParseImageEvidencePlan(
  content: string,
  logLabel: string,
): ImageEvidencePlan {
  try {
    return parseImageEvidenceNeeds(parseJsonObjectFromModelText(content));
  } catch (err) {
    const parseError = err instanceof Error ? err.message : String(err);
    logFeaturedImagePipeline(`Google Image: evidence plan parse skipped (${logLabel})`, {
      parseError,
    });
    return { mode: "abstract", needs: [] };
  }
}

/**
 * Solo intent planner: read the keyword, decide what visual evidence is needed,
 * how many Google queries, and how many photos per need (no fixed quotas).
 */
export async function planImageEvidenceNeeds(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
}): Promise<ImageEvidencePlan> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const lines = buildContextLines(params.context, { maxBodyChars: 1000 });
  if (!lines.length) return { mode: "abstract", needs: [] };

  const system = [
    "You plan Google Images evidence for ONE photorealistic scene from the user keyword.",
    "First infer intent: what must be visually true for the final photo to match the keyword.",
    "Then decide which Google Images searches and how many photos per search are needed. You choose the volume — there is no fixed quota.",
    "Return compact JSON only:",
    '{"mode":"abstract"|"grounded","needs":[{"kind":"place"|"product"|"howto"|"other","layer":"foreground"|"midground"|"background","query":"google images search query","role":"short why","location_name":"Canada"|"United States"|"United Kingdom"|"Australia","acceptanceBrief":"what must be visibly true","pickCount":1}]}',
    "pickCount = how many distinct photos to keep for that need (integer >= 1). Set higher when more angles help.",
    "Grounded = named places, products, people, or concrete scenes. Abstract = mood/metaphor with no specific entity.",
    "Only entities EXPLICITLY named in the text. Never invent businesses or landmarks.",
    "Named store on a street: query as street + store + city together (e.g. \"Jasper Avenue Save On Foods Edmonton\"). Never \"Avenue by StoreName\".",
    "GOOGLE-USER SEARCH RULE: write queries how a real person would type them into Google Images.",
    "When product/equipment/detail is named together with a place, keep place + product in the SAME query (e.g. \"Evolve Strength downtown Edmonton squat rack\"). Never emit a bare generic product query that drops the named place.",
    "Named person: include a need whose acceptanceBrief requires that person's recognizable face when identity matters.",
    "When an action/howto is named separately from a product, keep them as separate needs when useful (action pose vs place-bound product).",
    "acceptanceBrief must state what THIS need requires based on keyword intent only. Anything not implied by the keyword is out of scope for that need.",
    "Do NOT list global reject category blacklists. Relevance is decided later per photo against acceptanceBrief + keyword intent + metadata place match.",
    "Set location_name to the country that best matches the place (Canada for Edmonton). Subject-only may use United States.",
    'Example keyword "person squatting in evolve strength downtown at a squat rack" →',
    '{"mode":"grounded","needs":[{"kind":"place","layer":"background","query":"Evolve Strength downtown Edmonton gym interior","role":"named gym","location_name":"Canada","acceptanceBrief":"Must show Evolve Strength gym interior identity.","pickCount":2},{"kind":"product","layer":"midground","query":"Evolve Strength downtown Edmonton squat rack","role":"rack at that gym","location_name":"Canada","acceptanceBrief":"Must show a squat rack at Evolve Strength (that gym). A generic unrelated gym rack does not satisfy.","pickCount":2},{"kind":"other","layer":"foreground","query":"person squatting barbell back squat","role":"squat action","location_name":"United States","acceptanceBrief":"Must show a person performing a squat as required by the keyword.","pickCount":1}]}',
    'Example keyword "tesla cyber truck in downtown edmonton on jasper ave safeway" →',
    '{"mode":"grounded","needs":[{"kind":"product","layer":"foreground","query":"Tesla Cybertruck","role":"vehicle identity","location_name":"United States","acceptanceBrief":"Must show the named vehicle clearly. Details not implied by the keyword are out of scope.","pickCount":1},{"kind":"place","layer":"background","query":"Safeway Jasper Avenue Edmonton exterior","role":"storefront place","location_name":"Canada","acceptanceBrief":"Must show the named store at the named street/city.","pickCount":2}]}',
  ].join(" ");

  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Plan visual evidence needs for this keyword/context:\n\n${lines.join("\n")}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Evidence plan failed ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { mode: "abstract", needs: [] };
  }
  return safeParseImageEvidencePlan(content, "solo");
}

/** Featured blog/service images: plan DataForSEO Google Images evidence (install context required). */
export async function planFeaturedImageEvidenceNeeds(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
}): Promise<ImageEvidencePlan> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const lines = buildContextLines(params.context, { maxBodyChars: 0 });
  if (!lines.length) {
    return { mode: "abstract", needs: [] };
  }

  const system = [
    "You plan Google Images evidence for ONE WordPress FEATURED blog image (photoreal, 16:9).",
    "Default to grounded mode. Use abstract ONLY when the article is pure metaphor with zero physical subject to photograph.",
    "Home services, products, repairs, installations, equipment, and window/door/HVAC topics MUST be grounded.",
    "Write queries exactly how a user types them into Google Images.",
    "acceptanceBrief MUST require correct install context (e.g. blinds need visible window frame and glazing, not blinds on bare drywall).",
    "Return compact JSON only:",
    '{"mode":"abstract"|"grounded","needs":[{"kind":"place"|"product"|"howto"|"other","layer":"foreground"|"midground"|"background","query":"google images search query","role":"short why","location_name":"Canada"|"United States"|"United Kingdom"|"Australia","acceptanceBrief":"what must be visibly true","pickCount":1}]}',
    "pickCount = integer >= 1. Max 3 needs total.",
    'Example title "Window blind repair" →',
    '{"mode":"grounded","needs":[{"kind":"howto","layer":"midground","query":"white window blinds installed in window frame living room","role":"in-context install","location_name":"United States","acceptanceBrief":"Must show blinds mounted in a real window with frame and glazing; not blinds on solid wall alone.","pickCount":2}]}',
    "Return ONLY one JSON object.",
  ].join(" ");

  const systemWithTopicRules = isWindowTreatmentImageContext(lines.join("\n"))
    ? `${system} ${WINDOW_TREATMENT_IMAGE_PROMPT_RULES}`
    : system;

  /** Meta model + json_schema: DeepSeek often breaks json_object on long featured context. */
  const planModel = getMetaModel();
  try {
    const { content, parsed } = await callOpenRouterChatCompletion({
      apiKey,
      model: planModel,
      system: systemWithTopicRules,
      user: `Plan featured-image Google Images evidence:\n\n${lines.join("\n")}`,
      temperature: 0,
      maxTokens: 1200,
      responseFormat: IMAGE_EVIDENCE_PLAN_RESPONSE_FORMAT,
    });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parseImageEvidenceNeeds(parsed);
    }
    if (typeof content === "string" && content.trim()) {
      return safeParseImageEvidencePlan(content, "featured");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logFeaturedImagePipeline("Google Image: evidence plan LLM failed (continuing without refs)", {
      model: planModel,
      error: detail,
    });
  }
  return { mode: "abstract", needs: [] };
}

async function fetchGoogleImagesForQuery(
  keyword: string,
  locationName?: string,
): Promise<GoogleImagesSerpItem[]> {
  const location_name = (locationName || "").trim() || "United States";
  const res = await fetch(`${BACKEND_API_BASE}/api/dataforseo/google-images`, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      keyword,
      location_name,
      language_code: "en",
      depth: IMAGE_REF_CANDIDATE_LIMIT,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    items?: GoogleImagesSerpItem[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Google Images search failed (${res.status})`);
  }
  return capGoogleImagesCandidates(Array.isArray(data.items) ? data.items : []);
}

async function prefetchImageDataUrl(imageUrl: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(backendApiUrl("/images/fetch-data-url"), {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        url: imageUrl,
        referer: (referer || "").trim() || "https://www.google.com/",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      dataUrl?: string;
    };
    if (!res.ok || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) {
      return null;
    }
    return data.dataUrl;
  } catch {
    return null;
  }
}

async function pickTopReferencesForTarget(params: {
  apiKey: string;
  model: string;
  target: ImageGroundingTarget;
  visionHint: string;
  sceneKeyword: string;
  candidates: GoogleImagesSerpItem[];
  maxRefs?: number;
}): Promise<ImageReferenceResult[]> {
  const maxRefs = Math.max(1, Math.floor(params.maxRefs ?? 1));
  const capped = capGoogleImagesCandidates(params.candidates);
  const usable: Array<{ item: GoogleImagesSerpItem; dataUrl: string }> = [];
  for (const item of capped) {
    const dataUrl = await prefetchImageDataUrl(item.image_url, item.source_url);
    if (dataUrl) usable.push({ item, dataUrl });
  }
  if (!usable.length) return [];

  const metaLines = usable
    .map(
      (c, i) =>
        `[${i}] title=${JSON.stringify(c.item.title)} alt=${JSON.stringify(c.item.alt)} source=${JSON.stringify(c.item.source_url)} image=${JSON.stringify(c.item.image_url)}`,
    )
    .join("\n");

  const multi = maxRefs > 1;
  const layer = params.target.layer || defaultLayerForKind(params.target.kind);
  const acceptance =
    (params.target.acceptanceBrief || "").trim() ||
    `Photo must clearly match search query "${params.target.query}" for layer ${layer} / kind ${params.target.kind} in scene "${params.sceneKeyword || params.visionHint || params.target.query}".`;
  const isProductOrForeground =
    params.target.kind === "product" ||
    layer === "foreground" ||
    params.target.kind === "other";
  const keywordGateLine = isProductOrForeground
    ? `KEYWORD INTENT (critical): prefer candidates that satisfy the acceptanceBrief with as little incidental content as possible. Incidental = anything visible that the scene keyword does not ask for. Never prefer a candidate because of incidental details. If the best match still has incidental content, pick it for the required subject, but in why mark those details as incidental and not required.`
    : "";
  const productFocusLine =
    params.target.kind === "product"
      ? `PRODUCT NEED: prefer candidates where the named product/equipment is the primary subject. People using it are incidental unless this need's acceptanceBrief requires an operator.`
      : "";
  const pickInstructions = multi
    ? `You are a visual evidence agent. Rank up to ${maxRefs} candidates that satisfy THIS need.
Score against: full scene keyword intent, search query, acceptanceBrief, AND candidate metadata (title/alt/source).
PIXELS first: if visible content fails the acceptanceBrief, fitScore MUST be below ${IMAGE_REF_FIT_MIN}.
PLACE DISAMBIGUATION: when the keyword/query names a place, prefer candidates whose metadata is nearer that named place; score down clear wrong-branch/wrong-place addresses even if the brand matches.
${keywordGateLine}
${productFocusLine}
visualDescription must list only what is literally visible — never invent geometry or landmarks not in the photo. In why, note place-metadata match and any incidental content.
Do not apply global scene category blacklists.
Return compact JSON only:
{"picks":[{"chosenIndex":0,"why":"short","fitScore":0.0,"qualityScore":0.0,"visualDescription":"what is actually visible"}]}
fitScore and qualityScore are 0 to 1. Order picks best-first.`
    : `You are a visual evidence agent. Pick the single best candidate that satisfies THIS need.
Score against: full scene keyword intent, search query, acceptanceBrief, AND candidate metadata (title/alt/source).
PIXELS first: if visible content fails the acceptanceBrief, fitScore MUST be below ${IMAGE_REF_FIT_MIN}.
PLACE DISAMBIGUATION: when the keyword/query names a place, prefer candidates whose metadata is nearer that named place; score down clear wrong-branch/wrong-place addresses even if the brand matches.
${keywordGateLine}
${productFocusLine}
visualDescription must list only what is literally visible — never invent geometry or landmarks not in the photo. In why, note place-metadata match and any incidental content.
Do not apply global scene category blacklists.

Return compact JSON only:
{"chosenIndex":0,"why":"short","fitScore":0.0,"qualityScore":0.0,"visualDescription":"what is actually visible"}
fitScore and qualityScore are 0 to 1.`;

  const parts: OpenRouterVisionContentPart[] = [
    {
      type: "text",
      text: `Full scene keyword: "${params.sceneKeyword || params.visionHint || params.target.query}"
Search query (this need): "${params.target.query}"
Kind: ${params.target.kind}
Layer: ${layer}
Role: ${params.target.role}
acceptanceBrief: ${acceptance}
Intended vision: ${params.visionHint || "(from query)"}

Candidates:
${metaLines}

${pickInstructions}`,
    },
  ];
  for (let i = 0; i < usable.length; i += 1) {
    parts.push({ type: "text", text: `Candidate image [${i}]:` });
    parts.push({
      type: "image_url",
      image_url: { url: usable[i]!.dataUrl },
    });
  }

  const rawText = await openRouterVisionChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: [
      {
        role: "system",
        content:
          "You are a visual evidence agent. Score by keyword intent + acceptanceBrief + pixels + place metadata. Prefer less incidental content. No global category blacklists. Soft fit scoring. Return only compact valid JSON" +
          (multi ? " with a picks array." : "."),
      },
      { role: "user", content: parts },
    ],
    temperature: 0.2,
    maxTokens: 4000,
  });

  let picks: SoftPick[];
  try {
    const parsed = parseJsonObjectFromModelText(rawText);
    picks = multi
      ? parseSoftReferenceMultiPick(parsed, maxRefs)
      : [parseSoftReferencePick(parsed)];
  } catch (parseErr) {
    const recovered = recoverSoftPickFromPartialText(rawText);
    if (!recovered) throw parseErr;
    picks = [recovered];
  }

  const out: ImageReferenceResult[] = [];
  for (const pick of picks) {
    if (!softPickPasses(pick)) continue;
    if (pick.chosenIndex < 0 || pick.chosenIndex >= usable.length) continue;
    const chosen = usable[pick.chosenIndex]!;
    const remoteImage = (chosen.item.image_url || "").trim();
    if (!remoteImage.startsWith("http://") && !remoteImage.startsWith("https://")) {
      continue;
    }
    const remotePage = (chosen.item.source_url || "").trim();
    const sourceUrl =
      (remotePage.startsWith("http://") || remotePage.startsWith("https://")) &&
      remotePage !== remoteImage
        ? remotePage
        : undefined;

    out.push({
      dataUrl: chosen.dataUrl,
      imageUrl: remoteImage,
      sourceUrl,
      query: params.target.query,
      role: params.target.role,
      kind: params.target.kind,
      layer: params.target.layer || defaultLayerForKind(params.target.kind),
      why: pick.why,
      visualDescription: pick.visualDescription,
      fitScore: pick.fitScore,
      qualityScore: pick.qualityScore,
    });
    if (out.length >= maxRefs) break;
  }
  return out;
}

function buildVisionHint(context: ImageReferenceResearchContext): string {
  const bits = [
    context.title,
    context.sectionHeader,
    context.userPrompt,
    context.purpose,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return bits.join(" | ").slice(0, 400);
}

/**
 * Research Google Images references for an image generation request.
 * Abstract → empty references. Forced targets skip classification.
 */
export async function researchGoogleImageReferences(params: {
  apiKey: string;
  model?: string;
  context: ImageReferenceResearchContext;
  /** Skip classify; use these targets (e.g. Local Image place entity). */
  forcedTargets?: ImageGroundingTarget[];
  /** When true and no refs found for forced/grounded mode, throw. */
  requireReferences?: boolean;
  /** Photos to keep per target (Solo uses several for the same subject). Default 1. */
  maxReferencesPerTarget?: number;
  /** Cap grounded targets (default IMAGE_REF_MAX_TARGETS). Meta ads pass 5. */
  maxTargets?: number;
  /** Solo: fan out subject + place into Google Images queries. */
  enablePlaceQueryFanOut?: boolean;
  /** Featured blog images: evidence plan + require grounded DataForSEO refs. */
  groundingProfile?: "default" | "featured";
}): Promise<ImageReferenceResearchResult> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found");
  const model = params.model || getResearchModel();
  const soloIntentPlan = Boolean(params.enablePlaceQueryFanOut);
  const featuredProfile = params.groundingProfile === "featured";
  const maxTargets = params.maxTargets ?? IMAGE_REF_MAX_TARGETS;

  let classification: ImageGroundingClassification;
  if (params.forcedTargets?.length) {
    const mapped = params.forcedTargets.map((t) => ({
      ...t,
      layer: t.layer || defaultLayerForKind(t.kind),
      pickCount: Math.max(1, Math.floor(t.pickCount ?? params.maxReferencesPerTarget ?? 1)),
    }));
    classification = {
      mode: "grounded",
      targets: soloIntentPlan ? mapped : mapped.slice(0, maxTargets),
    };
  } else if (soloIntentPlan) {
    const plan = await planImageEvidenceNeeds({
      apiKey,
      model,
      context: params.context,
    });
    classification = {
      mode: plan.mode,
      targets: evidenceNeedsToTargets(plan.needs),
    };
  } else if (featuredProfile) {
    logFeaturedImagePipeline("Google Image: featured evidence plan (LLM)", {
      model: getMetaModel(),
      title: params.context.title,
    });
    const plan = await planFeaturedImageEvidenceNeeds({
      apiKey,
      model,
      context: params.context,
    });
    classification = {
      mode: plan.mode,
      targets: evidenceNeedsToTargets(plan.needs).slice(0, maxTargets),
    };
    logFeaturedImagePipeline("Google Image: evidence plan result", {
      mode: plan.mode,
      needs: plan.needs.map((n) => n.query),
    });
  } else {
    classification = await classifyImageGroundingTargets({
      apiKey,
      model,
      context: params.context,
    });
  }

  if (classification.mode === "abstract" || !classification.targets.length) {
    if (featuredProfile) {
      logFeaturedImagePipeline("Google Image: no grounded targets (continuing without refs)");
    }
    return { mode: "abstract", targets: [], references: [] };
  }

  const visionHint = buildVisionHint(params.context);
  const sceneKeyword =
    [params.context.userPrompt, params.context.title, params.context.body]
      .map((s) => (s ?? "").trim())
      .find(Boolean) || visionHint;

  const targets = soloIntentPlan
    ? classification.targets
    : classification.targets.slice(0, maxTargets);

  const settled = await Promise.all(
    targets.map(async (target) => {
      try {
        if (featuredProfile) {
          logFeaturedImagePipeline("Google Image: DataForSEO search", {
            query: target.query,
            location: target.location_name ?? "United States",
          });
        }
        const candidates = await fetchGoogleImagesForQuery(
          target.query,
          target.location_name,
        );
        if (!candidates.length) {
          if (featuredProfile) {
            logFeaturedImagePipeline("Google Image: no SERP candidates", {
              query: target.query,
            });
          }
          return [] as ImageReferenceResult[];
        }
        const pickCount = Math.max(
          1,
          Math.floor(
            target.pickCount ?? params.maxReferencesPerTarget ?? 1,
          ),
        );
        return await pickTopReferencesForTarget({
          apiKey,
          model,
          target,
          visionHint,
          sceneKeyword,
          candidates,
          maxRefs: pickCount,
        });
      } catch {
        return [] as ImageReferenceResult[];
      }
    }),
  );

  let references = settled.flat();

  if (references.length && params.enablePlaceQueryFanOut) {
    try {
      references = await enrichReferencesUsageGuidance({
        apiKey,
        model,
        sceneKeyword,
        references,
      });
    } catch {
      // keep unenriched refs
    }
  }

  let spatialLayout: string | undefined;
  const placeRefs = references.filter(
    (r) => r.kind === "place" || r.layer === "background" || r.layer === "midground",
  );
  if (placeRefs.length && params.enablePlaceQueryFanOut) {
    try {
      spatialLayout = await describePlaceSpatialLayout({
        apiKey,
        model,
        sceneKeyword,
        placeRefs,
      });
    } catch {
      spatialLayout = undefined;
    }
  }

  return {
    mode: "grounded",
    targets,
    references,
    spatialLayout,
  };
}

export function collectReferenceDataUrls(
  references: ImageReferenceResult[],
): string[] {
  return references
    .map((r) => r.dataUrl)
    .filter((u) => typeof u === "string" && u.startsWith("data:image/"));
}

/** Prompt suffix when one or more SERP references are attached. */
export function buildGroundedImagePromptSuffix(
  references: ImageReferenceResult[],
  spatialLayout?: string,
): string {
  if (!references.length) return "";
  const lines = references.map((r, i) => {
    const head = `- Ref[${i}] (${r.layer} / ${r.kind}, query="${r.query}"): ${r.visualDescription || r.why || "use attached photo"}`;
    const use = (r.useFromImage ?? []).filter(Boolean);
    const ignore = (r.ignoreFromImage ?? []).filter(Boolean);
    const extra: string[] = [head];
    if (use.length) extra.push(`  USE from this photo: ${use.join("; ")}`);
    if (ignore.length) extra.push(`  DO NOT USE from this photo: ${ignore.join("; ")}`);
    return extra.join("\n");
  });
  const parts = [
    "",
    "REFERENCE PHOTOS ATTACHED:",
    "Compose ONE coherent photograph with real depth of field. The final image must look like a single real camera shot that makes physical sense.",
    "INSTALL CONTEXT: match how subjects are mounted in the reference photos (window in frame, door in jamb). Never isolate a product on blank wall when refs show in-context install.",
    "ANTI-MESH (critical): attached refs are evidence for identity and setting — not collage layers. Do not cut, mesh, paste, or composite a subject photo onto a place photo.",
    "ONE CAMERA: shared perspective, lighting, shadows, scale, and ground contact. Rebuild the subject in situ at the place as if photographed there.",
    "Match subject identity from product/person refs (shape, finish, face) without transplanting that source photo's environment, sky, or mismatched lighting.",
    "Ban composite tells: hard cutout edges, floating subjects, mismatched lighting between subject and place.",
    "PLACE MATCH (critical): when place refs exist, the final setting MUST be that place — same interior room or exterior site identity. A brand logo pasted into a generic venue is a FAIL.",
    "For INTERIOR place refs: match floor zones/materials, wall finishes, ceiling structure and fixtures, fixed equipment rows/colors, and place branding from those photos. Do not invent a different gym/store layout.",
    "Never reproduce photo chrome from refs (watermarks, annotations, UI overlays).",
    "Foreground refs = the main subject close to camera. Background/place refs = the fixed setting.",
    "Identity/portrait refs (role identity, or query with portrait/face/headshot): match that person's recognizable face and features in the final subject.",
    "For EACH ref, obey its USE and DO NOT USE lists — but USE is not a dump checklist across refs.",
    "SAME SUBJECT, MULTIPLE REFS (critical): when several refs show the same product/person/place from different angles (side view, close-up, lifestyle), they are evidence for ONE depiction — not ingredients to paste side-by-side.",
    "Pick ONE primary framing (usually the widest/lifestyle product or place shot). Secondary/side/close-up refs only refine materials, texture, hardware, and identity inside that single scene.",
    "Never collage multiple product variants into one window or frame.",
    "Features listed in any place/background/midground USE list are allowed and preferred (including fences, railings, painted lines, floor zones, ceiling fixtures, wall materials when listed).",
    "Do not invent structures absent from all place USE lists (no freehand jersey walls, no random extra fences, no generic substitute interiors).",
    "Subject DO NOT USE backgrounds (grass, trees, foreign skylines, foreign gyms) must not appear when place refs define the setting. Honor every DO NOT USE list.",
    "DO NOT USE items are limited to that photo's ignore list (watermarks, markup, foreign backgrounds) — do not globally ban authentic place geometry, room lighting, or floor/wall materials from place refs.",
    "Place/setting photos define WHERE the subject sits. Preserve building/room identity AND the true ground/floor type from those refs.",
    "Do not invent public roads, multi-lane streets, or traffic-lane markings that are not visible in the place refs.",
    "FRAME BOUNDARY (critical): only depict architecture and room sections that are VISIBLE in the attached place refs. Never invent, mirror, or extend mass past the reference photo edges.",
    "Prefer matching the reference camera framing for the place. Do not widen the scene with guessed neighboring rooms or repeated windows.",
    "Do not collage, paste, or stitch separate photos side-by-side. Integrate layers into a single believable camera shot.",
    "Do not invent businesses or landmarks not named in the keyword.",
    "When multiple references share a layer, only keep secondary details that appear in most of them for that layer — never treat each ref as a separate object to add.",
    "Do not invent trains, LRT, streetcars, neon glow, or dramatic sky effects unless they appear in the attached references or the keyword requires them.",
    "Match the reference lighting and color saturation. Do not oversaturate.",
    "Never invent details that contradict the attached place photos.",
    ...lines,
  ];
  const layout = (spatialLayout ?? "").trim();
  if (layout) {
    parts.push("", layout);
  }
  return parts.join("\n");
}
