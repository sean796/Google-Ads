import { generateImage } from "@/lib/image-api";
import { fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import { postOpenRouterAppChat, type OpenRouterAppMessage, type OpenRouterAppResponseFormat } from "@/lib/openrouter-app-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import type { ProductFace, ProductFaceName, ProductSpec, ProductView, ProductViewId } from "./video-generator-types";
import { PRODUCT_VISION_MODEL, type VideoAspect } from "./video-model-defaults";
import { videoLog, videoLogError, videoTimer } from "./video-log";

/** A subject photo as the engine needs it; `ManualImageReference` satisfies this. */
export type ProductPhoto = { fileName: string; dataUrl: string };

export { PRODUCT_VISION_MODEL };

const PRODUCT_TEXT_MAX_TOKENS = 16000;

export const PRODUCT_FACE_NAMES: readonly ProductFaceName[] = ["front long side", "rear long side", "left end", "right end", "roof", "base"];

export const PRODUCT_VIEW_DEFINITIONS: Array<{
  id: ProductViewId;
  label: string;
  shortLabel: string;
  chainHint: string;
  faces: ProductFaceName[];
  camera: string;
}> = [
  {
    id: "front_elevation",
    label: "Front elevation",
    shortLabel: "1. Front",
    chainHint: "Front long side, straight on",
    faces: ["front long side"],
    camera:
      "Straight-on orthographic elevation of the front long side at eye level, the whole unit centred and filling most of the frame. 3D Corner Projection Lock: the Screen-LEFT edge of the building is 0% (the Front-Left corner where the left end meets the front long side); the Screen-RIGHT edge of the building is 100% (the Front-Right corner where the front long side meets the right end). Render every horizontal zone from 0% at Screen-LEFT to 100% at Screen-RIGHT in exact left-to-right order — NEVER mirror-flip left and right",
  },
  {
    id: "three_quarter",
    label: "Front-right three-quarter",
    shortLabel: "2. Front-right 3/4",
    chainHint: "Front long side + right end",
    faces: ["front long side", "right end"],
    camera:
      "Three-quarter view from the Front-Right (100%) corner, slightly above eye level, whole unit in frame. 3D Corner Projection Lock: the NEAR corner closest to the camera in the middle of the frame is the Front-Right (100%) corner where the front long side meets the right end. To the LEFT of that near corner is the front long side receding toward the far-left background: therefore the 0% zone of the front long side (the Front-Left corner / mirrored glass bay) MUST be at the FAR-LEFT end of the building (furthest from the camera), followed going left-to-right toward the near corner by the solid vertical cladding strip, the entry door, the wall sconce, and the narrow vertical window nearest the center corner. To the RIGHT of the near center corner is the right end wall receding toward the far-right: render the right end wall with its exact surveyed inventory (solid vertical cladding, no glass wall when left end has the glass). NEVER place the 0% Front-Left glass bay on the near Front-Right corner and NEVER mirror-flip the front long side",
  },
  {
    id: "side_elevation",
    label: "Front-left three-quarter",
    shortLabel: "3. Front-left 3/4",
    chainHint: "Front long side + left end",
    faces: ["front long side", "left end"],
    camera:
      "Three-quarter view from the Front-Left (0%) corner, slightly above eye level, whole unit in frame. 3D Corner Projection Lock: the NEAR corner closest to the camera (center-left of frame) is the Front-Left (0%) corner where the left end meets the front long side. To the LEFT of the near corner is the left end wall. To the RIGHT of the near corner is the front long side receding toward the far-right (100%) corner: starting at the near corner with the 0% zone (mirrored glass bay), then the mandatory solid vertical cladding strip separating the glass bay from the door frame, then the entry door (solid lower panel + upper window pane), then the wall sconce on the cladding to the upper-right of the door, then the undivided single-pane narrow window, and solid vertical cladding to the far-right 100% corner",
  },
  {
    id: "glazing_detail",
    label: "Front detail",
    shortLabel: "4. Detail",
    chainHint: "Close on the front long side",
    faces: ["front long side"],
    camera:
      "Straight-on close-up of the front long side from 0% (Screen-LEFT) to 90% (Screen-RIGHT): showing the 0% glazed bay on Screen-LEFT, the solid vertical cladding strip separating the glass bay from the door frame, the entry door (solid lower panel, upper window pane) in the center, the wall sconce on the cladding to the upper-right of the door, and the undivided single-pane narrow window on Screen-RIGHT at true scale; NEVER mirror-flip",
  },
];

export const PRODUCT_VIEW_IDS: readonly ProductViewId[] = PRODUCT_VIEW_DEFINITIONS.map((d) => d.id);

const SURVEY_SCHEMA = `{"name":"string","summary":"string","faces":[{"face":"${PRODUCT_FACE_NAMES.join("|")}","photos":[1],"where":"string","inventory":"string"}],"mustNotChange":["string"]}`;

const FACE_ENUM = { type: "string", enum: [...PRODUCT_FACE_NAMES] };

const SURVEY_RESPONSE_FORMAT: OpenRouterAppResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "product_survey",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "summary", "faces", "mustNotChange"],
      properties: {
        name: { type: "string" },
        summary: { type: "string" },
        faces: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["face", "photos", "where", "inventory"],
            properties: {
              face: FACE_ENUM,
              photos: { type: "array", items: { type: "integer" } },
              where: { type: "string" },
              inventory: { type: "string" },
            },
          },
        },
        mustNotChange: { type: "array", items: { type: "string" } },
      },
    },
  },
};

