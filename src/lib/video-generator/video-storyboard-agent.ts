import { generateImage } from "@/lib/image-api";
import { fetchImageDataUrlViaApi } from "@/lib/proxy-fetch-text";
import type { VideoAspect } from "./video-model-defaults";
import type { ProductSpec, ProductViewId, VideoPlan, VideoScenePlan } from "./video-generator-types";
import { formatProductSpecPromptBlock } from "./video-product-agent";
import { clientLocationReferencePromptBlock } from "./video-client-location-reference";
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
  const clientRef = args.scene.postCutReferenceDataUrl?.startsWith("data:image/")
    ? args.scene.postCutReferenceDataUrl
    : undefined;
  const anchorUrl = args.currentEnvironmentDataUrl ?? args.masterEnvironmentDataUrl;
  const refs = [...(clientRef ? [clientRef] : []), ...(anchorUrl ? [anchorUrl] : [])].slice(0, 2);
  const envDescription =
    args.scene.environmentPrompt?.trim() ||
    `Clean empty environment setting for scene "${args.scene.title}": ${args.scene.storyboardPrompt}`;
  const anchorRule = args.currentEnvironmentDataUrl
    ? "The first reference image is the current Environment Plate for this scene: keep the exact ground/floor, backdrop, season, and horizon, changing only what the revised environment description requests."
    : args.masterEnvironmentDataUrl
      ? `The first reference image is the Master Environment Plate for this film's setting: preserve the same season, weather, ground/floor texture, backdrop architecture or landscape, and horizon line, adjusting only for this scene's location or time-of-day lighting.`
      : "";
  const revisionBlock = args.scene.revisionNotes?.length
    ? `\nClient Revision Notes: ${args.scene.revisionNotes.join("; ")}\n`
    : "";
  const clientRefBlock = args.scene.postCutReferenceDataUrl
    ? clientLocationReferencePromptBlock({
        fileName: args.scene.postCutReferenceFileName,
        forEnvironmentPlate: true,
      })
    : "";
  const prompt = `Empty-Stage Environment Plate for scene ${args.scene.order} ("${args.scene.title}", location "${args.scene.environmentId ?? `scene_${args.scene.order}`}") of "${args.plan.title}".
${anchorRule}
Environment description: ${envDescription}${clientRefBlock}${revisionBlock}
Mandatory Empty-Stage & Season Consistency Rules:
1. Render ONLY the physical environment: ground/floor, walls, sky, distant backdrop, and lighting described above.
2. DO NOT render people, pets, products, or scene action. Leave the stage empty for the storyboard artist.
3. Single Season Lock: Keep season and ground condition consistent with the description. Never add snow or ice unless the description explicitly requests it.
4. Palette & lighting arc: ${continuityBlock(args.plan)}
Single full-frame photoreal cinematic environment plate, ${args.aspect} frame, no text, no watermark, no borders.`;

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

