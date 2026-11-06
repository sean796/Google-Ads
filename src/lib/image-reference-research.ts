/**
 * Shared Google Images (DataForSEO) reference research for AI image generation.
 * Solo: intent evidence plan → parallel SERP → vision fit vs acceptanceBrief → data URLs.
 * Other modes: classify → SERP → soft vision pick.
 * Does not scrape publisher sites; only DFS Google Images + image file prefetch.
 */


import { getMetaModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { logFeaturedImagePipeline } from "@/lib/image-generator/featured-image-pipeline-log";
import {
  classifyImageGroundingTargets,
  planFeaturedImageEvidenceNeeds,
  planImageEvidenceNeeds,
} from "@/lib/image-reference-grounding-planners";
import {
  defaultLayerForKind,
  evidenceNeedsToTargets,
  IMAGE_REF_MAX_TARGETS,
  type ImageGroundingClassification,
  type ImageGroundingTarget,
  type ImageReferenceResearchContext,
  type ImageReferenceResearchResult,
  type ImageReferenceResult,
} from "@/lib/image-reference-research-types-parsers";
import {
  buildVisionHint,
  enrichReferencesUsageGuidance,
  fetchGoogleImagesForQuery,
  pickTopReferencesForTarget,
} from "@/lib/image-reference-vision-ranker";
import { describePlaceSpatialLayout } from "@/lib/image-reference-spatial-contract";

export {
  IMAGE_REF_CANDIDATE_LIMIT,
  IMAGE_REF_FIT_MIN,
  IMAGE_REF_QUALITY_MIN,
  IMAGE_REF_MAX_TARGETS,
  IMAGE_REF_SOLO_MAX_TARGETS,
  IMAGE_REF_SOLO_MAX_PER_TARGET,
  IMAGE_REF_PLACE_FANOUT_MAX,
  IMAGE_REF_SUBJECT_FANOUT_MAX,
  IMAGE_REF_SUBJECT_WITH_PLACE_MAX,
  allocateSoloFanOutCaps,
  capGoogleImagesCandidates,
  defaultLayerForKind,
  parseImageGroundingClassification,
  parseImageEvidenceNeeds,
  evidenceNeedsToTargets,
  parseSoftReferencePick,
  parseSoftReferenceMultiPick,
  recoverSoftPickFromPartialText,
  softPickPasses,
  parseQueryFanOutTargets,
  parsePlaceFanOutTargets,
  parseSubjectFanOutTargets,
} from "@/lib/image-reference-research-types-parsers";
export type {
  ImageGroundingKind,
  ImageGroundingLayer,
  ImageGroundingTarget,
  ImageEvidenceNeed,
  ImageEvidencePlan,
  ImageGroundingClassification,
  ImageReferenceResult,
  ImageReferenceResearchResult,
  ImageReferenceResearchContext,
} from "@/lib/image-reference-research-types-parsers";
export {
  fanOutPlaceSpatialTargets,
  fanOutSubjectTargets,
  classifyImageGroundingTargets,
  planImageEvidenceNeeds,
  planFeaturedImageEvidenceNeeds,
} from "@/lib/image-reference-grounding-planners";
export {
  parseReferenceUsageGuidanceList,
  applyReferenceUsageGuidance,
} from "@/lib/image-reference-vision-ranker";
export type { ReferenceUsageGuidance } from "@/lib/image-reference-vision-ranker";
export {
  parsePlaceSpatialLayout,
  formatSpatialLayoutContract,
  collectReferenceDataUrls,
  buildGroundedImagePromptSuffix,
} from "@/lib/image-reference-spatial-contract";
export type { PlaceSpatialLayout } from "@/lib/image-reference-spatial-contract";

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