function imagePart(url: string) {
  return { type: "image_url" as const, image_url: { url } };
}

function isFaceName(v: unknown): v is ProductFaceName {
  return typeof v === "string" && (PRODUCT_FACE_NAMES as readonly string[]).includes(v);
}

export function parseProductSpec(raw: unknown, photoCount = Number.MAX_SAFE_INTEGER): ProductSpec {
  if (!raw || typeof raw !== "object") throw new Error("Product survey must be a JSON object.");
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.faces)) throw new Error("Product survey faces must be an array.");
  const faces: ProductFace[] = o.faces.map((f, i) => {
    const x = (f ?? {}) as Record<string, unknown>;
    if (!isFaceName(x.face)) throw new Error(`Face ${i + 1} has an unknown name: ${String(x.face)}`);
    const photos = Array.isArray(x.photos)
      ? x.photos.map(Number).filter((p) => Number.isInteger(p) && p >= 1 && p <= photoCount)
      : [];
    const where = String(x.where ?? "").trim();
    return { face: x.face, photos, where, inventory: String(x.inventory ?? "").trim() };
  });
  for (const name of PRODUCT_FACE_NAMES) {
    if (!faces.some((f) => f.face === name)) throw new Error(`Product survey is missing the "${name}" face.`);
  }
  const spec: ProductSpec = {
    name: String(o.name ?? "").trim(),
    summary: String(o.summary ?? "").trim(),
    faces,
    mustNotChange: Array.isArray(o.mustNotChange) ? o.mustNotChange.map((x) => String(x).trim()).filter(Boolean) : [],
  };
  const missing = (["name", "summary"] as const).filter((k) => !spec[k]);
  if (missing.length) throw new Error(`Product survey is missing: ${missing.join(", ")}`);
  return spec;
}

function faceLine(face: ProductFace): string {
  const where = face.photos.length
    ? face.where
      ? `Photo ${face.photos.join(", ")}; ${face.where}`
      : `Photo ${face.photos.join(", ")}`
    : "not in any photo";
  return `- ${face.face} (${where}): ${face.inventory || "not visible"}`;
}

export function formatProductSpecPromptBlock(spec: ProductSpec | null | undefined): string {
  if (!spec) return "";
  const revisionBlock = spec.revisionNotes?.length
    ? `\n- Client product overrides (MANDATORY): ${spec.revisionNotes.join("; ")}`
    : "";
  return `Locked Product Bible (non-negotiable 1:1 CAD specification across every frame and clip):
- Product: ${spec.name} (${spec.summary})
Faces as photographed (exact 0%..100% left-to-right zone map):
${spec.faces.map(faceLine).join("\n")}
- Must not change: ${spec.mustNotChange.join("; ")}${revisionBlock}`;
}

