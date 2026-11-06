/**
 * Vision ranking and per-reference usage guidance for Google Images candidates.
 */

import {
  openRouterVisionChatCompletion,
  parseJsonObjectFromModelText,
  type OpenRouterVisionContentPart,
} from "@/lib/openrouter-vision-chat";
import type { GoogleImagesSerpItem } from "@/lib/overview/overview-local-image-dfs-normalize";
import { BACKEND_API_BASE, backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import {
  IMAGE_REF_CANDIDATE_LIMIT,
  IMAGE_REF_FIT_MIN,
  capGoogleImagesCandidates,
  defaultLayerForKind,
  parseSoftReferenceMultiPick,
  parseSoftReferencePick,
  recoverSoftPickFromPartialText,
  softPickPasses,
  type ImageGroundingTarget,
  type ImageReferenceResearchContext,
  type ImageReferenceResult,
  type SoftPick,
} from "@/lib/image-reference-research-types-parsers";

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

export async function enrichReferencesUsageGuidance(params: {
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


export async function fetchGoogleImagesForQuery(
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

export async function prefetchImageDataUrl(imageUrl: string, referer?: string): Promise<string | null> {
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


export async function pickTopReferencesForTarget(params: {
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


export function buildVisionHint(context: ImageReferenceResearchContext): string {
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
