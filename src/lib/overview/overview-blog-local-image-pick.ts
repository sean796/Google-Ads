import type { GoogleImagesSerpItem } from "@/lib/overview/overview-local-image-dfs-normalize";

const PLACE_MATCH_MIN = 0.65;
/** Skip only when the place is not recognizable (not an HD bar). */
export const LOCAL_IMAGE_QUALITY_MIN = 0.25;
/** Top N Google Images results sent to vision (not the full SERP). */
export const LOCAL_IMAGE_CANDIDATE_LIMIT = 10;

/** Vision brief for Google Images fallback: community over single-house listing. */
export function buildLocalImageCommunityAcceptanceBrief(entity: string): string {
  const place = (entity ?? "").trim() || "the place";
  return [
    `Prefer a community-scale view of "${place}" (neighbourhood streetscape, park, school, plaza, or public amenity).`,
    `A single private house / MLS listing photo is a weak match unless nothing more community-focused is available.`,
    `Do not reject houses as a category; rank community overview higher when both exist.`,
  ].join(" ");
}

/** Forced Google Images targets when Wikipedia lead is unavailable. */
export function buildLocalImageGoogleForcedTargets(entity: string) {
  return [
    {
      kind: "place" as const,
      query: entity,
      role: "primary place",
      acceptanceBrief: buildLocalImageCommunityAcceptanceBrief(entity),
    },
  ];
}

export function capGoogleImagesCandidates(
  items: GoogleImagesSerpItem[],
  limit: number = LOCAL_IMAGE_CANDIDATE_LIMIT,
): GoogleImagesSerpItem[] {
  return items.slice(0, Math.max(0, limit));
}

export type LocalImagePlacePick = {
  chosenIndex: number;
  why: string;
  placeMatchConfidence: number;
  /** Technical photo quality 0–1 (sharpness, resolution, compression). */
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

export function parseLocalImagePlacePick(raw: Record<string, unknown>): LocalImagePlacePick {
  const chosenIndex = Number(raw.chosenIndex);
  let placeMatchConfidence = Number(raw.placeMatchConfidence);
  let qualityScore = Number(raw.qualityScore);
  const why = String(raw.why ?? "").trim();
  const visualDescription = String(raw.visualDescription ?? "").trim();
  if (!Number.isFinite(chosenIndex) || chosenIndex < 0) {
    throw new Error("Vision pick missing chosenIndex");
  }
  if (!Number.isFinite(placeMatchConfidence)) {
    throw new Error("Vision pick missing placeMatchConfidence");
  }
  placeMatchConfidence = normalizeUnitScore(placeMatchConfidence);
  if (!Number.isFinite(qualityScore)) {
    // Older/partial replies: assume decent if place match is strong.
    qualityScore = placeMatchConfidence >= PLACE_MATCH_MIN ? 0.7 : 0.3;
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
    placeMatchConfidence,
    qualityScore,
    visualDescription,
  };
}

/** Read a JSON number field from truncated model text (numeric scan only). */
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

/**
 * When vision truncates mid-JSON, recover chosenIndex (+ optional confidence).
 * Proven failure mode: incomplete object without closing brace.
 */
export function recoverLocalImagePickFromPartialText(text: string): LocalImagePlacePick | null {
  const chosenIndex = readNumberFieldFromPartialJson(text, "chosenIndex");
  if (chosenIndex === null || chosenIndex < 0) return null;
  let placeMatchConfidence = readNumberFieldFromPartialJson(text, "placeMatchConfidence");
  if (placeMatchConfidence === null) placeMatchConfidence = 0.85;
  placeMatchConfidence = normalizeUnitScore(placeMatchConfidence);
  let qualityScore = readNumberFieldFromPartialJson(text, "qualityScore");
  if (qualityScore === null) qualityScore = 0.7;
  qualityScore = normalizeUnitScore(qualityScore);
  return {
    chosenIndex: Math.floor(chosenIndex),
    why: "partial vision reply",
    placeMatchConfidence,
    qualityScore,
    visualDescription: "Faithful replicate of the chosen reference photograph. Do not embellish or alter.",
  };
}

export function assertPlaceMatchOrThrow(pick: LocalImagePlacePick): void {
  if (pick.placeMatchConfidence < PLACE_MATCH_MIN) {
    throw new Error(
      `No Google Image confidently depicts this place (confidence ${pick.placeMatchConfidence}). Try a clearer entity name.`,
    );
  }
}

export function assertImageQualityOrThrow(pick: LocalImagePlacePick): void {
  if (pick.qualityScore < LOCAL_IMAGE_QUALITY_MIN) {
    throw new Error(
      `Place image is not recognizable enough (quality ${pick.qualityScore}). Skipping.`,
    );
  }
}