export async function surveyProduct(args: {
  apiKey: string;
  briefPrompt: string;
  subjectPhotos: ProductPhoto[];
}): Promise<ProductSpec> {
  if (!args.subjectPhotos.length) throw new Error("Add at least one subject photo before surveying the product.");
  const messages: OpenRouterAppMessage[] = [
    {
      role: "system",
      content: `You survey ONE single physical product unit from photographs so a 3D renderer can reproduce it with 1:1 CAD-level accuracy.
Output one JSON object only, no markdown fences.
Schema:
${SURVEY_SCHEMA}
Face coordinate system (CRITICAL):
- Stand directly in front of the "front long side" (the long wall with the entry door) looking straight at it:
  * 0% is the far-left edge of the front long side (the Front-Left corner, where the "left end" wall meets the front long side).
  * 100% is the far-right edge of the front long side (the Front-Right corner, where the front long side meets the "right end" wall).
  * Even if a photo is shot from an angle, ALWAYS read the front long side from its 0% Front-Left corner on your left to its 100% Front-Right corner on your right.
Rules:
- Single-unit & Product-only isolation (CRITICAL): If a photo shows a row of multiple identical units, survey ONE single standalone unit only. Survey ONLY the manufactured building/module itself and its integral structural perimeter base beam/skid. NEVER include temporary yard or transport equipment (flatbed trailers, wheeled chassis, axles, tires, trailer hitches, truck beds, crane rigging straps/cables, spreader bars, or wooden cribbing blocks) and NEVER mention snow or winter yard surroundings.
- faces: one entry for each of the six faces, always. photos = the 1-based numbers of the attached photos in which that face is visible.
- where: for each cited photo, say where in that photo the face is.
- inventory (0%..100% Left-to-Right Proportional Zone Map + Sub-Panel Construction):
  1. List every horizontal zone on the front long side from 0% (Front-Left corner) to 100% (Front-Right corner) with its exact width percentage range.
  2. Explicitly state every solid cladding strip/gap between openings — especially the solid vertical ribbed cladding strip separating the right edge of the 0% corner glass bay from the left edge of the entry door frame (state clearly: "door is separated from the glass bay by a vertical ribbed cladding strip; door is NEVER flush against the glass bay").
  3. Explicitly state door sub-panel construction: whether the door has a solid dark lower half and a rectangular glass window pane in the upper half only (state: "solid dark lower door panel + upper glass window pane; NEVER a full-height glass door").
  4. Explicitly state window pane division: count the panes in each window and state when a narrow vertical window is 1 single undivided vertical glass pane with NO horizontal cross-bar/mullion.
  5. Explicitly state fixture coordinates: exact location of any exterior wall sconce light (e.g. "small black rectangular wall sconce mounted on the vertical cladding to the upper-right of the door, between the door and the narrow window — NOT centered above the door") and any upper wall vent.
  6. Explicitly contrast the "left end" and "right end": state which end is the full-height mirrored glass wall wrapping the 0% Front-Left corner, and state that the opposite "right end" (at the 100% Front-Right corner) is 100% solid dark brown vertical ribbed cladding with zero glass.
- roof & base: for roof, note roof profile and the 4 top roof corner lifting lugs/eyes. For base, describe ONLY the unit's integral perimeter steel skid/frame ("integral dark steel perimeter base beam only; no wheels, no axles, no trailer chassis").
- name: the marketing or model name when visible or implied; else a precise descriptive name.
- summary: two sentences on what the single standalone product unit is.
- mustNotChange: 6 to 8 strict 1:1 invariants locking: (1) 0% Front-Left glass bay vs 100% Front-Right solid cladding chirality (never mirror-flipped), (2) solid vertical cladding strip separating the glass bay from the door frame, (3) door solid lower half + square upper window pane, (4) single undivided vertical pane in the narrow window, (5) wall sconce on cladding to upper-right of door, (6) right end wall 100% solid cladding with no glass, (7) 4 top-corner roof lifting lugs and integral base with no trailer/wheels.`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Brief for the film:
${args.briefPrompt.trim() || "(none)"}

${args.subjectPhotos.map((p, i) => `Photo ${i + 1}: ${p.fileName}`).join("\n")}

Survey the single product unit now.`,
        },
        ...args.subjectPhotos.map((p) => imagePart(p.dataUrl)),
      ],
    },
  ];
  const elapsed = videoTimer();
  videoLog("product", "survey request", { photos: args.subjectPhotos.length, model: PRODUCT_VISION_MODEL });
  const res = await postOpenRouterAppChat({
    model: PRODUCT_VISION_MODEL,
    apiKey: args.apiKey,
    messages,
    maxTokens: PRODUCT_TEXT_MAX_TOKENS,
    reasoning: { effort: "low" },
    temperature: 0.1,
    responseFormat: SURVEY_RESPONSE_FORMAT,
  });
  videoLog("product", "survey reply", { seconds: elapsed(), finishReason: res.finishReason, content: res.content });
  try {
    return parseProductSpec(parseJsonObjectFromModelText(res.content), args.subjectPhotos.length);
  } catch (e) {
    videoLogError("product", "survey parse failed", e);
    throw e;
  }
}

export function viewPrompt(args: {
  viewId: ProductViewId;
  spec: ProductSpec;
  photoCount: number;
  hasMasterFrontView?: boolean;
  hasCurrentView?: boolean;
  revisionNotes?: string[];
}): string {
  const def = PRODUCT_VIEW_DEFINITIONS.find((d) => d.id === args.viewId);
  if (!def) throw new Error(`Unknown product view ${args.viewId}`);
  const primaryFaces = args.spec.faces.filter((f) => def.faces.includes(f.face));
  const otherFaces = args.spec.faces.filter((f) => !def.faces.includes(f.face) && f.photos.length > 0);
  const masterRule = args.hasMasterFrontView
    ? `\nMaster 0-Degree Reference (attached after Photo ${args.photoCount}): That attached image is the locked Front Elevation studio render of this exact unit (where 0% Front-Left corner is on Screen-LEFT and 100% Front-Right corner is on Screen-RIGHT). Keep 100% identical horizontal zone width percentages (0%..100%), glass-bay width and 2-pane count, solid cladding strip between the glass bay and the door, door lower-solid/upper-window structure, wall sconce to the upper-right of the door, undivided single-pane narrow window, and top-corner lifting lugs with that master render.`
    : "";
  const currentViewRule = args.hasCurrentView
    ? `\nCurrent View Reference (attached last): Keep the exact camera angle, studio lighting, and overall proportions of this current studio render, and modify ONLY what the Client Product Revision Notes below instruct.`
    : "";
  const allNotes = [
    ...(args.spec.revisionNotes ?? []),
    ...(args.revisionNotes ?? []),
  ].filter(Boolean);
  const uniqueNotes = Array.from(new Set(allNotes));
  const revisionBlock = uniqueNotes.length
    ? `\nClient Product Revision Notes for ${def.label} (MANDATORY — apply every instruction below directly to the rendered product):\n${uniqueNotes.map((n, i) => `- ${i + 1}. ${n}`).join("\n")}\n`
    : "";
  return `Studio re-photograph of ONE single physical product unit shown in the attached Photo 1 to Photo ${args.photoCount}. The photos are the source of truth; the 0%..100% zone map and 3D corner projection below lock every face and corner.${masterRule}${currentViewRule}

Product: ${args.spec.name}. ${args.spec.summary}
Primary faces visible in this camera angle (${def.label} — ${def.faces.join(" + ")}):
${primaryFaces.map(faceLine).join("\n")}
${otherFaces.length ? `Other surveyed faces of the same 3D unit (for corner & end-wall orientation context — do not swap ends):\n${otherFaces.map(faceLine).join("\n")}\n` : ""}Must not change: ${args.spec.mustNotChange.join("; ")}${revisionBlock}

Camera & 3D Corner Projection (MANDATORY): ${def.camera}.
1:1 Immutable CAD & Chirality Rules:
1. No Mirror-Flipping (Chirality Lock): 0% of the front long side is ALWAYS the Front-Left corner (where the left end meets the front long side), and 100% is ALWAYS the Front-Right corner (where the front long side meets the right end). In Front Elevation (1. Front), Front-Left 3/4 (3. Front-left 3/4), and Front Detail (4. Detail), the 0% glazed bay is on the LEFT and the narrow window is on the RIGHT. In Front-Right 3/4 (2. Front-right 3/4), the near center corner is the 100% Front-Right solid-cladding corner, so the front long side recedes to the LEFT with its 0% glazed bay at the FAR-LEFT end and the solid right end wall is to the RIGHT of the near corner.
2. Cladding Strip Between Glass Bay & Door: Keep the solid dark brown vertical ribbed cladding strip separating the right edge of the mirrored glass bay from the left edge of the entry door frame. NEVER place the door frame flush against the glass bay.
3. Exact Sub-Panel & Fixture Structure: The entry door has a solid dark lower panel and a square/rectangular glass window in the upper half only (never a full-glass door). The tall narrow window has 1 single undivided vertical glass pane (no horizontal divider bar). The small black exterior sconce light is mounted on the vertical cladding to the upper-right of the door (between the door and the narrow window, never centered above the door).
4. Product-Only Isolation: Render ONLY 1 single standalone unit and its integral dark steel perimeter base frame resting directly on the flat studio floor. NEVER render wheels, axles, trailer tongues, flatbed trailers, truck beds, wooden cribbing blocks, crane hooks, or rigging straps/cables.
Setting: the single unit alone on a neutral mid-grey studio cyclorama under soft even light, true colours, no environment, no people, no text or watermark.`;
}

async function imageResultToDataUrl(result: Awaited<ReturnType<typeof generateImage>>): Promise<string> {
  if (result.error) throw new Error(result.error);
  if (result.imageBase64) {
    return result.imageBase64.startsWith("data:") ? result.imageBase64 : `data:image/png;base64,${result.imageBase64}`;
  }
  if (result.imageUrl) {
    return result.imageUrl.startsWith("data:image/") ? result.imageUrl : await fetchImageDataUrlViaApi(result.imageUrl);
  }
  throw new Error("Image generator returned no image.");
}

/**
 * Renders one view directly from all subject photos (plus optional master front elevation render for angle views) in a single pass.
 */
export async function generateProductView(args: {
  apiKey: string;
  imageModel: string;
  spec: ProductSpec;
  viewId: ProductViewId;
  aspectRatio?: VideoAspect;
  subjectPhotos: ProductPhoto[];
  masterFrontDataUrl?: string;
  currentViewDataUrl?: string;
  revisionNotes?: string[];
}): Promise<string> {
  const hasMasterFrontView = Boolean(args.masterFrontDataUrl && args.viewId !== "front_elevation");
  const hasCurrentView = Boolean(args.currentViewDataUrl);
  const refs = [
    ...args.subjectPhotos.map((p) => p.dataUrl),
    ...(hasMasterFrontView && args.masterFrontDataUrl ? [args.masterFrontDataUrl] : []),
    ...(hasCurrentView && args.currentViewDataUrl && args.currentViewDataUrl !== args.masterFrontDataUrl
      ? [args.currentViewDataUrl]
      : []),
  ];
  const aspect = args.aspectRatio ?? "16:9";
  const elapsed = videoTimer();
  videoLog("product", `view ${args.viewId} start`, {
    photos: args.subjectPhotos.length,
    hasMasterFrontView,
    hasCurrentView,
    revisions: args.revisionNotes?.length ?? 0,
    model: args.imageModel,
    aspect,
  });
  const result = await generateImage({
    apiKey: args.apiKey,
    model: args.imageModel,
    prompt: viewPrompt({
      viewId: args.viewId,
      spec: args.spec,
      photoCount: args.subjectPhotos.length,
      hasMasterFrontView,
      hasCurrentView,
      revisionNotes: args.revisionNotes,
    }),
    aspectRatio: aspect,
    referenceImageDataUrls: refs,
    maxReferenceImages: refs.length,
  });
  try {
    const dataUrl = await imageResultToDataUrl(result);
    videoLog("product", `view ${args.viewId} drawn`, { seconds: elapsed(), bytes: dataUrl.length });
    return dataUrl;
  } catch (e) {
    videoLogError("product", `view ${args.viewId} failed after ${elapsed()} s`, e);
    throw e;
  }
}

export function initialProductViews(): ProductView[] {
  return PRODUCT_VIEW_DEFINITIONS.map((d) => ({ id: d.id, label: d.label, status: "waiting" as const }));
}
