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
      "Straight-on orthographic studio shot of the front long side (the product's primary hero face) at eye level, the whole product centred and filling most of the frame. Screen-LEFT is 0% (Front-Left corner); Screen-RIGHT is 100% (Front-Right corner). Render every surveyed horizontal zone from 0% to 100% in exact left-to-right order. Never mirror-flip left and right.",
  },
  {
    id: "three_quarter",
    label: "Front-right three-quarter",
    shortLabel: "2. Front-right 3/4",
    chainHint: "Front long side + right end",
    faces: ["front long side", "right end"],
    camera:
      "Three-quarter studio view from the Front-Right (100%) corner, slightly above eye level, whole product in frame. The near corner is where the front long side meets the right end. The front long side recedes toward the far-left (0% at the far-left); the right end wall recedes toward the far-right. Use the surveyed inventory for both faces. Never mirror-flip the primary face or swap left/right ends.",
  },
  {
    id: "side_elevation",
    label: "Front-left three-quarter",
    shortLabel: "3. Front-left 3/4",
    chainHint: "Front long side + left end",
    faces: ["front long side", "left end"],
    camera:
      "Three-quarter studio view from the Front-Left (0%) corner, slightly above eye level, whole product in frame. The near corner is where the left end meets the front long side. The left end wall is to the left of the near corner; the front long side recedes toward the far-right (100% at the far-right). Use the surveyed inventory for both faces. Never mirror-flip the primary face or swap left/right ends.",
  },
  {
    id: "glazing_detail",
    label: "Front detail",
    shortLabel: "4. Detail",
    chainHint: "Close on the front long side",
    faces: ["front long side"],
    camera:
      "Straight-on close-up of the front long side from 0% (Screen-LEFT) toward 100% (Screen-RIGHT), showing the surveyed materials, textures, edges, hardware, and zone layout at true scale. Never mirror-flip.",
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
  return `Locked Product Bible (1:1 specification when this scene shows the SKU):
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
      content: `You survey ONE single physical product unit from the attached photographs so a studio turntable renderer can reproduce it faithfully.
Output one JSON object only, no markdown fences.
Schema:
${SURVEY_SCHEMA}
Abstract face map (use for any product size or category):
- "front long side" = the primary hero/marketing face (the face the customer should recognize first).
- "left end" / "right end" = the two sides when looking at that primary face (0% = Front-Left corner, 100% = Front-Right corner).
- "rear long side" = opposite the primary face.
- "roof" = top surface or top edge; "base" = bottom edge, mount, rail, or support.
- On the primary face, 0% is the far-left edge (Front-Left corner) and 100% is the far-right edge (Front-Right corner), even in angled photos.
Rules:
- Single product only: if multiple identical units appear, survey ONE standalone unit. Do not invent products not shown.
- Product vs scene: survey only the manufactured item being marketed (shade, appliance, module, fixture, etc.). Treat room walls, windows, furniture, buildings, vehicles, and landscape as scene context unless they are clearly part of the sold SKU in the photos.
- faces: one entry for each of the six faces, always. photos = 1-based photo numbers where that face is visible (empty array if never visible).
- where: for each cited photo, say where in that photo the face appears.
- inventory: for each face with photos, describe materials, color, finish, proportions, edges, hardware, branding, and features using a 0%..100% left-to-right zone map when the face has distinct horizontal regions. For compact products (e.g. window shades), describe pleats/cells, hem, rails, cords/wands, mount type, and opacity—not architectural elements absent from the photos.
- name: marketing or model name when visible or implied; else a precise descriptive name from the photos and brief.
- summary: two sentences describing the single product unit (category and distinguishing traits from the photos).
- mustNotChange: 4 to 8 strict 1:1 invariants taken only from what is visible or stated in the photos and brief (materials, color, proportions, chirality left-vs-right, key features). Do not require features that are not in the photos.`,
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
    ? `\nMaster 0-Degree Reference (attached after Photo ${args.photoCount}): That image is the locked Front Elevation studio render of this exact product (0% on Screen-LEFT, 100% on Screen-RIGHT). Match its proportions, materials, colors, and every surveyed zone width with that master render.`
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
1:1 fidelity rules:
1. Chirality: 0% is always the Front-Left corner of the primary face; 100% is the Front-Right corner. Never mirror-flip the product left-for-right versus the photos and Locked Product Bible.
2. Source of truth: Attached subject photos and the Locked Product Bible define category, shape, materials, and color. Do not substitute a different product type (no buildings, cabins, vehicles, or room sets unless the bible describes that exact sold unit).
3. Product-only studio: Render exactly ONE standalone surveyed product on a neutral mid-grey cyclorama under soft even light. No people, no text, no watermark. Omit scene context from lifestyle photos (walls, furniture, outdoor buildings) unless it is part of the surveyed product.
4. No hallucinated features: Do not add doors, glass walls, vents, trailers, or architectural elements that are not in the survey or photos.`;
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
