/**
 * Place spatial layout contract derived from Google Images place references.
 */

import {
  openRouterVisionChatCompletion,
  parseJsonObjectFromModelText,
  type OpenRouterVisionContentPart,
} from "@/lib/openrouter-vision-chat";
import type { ImageReferenceResult } from "@/lib/image-reference-research-types-parsers";

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


export async function describePlaceSpatialLayout(params: {
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
