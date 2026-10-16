import { generateImage } from "@/lib/image-api";
import { fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import type { VideoAspect } from "./video-model-defaults";
import type { ProductSpec, ProductViewId, VideoPlan, VideoScenePlan } from "./video-generator-types";
import { formatProductSpecPromptBlock } from "./video-product-agent";
import { videoLog, videoLogError, videoTimer } from "./video-log";

/**
 * Storyboard artist: renders shared per-location Environment Plates first, then composites the Locked Product
 * into each scene's opening still using at most 3 non-redundant reference slots so Gemini Flash Image never 400s.
 */
const STORYBOARD_MAX_REFERENCES = 3;

export function continuityBlock(plan: VideoPlan): string {
  const c = plan.continuity;
  return `Hero subject: ${c.heroSubject}. Screen direction for all travel: ${c.screenDirection.replace(/_/g, " ")}. Camera stays on: ${c.cameraSide}. Palette: ${c.palette}. Light: ${c.lightArc}.`;
}

const ORDINAL = ["first", "second", "third"];

export function resolveProductAnchorForScene(args: {
  scene: VideoScenePlan;
  subjectDataUrl?: string;
  productViews?: Partial<Record<ProductViewId, string>>;
}): { dataUrl?: string; label: string; secondaryDataUrl?: string; secondaryLabel?: string } {
  const views = args.productViews;
  if (views) {
    const preferred = args.scene.productView ? views[args.scene.productView] : undefined;
    if (preferred) {
      const secondaryViewId: ProductViewId =
        args.scene.productView === "front_elevation" ? "three_quarter" : "front_elevation";
      const secondary = views[secondaryViewId];
      return {
        dataUrl: preferred,
        label: `canonical "${args.scene.productView}" studio render of the locked product`,
        ...(secondary && secondary !== preferred
          ? {
              secondaryDataUrl: secondary,
              secondaryLabel:
                secondaryViewId === "front_elevation"
                  ? "front elevation studio render of the locked product (locks the exact left-to-right order of everything on the front long side)"
                  : "front-right three-quarter studio render of the locked product",
            }
          : {}),
      };
    }
    const fallbackView =
      views.three_quarter ?? views.front_elevation ?? views.side_elevation ?? views.glazing_detail;
    if (fallbackView) {
      const secondary =
        views.front_elevation && views.front_elevation !== fallbackView
          ? views.front_elevation
          : views.three_quarter && views.three_quarter !== fallbackView
            ? views.three_quarter
            : undefined;
      return {
        dataUrl: fallbackView,
        label: "canonical studio render of the locked product",
        ...(secondary
          ? {
              secondaryDataUrl: secondary,
              secondaryLabel: "front elevation studio render of the locked product (locks the exact left-to-right order of everything on the front long side)",
            }
          : {}),
      };
    }
  }
  if (args.subjectDataUrl) {
    return {
      dataUrl: args.subjectDataUrl,
      label: "subject harness sheet of the real product",
    };
  }
  return { dataUrl: undefined, label: "none" };
}

/**
 * Renders the empty-stage Environment Plate for a unique location (`environmentId`) BEFORE the hero product is composited.
 * Daytime scenes at the same location share one single rendered image; night variants or secondary outdoor locations
 * receive `masterEnvironmentDataUrl` as Reference Image 1 so ground, piers, foliage, and season never flip.
 */
export async function generateEnvironmentPlate(args: {
  apiKey: string;
  imageModel: string;
  plan: VideoPlan;
  scene: VideoScenePlan;
  aspect: VideoAspect;
  /** Master Environment Plate for this location (or first outdoor location to lock season/weather). */
  masterEnvironmentDataUrl?: string;
  /** Existing environment plate for this scene when revising in place. */
  currentEnvironmentDataUrl?: string;
}): Promise<string> {
  const anchorUrl = args.currentEnvironmentDataUrl ?? args.masterEnvironmentDataUrl;
  const refs = anchorUrl ? [anchorUrl] : [];
  const envDescription =
    args.scene.environmentPrompt?.trim() ||
    `Clean empty environment setting for scene "${args.scene.title}": ${args.scene.storyboardPrompt}`;
  const anchorRule = args.currentEnvironmentDataUrl
    ? "The first reference image is the current Environment Plate for this scene: keep the exact ground surface, foundation piers/floor, terrain, background trees/mountains/walls, season, and horizon line, changing only what the revised environment description requests."
    : args.masterEnvironmentDataUrl
      ? `The first reference image is the Master Environment Plate for this film's setting: preserve the exact same season, weather, ground texture (dry gravel/grass/concrete — never switching between summer and winter snow), concrete foundation pier count and spacing, tree species, and mountain silhouette, adjusting only for this scene's location or time-of-day lighting.`
      : "";
  const revisionBlock = args.scene.revisionNotes?.length
    ? `\nClient Revision Notes: ${args.scene.revisionNotes.join("; ")}\n`
    : "";
  const prompt = `Empty-Stage Environment Plate for scene ${args.scene.order} ("${args.scene.title}", location "${args.scene.environmentId ?? `scene_${args.scene.order}`}") of "${args.plan.title}".
${anchorRule}
Environment description: ${envDescription}${revisionBlock}
Mandatory Empty-Stage & Season Consistency Rules:
1. Render ONLY the physical environment: the ground surface, concrete factory floor or concrete foundation piers, road surface, background architecture, forest trees, mountain peaks, sky, and lighting.
2. DO NOT render the hero modular building/cabin, DO NOT render any flatbed semi-truck or trailer, and DO NOT render any crane, spreader bar, or rigging cables. The center stage where the product will sit must remain completely clear and unobstructed, showing the clean ground or concrete foundation piers ready to receive 1 single unit.
3. Single Season Lock: Keep the ground dry and clear with consistent seasonal foliage across all scenes unless the description explicitly requests winter snow. Never randomly add snow or ice to the ground.
4. Palette & lighting arc: ${continuityBlock(args.plan)}
Single full-frame photoreal cinematic architectural environment plate, ${args.aspect} frame, no text, no watermark, no borders.`;

  const elapsed = videoTimer();
  videoLog("storyboard", `scene ${args.scene.order} environment plate start`, {
    environmentId: args.scene.environmentId ?? `scene_${args.scene.order}`,
    anchoredToMaster: Boolean(args.masterEnvironmentDataUrl),
    editedInPlace: Boolean(args.currentEnvironmentDataUrl),
  });
  const result = await generateImage({
    apiKey: args.apiKey,
    prompt,
    model: args.imageModel,
    aspectRatio: args.aspect,
    referenceImageDataUrls: refs,
    maxReferenceImages: Math.max(1, refs.length),
  });
  if (result.error) {
    videoLogError("storyboard", `scene ${args.scene.order} environment plate failed after ${elapsed()} s`, result.error);
    throw new Error(result.error);
  }
  let dataUrl: string;
  if (result.imageBase64) {
    dataUrl = result.imageBase64.startsWith("data:") ? result.imageBase64 : `data:image/png;base64,${result.imageBase64}`;
  } else if (result.imageUrl) {
    dataUrl = result.imageUrl.startsWith("data:image/") ? result.imageUrl : await fetchImageDataUrlViaApi(result.imageUrl);
  } else {
    throw new Error("Environment plate generator returned no image.");
  }
  videoLog("storyboard", `scene ${args.scene.order} environment plate done`, { seconds: elapsed(), bytes: dataUrl.length });
  return dataUrl;
}

function storyboardPromptFor(args: {
  plan: VideoPlan;
  scene: VideoScenePlan;
  aspect: VideoAspect;
  productAnchorLabel?: string;
  secondaryProductAnchorLabel?: string;
  stageAnchorKind: "current" | "same_location" | "environment" | "hero" | "none";
  productSpec?: ProductSpec | null;
  hasSceneBeatRef: boolean;
}): string {
  const { plan, scene, aspect } = args;
  let slot = 0;
  const subjectRule = args.productAnchorLabel
    ? `The ${ORDINAL[slot++]} reference image is the ${args.productAnchorLabel}. The hero subject in this frame IS this exact 1 single completed physical product unit: identical design, 0%..100% horizontal zone widths, materials, every opening, pane, mullion, solid cladding strip between the glass bay and the door, fixture, top-corner lifting lug, colour, and integral perimeter base, exactly as in that image and the Locked Product Bible. Never render an unfinished shell, never render multiple units or a row of units, and never mirror-flip the building.`
    : "";
  const stageRule =
    args.stageAnchorKind === "current"
      ? `The ${ORDINAL[slot++]} reference image is the current version of this frame: keep its composition, camera angle, subject, ground, foundation piers, season, lighting and palette, and change only what the revised description and Client Revision Notes below specify.`
      : args.stageAnchorKind === "same_location"
        ? `The ${ORDINAL[slot++]} reference image is the previous scene's frame at this exact same location ("${scene.environmentId ?? "shared_site"}"): keep 100% of the same ground texture, dry gravel/grass (never switching season or adding snow), concrete foundation piers, module placement, and background trees/mountains, changing only the scene action or time-of-day lighting described below.`
        : args.stageAnchorKind === "environment"
          ? `The ${ORDINAL[slot++]} reference image is the Locked Environment Plate for this scene (location "${scene.environmentId ?? `scene_${scene.order}`}"): composite the 1 single completed hero product directly into this exact environment plate, keeping 100% of its ground surface, dry season, concrete foundation piers, background trees/walls, mountain silhouette, and horizon line unchanged.`
          : args.stageAnchorKind === "hero"
            ? `The ${ORDINAL[slot++]} reference image is the hero frame of this video: match its cinematic colour grade, season, and subject scale.`
            : "";
  const thirdSlotRule = args.hasSceneBeatRef
    ? `The ${ORDINAL[slot++]} reference image is the uploaded scene beat reference for staging & vehicle direction: match its camera framing, activity beat, and exact vehicle/truck orientation (if a truck is present, place the tractor cab on the exact same side of the frame — left vs right — facing the exact same travel direction as in this beat reference image), while replacing the building/cargo with the 1:1 Locked Product from the first reference image.`
    : args.secondaryProductAnchorLabel
      ? `The ${ORDINAL[slot++]} reference image is the ${args.secondaryProductAnchorLabel}. Use it together with the first reference image to keep the exact left-to-right 0%..100% zone widths and pane counts on each face; never mirror-flip the building and never replace a glass pane with solid cladding.`
      : "";
  const specBlock = formatProductSpecPromptBlock(args.productSpec);
  const revisionBlock = scene.revisionNotes?.length
    ? `\nClient Revision Notes (MANDATORY override for this scene):\n${scene.revisionNotes.map((note, i) => `- ${i + 1}. ${note}`).join("\n")}\n`
    : "";
  const facing = plan.continuity.screenDirection === "left_to_right" ? "RIGHT" : "LEFT";
  return `Storyboard frame ${scene.order} of ${plan.scenes.length} for the video "${plan.title}".
${subjectRule}
${stageRule}
${thirdSlotRule}
${specBlock ? `${specBlock}\n` : ""}${scene.storyboardPrompt}${revisionBlock}

Physical & Structural Laws (mandatory 1:1 enforcement in every frame):
1. Single Standalone Unit & 1:1 Zone Map Lock: Render ONLY 1 single standalone modular unit in the frame — NEVER a row of multiple units side by side. Every horizontal zone (0%..100%) on each face keeps its exact width ratio, exact number of floor-to-ceiling glass panes and mullions, exact vertical cladding rib strips separating glazed bays from door frames, exact door lower/upper panel structure, exact exterior light sconce placement, and exact single-pane or multi-pane window divisions listed in the Locked Product Bible. Never replace any glass pane with solid cladding.
2. Facade Lock (No Mirror-Flipping): each face keeps the exact left-to-right order of its openings and panels as in the Locked Product Bible and the studio renders.
3. Season & Ground Lock (No Unrequested Snow): Keep the exact season and dry ground condition of the environment plate / previous scene. Never add snow, ice, or winter slush unless the scene prompt explicitly asks for snow.
4. Staging Isolation (No Stray Trailers or Cranes): Flatbed semi-trucks/trailers appear ONLY when this scene's action explicitly takes place on a highway truck or loading directly off a truck bed. In indoor factory bay scenes and installed site/piers/night scenes, the module rests directly on the clean concrete factory floor or concrete foundation piers with NO flatbed trailer, NO truck bed, and NO wheeled chassis anywhere in the frame.
5. Flatbed Truck Co-Linear Alignment & Cab Direction: Whenever the module is on a flatbed semi-truck, the module's long axis MUST be 100% parallel and co-linear with the flatbed trailer deck and tractor cab (0 degree yaw offset), resting flat and centered on the trailer bed. Match the tractor cab side (left vs right) and facing direction to the uploaded beat reference image (or pointing screen ${facing} when no beat reference is attached).
6. Overhead Crane Rigging (Top Roof Corner Lugs Only): Whenever a crane lifts or sets the module, the module hangs horizontally level from 4 steel cables attached ONLY to the 4 top roof corner lifting lugs/eyes connected to an overhead spreader bar directly above the module — NEVER run crane cables diagonally across the front glass or cladding down to the bottom base corners, never dangle off to the side on a folding boom arm, and never add thin metal stick legs.

Video continuity (every frame obeys it): ${continuityBlock(plan)}
Single full-frame photoreal cinematic shot, ${aspect} frame, no split-screen, no text, no captions, no watermark, no borders.
This is the opening frame of a continuous shot; composition must leave room for this motion: ${scene.motionPrompt}`;
}

export async function generateStoryboardFrame(args: {
  apiKey: string;
  imageModel: string;
  plan: VideoPlan;
  scene: VideoScenePlan;
  aspect: VideoAspect;
  /** Subject harness sheet fallback when individual productViews are not present. */
  subjectDataUrl?: string;
  /** Canonical product spec from ProductLock. */
  productSpec?: ProductSpec | null;
  /** Locked high-res studio views keyed by ProductViewId. */
  productViews?: Partial<Record<ProductViewId, string>>;
  /** Rendered Environment Plate for this scene (locks ground, piers/floor, and surroundings). */
  environmentDataUrl?: string;
  /** Previous scene's finished keyframe when both scenes share the same `environmentId`. */
  sameLocationFrameDataUrl?: string;
  /** The uploads the Director assigned to this scene (`scene.referenceIndexes`), in that order. */
  sceneReferenceDataUrls: string[];
  /** Scene 1 frame, prepended as the environment reference only when Product Lock views are not present. */
  heroFrameDataUrl?: string;
  /** Existing frame being revised; wins over the hero frame as the reference. */
  currentFrameDataUrl?: string;
}): Promise<string> {
  const productAnchor = resolveProductAnchorForScene({
    scene: args.scene,
    subjectDataUrl: args.subjectDataUrl,
    productViews: args.productViews,
  });
  const hasLockedStudioViews = Boolean(productAnchor.secondaryDataUrl);
  const effectiveHeroFrame = hasLockedStudioViews ? undefined : args.heroFrameDataUrl;

  // Slot 2: Pick ONE stage/context anchor (never both empty environment plate and occupied same-location frame at once)
  const stageAnchorKind: "current" | "same_location" | "environment" | "hero" | "none" = args.currentFrameDataUrl
    ? "current"
    : args.sameLocationFrameDataUrl
      ? "same_location"
      : args.environmentDataUrl
        ? "environment"
        : effectiveHeroFrame
          ? "hero"
          : "none";
  const stageAnchorUrl =
    args.currentFrameDataUrl ??
    args.sameLocationFrameDataUrl ??
    args.environmentDataUrl ??
    effectiveHeroFrame;

  // Slot 3: Scene beat reference upload (when present) OR secondary master product view
  const beatRefUrl = args.sceneReferenceDataUrls[0];
  const hasSceneBeatRef = Boolean(beatRefUrl);
  const thirdSlotUrl = beatRefUrl ?? productAnchor.secondaryDataUrl;

  const references = [
    ...(productAnchor.dataUrl ? [productAnchor.dataUrl] : []),
    ...(stageAnchorUrl ? [stageAnchorUrl] : []),
    ...(thirdSlotUrl && thirdSlotUrl !== productAnchor.dataUrl && thirdSlotUrl !== stageAnchorUrl ? [thirdSlotUrl] : []),
  ].slice(0, STORYBOARD_MAX_REFERENCES);

  const elapsed = videoTimer();
  videoLog("storyboard", `scene ${args.scene.order} draw start`, {
    model: args.imageModel,
    productAnchor: productAnchor.label,
    stageAnchor: stageAnchorKind,
    thirdSlot: hasSceneBeatRef ? "beat reference" : productAnchor.secondaryDataUrl ? productAnchor.secondaryLabel ?? "secondary product view" : "none",
    referencesAttached: references.length,
    title: args.scene.title,
  });
  const result = await generateImage({
    apiKey: args.apiKey,
    prompt: storyboardPromptFor({
      plan: args.plan,
      scene: args.scene,
      aspect: args.aspect,
      productAnchorLabel: productAnchor.dataUrl ? productAnchor.label : undefined,
      secondaryProductAnchorLabel:
        !hasSceneBeatRef && productAnchor.secondaryDataUrl ? productAnchor.secondaryLabel : undefined,
      stageAnchorKind,
      productSpec: args.productSpec,
      hasSceneBeatRef,
    }),
    model: args.imageModel,
    aspectRatio: args.aspect,
    referenceImageDataUrls: references,
    maxReferenceImages: STORYBOARD_MAX_REFERENCES,
  });
  if (result.error) {
    videoLogError("storyboard", `scene ${args.scene.order} draw failed after ${elapsed()} s`, result.error);
    throw new Error(result.error);
  }
  let dataUrl: string;
  if (result.imageBase64) {
    dataUrl = result.imageBase64.startsWith("data:") ? result.imageBase64 : `data:image/png;base64,${result.imageBase64}`;
  } else if (result.imageUrl) {
    dataUrl = result.imageUrl.startsWith("data:image/") ? result.imageUrl : await fetchImageDataUrlViaApi(result.imageUrl);
  } else {
    videoLogError("storyboard", `scene ${args.scene.order} draw returned no image after ${elapsed()} s`, result);
    throw new Error("Image generator returned no image.");
  }
  videoLog("storyboard", `scene ${args.scene.order} draw done`, { seconds: elapsed(), bytes: dataUrl.length });
  return dataUrl;
}