export function hasNegativePeopleConstraint(text?: string | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("no people") ||
    t.includes("no person") ||
    t.includes("nobody") ||
    t.includes("no humans") ||
    t.includes("zero people") ||
    t.includes("zero humans") ||
    t.includes("no staff") ||
    t.includes("empty showroom") ||
    t.includes("empty store") ||
    t.includes("empty office") ||
    t.includes("empty room") ||
    t.includes("without people") ||
    t.includes("without humans") ||
    t.includes("remove people") ||
    t.includes("remove person") ||
    t.includes("no one") ||
    t.includes("devoid of people") ||
    t.includes("devoid of humans") ||
    t.includes("no visible people") ||
    t.includes("unoccupied")
  );
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
  hasProductAnchor: boolean;
  referenceStillsFlythrough?: boolean;
  beatReferenceFileName?: string;
}): string {
  const { plan, scene, aspect } = args;
  let slot = 0;
  const subjectRule = args.productAnchorLabel
    ? `The ${ORDINAL[slot++]} reference image is the ${args.productAnchorLabel}. The hero subject in this frame IS this exact single completed physical product unit: identical design, materials, proportions, colors, and every feature listed in the Locked Product Bible and reference image. Never render a different product category, never render multiple units or a row of units, and never mirror-flip the primary face left-for-right.`
    : "";
  const stageRule =
    args.stageAnchorKind === "current"
      ? `The ${ORDINAL[slot++]} reference image is the current version of this frame: keep its composition, camera angle, subjects, ground, season, lighting and palette, and change only what the revised description and Client Revision Notes below specify.`
      : args.stageAnchorKind === "same_location"
        ? `The ${ORDINAL[slot++]} reference image is the previous scene's frame at this exact same location ("${scene.environmentId ?? "shared_site"}"): keep the same ground, backdrop, prop layout, and season, changing only the scene action or time-of-day lighting described below.`
        : args.stageAnchorKind === "environment"
          ? args.hasProductAnchor
            ? `The ${ORDINAL[slot++]} reference image is the Locked Environment Plate for this scene (location "${scene.environmentId ?? `scene_${scene.order}`}"): composite the locked product from the first reference into this plate, keeping ground, backdrop, season, and horizon unchanged.`
            : `The ${ORDINAL[slot++]} reference image is the Locked Environment Plate for this scene (location "${scene.environmentId ?? `scene_${scene.order}`}"): build the storyboardPrompt subjects and action into this plate, keeping ground, backdrop, season, and horizon unchanged.`
          : args.stageAnchorKind === "hero"
            ? `The ${ORDINAL[slot++]} reference image is the hero frame of this video: match its cinematic colour grade, season, and subject scale.`
            : "";
  const thirdSlotRule = args.hasSceneBeatRef
    ? args.hasProductAnchor
      ? `The ${ORDINAL[slot++]} reference image is the uploaded scene beat reference: match its camera framing, activity, and facing; use the first reference for the locked product appearance at 1:1. When the beat reference is a client storefront or showroom photo, replicate sign copy, materials, and layout at 1:1.`
      : args.referenceStillsFlythrough
        ? `The ${ORDINAL[slot++]} reference image is the uploaded location still: match architecture, signage, materials, fixed furniture, and camera angle only. Do not copy people from the photograph into the generated frame; remove any staff or person visible.`
        : `The ${ORDINAL[slot++]} reference image is the uploaded scene beat reference: match its camera framing, activity, wardrobe, and travel/facing direction. When it is a client storefront, showroom, or interior location photo, replicate architecture, signage, and branding at 1:1; do not invent a generic building.`
    : args.secondaryProductAnchorLabel
      ? `The ${ORDINAL[slot++]} reference image is the ${args.secondaryProductAnchorLabel}. Use it with the first reference to keep exact left-to-right layout and materials; never mirror-flip the product.`
      : "";
  const specBlock = args.hasProductAnchor ? formatProductSpecPromptBlock(args.productSpec) : "";
  const hasRevisions = Boolean(scene.revisionNotes?.length);
  const revisionBlock = hasRevisions
    ? `\nClient Revision Notes (MANDATORY override for this scene):\n${scene.revisionNotes!.map((note, i) => `- ${i + 1}. ${note}`).join("\n")}\n`
    : "";
  const beatFileName = scene.postCutReferenceFileName ?? args.beatReferenceFileName;
  const clientRefBlock = scene.postCutReferenceDataUrl
    ? clientLocationReferencePromptBlock({ fileName: beatFileName })
    : args.referenceStillsFlythrough && args.hasSceneBeatRef && !hasRevisions
      ? clientLocationReferencePromptBlock({ fileName: beatFileName })
      : args.referenceStillsFlythrough && args.hasSceneBeatRef && hasRevisions
        ? `\nLocation reference (${beatFileName ?? "upload"}): use for layout, signage, materials, and camera angle; regenerate a new photoreal frame (do not paste the photo). Apply every Client Revision Note.\n`
        : "";
  const productLaws = args.hasProductAnchor
    ? `
Product fidelity (this scene shows the locked SKU):
1. Match the Locked Product Bible and product reference images at 1:1 for materials, color, proportions, and 0%..100% feature layout on visible faces.
2. Never mirror-flip the primary face left-for-right versus the bible and references.
3. Do not substitute a different product category or add features not in the bible.`
    : "";
  const combinedSceneText = `${plan.title} ${plan.logline} ${scene.storyboardPrompt} ${scene.sceneInstructions} ${(scene.revisionNotes || []).join(" ")}`;
  const wantsNoPeople =
    hasNegativePeopleConstraint(combinedSceneText) ||
    Boolean(args.referenceStillsFlythrough && args.hasSceneBeatRef && !args.hasProductAnchor);

  const stillsLead =
    args.referenceStillsFlythrough && args.hasSceneBeatRef && !args.hasProductAnchor
      ? hasRevisions
        ? `Reference-stills scene with client edits: the reference photograph guides layout and branding only. Generate a new cleaned-up photoreal frame from storyboardPrompt and Client Revision Notes (cleanly remove people, mirror the view, or fix distractions). Do not output the upload as a literal copy.\n`
        : `Reference-stills fly-through: the reference photograph guides layout, branding, materials, and camera angle. Generate a new photoreal cinematic frame from storyboardPrompt; never paste or embed the upload as the output image.\n`
      : "";
  const peopleRule = wantsNoPeople
    ? "3. ZERO HUMANS MANDATE: Render zero people. The space must be completely devoid of humans. Remove any staff, desk occupants, or customers from the reference photo. If a person was sitting at a desk or chair, paint the empty chair and desk surface cleanly."
    : hasRevisions
      ? "3. Client Revision Notes override storyboardPrompt, sceneInstructions, continuityNotes, and the reference photo. If notes forbid people, render zero humans."
      : "3. Keep people, pets, wardrobe, and props consistent with continuityNotes and beat references.";
  const refStillsPeopleLead = wantsNoPeople
    ? "MANDATORY ARCHITECTURAL FUSION: Match the reference image 1:1 for wall positions, window frames, door glass, cabinetry, flooring, ceiling lighting, and physical showroom layout. ZERO HUMANS: The room must be completely empty of people. Cleanly remove any person, staff member, or silhouette visible at desks, chairs, or doorways in the reference photograph. Replace them with the clean background/desk surface. Output a photoreal, pristine empty showroom with zero people.\n"
    : "";
  return `Storyboard frame ${scene.order} of ${plan.scenes.length} for the video "${plan.title}".
${stillsLead}${refStillsPeopleLead}${subjectRule}
${stageRule}
${thirdSlotRule}
${specBlock ? `${specBlock}\n` : ""}${revisionBlock}${scene.storyboardPrompt}${clientRefBlock}
${productLaws}
Scene fidelity (every frame):
1. Render exactly what the storyboardPrompt and sceneInstructions describe. Do not invent buildings, products, or props the Director did not specify.
2. Season & ground: match the environment plate or previous frame at this location. No unrequested snow or ice.
${peopleRule}

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
  /** Location still folder: beat photo is primary reference (no env plate / hero chain). */
  referenceStillsFlythrough?: boolean;
  beatReferenceFileName?: string;
}): Promise<string> {
  const productAnchor = resolveProductAnchorForScene({
    scene: args.scene,
    subjectDataUrl: args.subjectDataUrl,
    productViews: args.productViews,
  });
  const hasProductAnchor = Boolean(productAnchor.dataUrl);
  const beatRefUrl = args.sceneReferenceDataUrls[0];
  const hasSceneBeatRef = Boolean(beatRefUrl);
  const stillsRedraw =
    Boolean(args.referenceStillsFlythrough) && hasSceneBeatRef && !hasProductAnchor && Boolean(args.currentFrameDataUrl);

  const effectiveHeroFrame =
    hasProductAnchor || args.referenceStillsFlythrough ? undefined : args.heroFrameDataUrl;

  // Slot 2: Pick ONE stage/context anchor (never both empty environment plate and occupied same-location frame at once)
  const stageAnchorKind: "current" | "same_location" | "environment" | "hero" | "none" = args.currentFrameDataUrl
    ? "current"
    : args.referenceStillsFlythrough && hasSceneBeatRef && !hasProductAnchor
      ? "none"
      : args.sameLocationFrameDataUrl
        ? "same_location"
        : args.environmentDataUrl
          ? "environment"
          : effectiveHeroFrame
            ? "hero"
            : "none";
  const stageAnchorUrl = args.referenceStillsFlythrough && hasSceneBeatRef && !hasProductAnchor && !args.currentFrameDataUrl
    ? undefined
    : args.currentFrameDataUrl ??
      args.sameLocationFrameDataUrl ??
      args.environmentDataUrl ??
      effectiveHeroFrame;

  const thirdSlotUrl = beatRefUrl ?? productAnchor.secondaryDataUrl;

  const references =
    args.referenceStillsFlythrough && hasSceneBeatRef && !hasProductAnchor && !args.currentFrameDataUrl
      ? [beatRefUrl]
      : stillsRedraw && beatRefUrl
        ? [beatRefUrl, args.currentFrameDataUrl!].slice(0, STORYBOARD_MAX_REFERENCES)
        : [
            ...(productAnchor.dataUrl ? [productAnchor.dataUrl] : []),
            ...(stageAnchorUrl ? [stageAnchorUrl] : []),
            ...(thirdSlotUrl && thirdSlotUrl !== productAnchor.dataUrl && thirdSlotUrl !== stageAnchorUrl
              ? [thirdSlotUrl]
              : []),
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
      hasProductAnchor,
      referenceStillsFlythrough: args.referenceStillsFlythrough,
      beatReferenceFileName: args.beatReferenceFileName,
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
