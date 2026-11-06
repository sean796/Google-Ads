import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { loadPpcGoogleMasterRules } from "@/lib/ppc/load-ppc-google-master-rules";
import { metaContextUrlsMatch } from "@/lib/ppc/meta-ad-context-assembler";
import { applyUserVisualToolPaletteToBrief } from "@/lib/ppc/meta-ad-creative-brief";
import {
  buildCreativeBriefSectionMarkdown,
  buildImageReferencesMarkdown,
  buildInstagramGoalMarkdown,
  buildVisualReferencePlanSectionMarkdown,
  createMetaResearchSection,
  META_RESEARCH_SECTION_IDS,
  upsertMetaResearchSection,
} from "@/lib/ppc/meta-ad-research-sections";
import {
  createInitialMetaGenerateProgress,
  type MetaGenerateGranularStepId,
} from "@/lib/ppc/meta-ads-progress-types";
import { resolveAllowPeopleInImage } from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import {
  runMetaAdCopyAgent,
  runMetaAdCopyChecklistAgent,
  runMetaAdCreativeBriefAgent,
  runMetaAdImageAgent,
  runMetaAdImageChecklistAgent,
  runMetaAdInstagramGoalAgent,
  runMetaAdInstagramReferenceAgent,
  runMetaAdVisualReferencePlanAgent,
} from "@/lib/ppc/meta-ad-agents";
import { metaGoalToBlueprint, type MetaAdResearchSection } from "@/lib/ppc/meta-ads-types";
import { getNeoPulseMetaProgramBrief } from "@/lib/ppc/load-neo-pulse-meta-program-brief";
import type {
  RunPpcMetaAdGenerateOptions,
  RunPpcMetaAdGenerateResult,
} from "@/lib/ppc/run-ppc-meta-ad-generate-types";
import {
  patchPhase,
  patchStep,
  publishMergedResearchSections,
  publishPartialUpdate,
  resolveContextSource,
} from "@/lib/ppc/run-ppc-meta-ad-generate-publish";
import { loadMetaGenerateContextPhase } from "@/lib/ppc/run-ppc-meta-ad-generate-context";

export type {
  MetaAdGeneratePartialUpdate,
  RunPpcMetaAdGenerateOptions,
  RunPpcMetaAdGenerateResult,
} from "@/lib/ppc/run-ppc-meta-ad-generate-types";

export async function runPpcMetaAdGenerate(
  options: RunPpcMetaAdGenerateOptions,
): Promise<RunPpcMetaAdGenerateResult> {
  const {
    site,
    apiKey,
    config,
    focusKeyword,
    contextSource,
    contextUrl,
    landingPageUrl,
    allowPeopleInImage,
    imagePromptModifier,
    fbInstagramContent,
    typographyStyle,
    colorPalette,
    visualToolPalette,
    teamName,
    onProgress,
    onResearchSections,
    onPartialUpdate,
    signal,
  } = options;

  const researchModel = getResearchModel(site.id);
  const imageModel = getImageModel(site.id);
  const resolvedContextSource = resolveContextSource(contextSource);
  const isNeoPulseAppContext = resolvedContextSource === "neo-pulse_app";
  const customContextUrl = contextUrl?.trim() ?? "";
  const hasCustomContextUrl = !isNeoPulseAppContext && /^https?:\/\//i.test(customContextUrl);
  const resolvedLandingUrl = landingPageUrl?.trim() || "";
  const hasLandingUrl = /^https?:\/\//i.test(resolvedLandingUrl);
  const needsLandingResearch =
    hasLandingUrl &&
    (isNeoPulseAppContext ||
      !hasCustomContextUrl ||
      !metaContextUrlsMatch(customContextUrl, resolvedLandingUrl));
  const needsContextResearch = hasCustomContextUrl;
  const includeImage = config.includeImage !== false;

  let researchSections: MetaAdResearchSection[] = [];

  let progress = createInitialMetaGenerateProgress({
    includePrefetch: true,
    includeLoadContext:
      needsContextResearch || needsLandingResearch || hasLandingUrl || isNeoPulseAppContext,
    includeImageSteps: includeImage,
  });
  onProgress(progress);

  const runStep = async <T>(stepId: MetaGenerateGranularStepId, fn: () => Promise<T>): Promise<T> => {
    progress = patchStep(progress, stepId, "running");
    onProgress(progress);
    try {
      const result = await fn();
      progress = patchStep(progress, stepId, "done");
      onProgress(progress);
      return result;
    } catch (err) {
      progress = patchStep(
        progress,
        stepId,
        "error",
        err instanceof Error ? err.message : "Step failed",
      );
      onProgress(progress);
      throw err;
    }
  };

  await runStep("read-master-rules", () => loadPpcGoogleMasterRules(site.id));

  const resolvedKeyword = focusKeyword?.trim() || "";


  const contextPhase = await loadMetaGenerateContextPhase({
    site,
    resolvedContextSource,
    isNeoPulseAppContext,
    customContextUrl,
    hasCustomContextUrl,
    resolvedLandingUrl,
    hasLandingUrl,
    needsLandingResearch,
    needsContextResearch,
    resolvedKeyword,
    teamName,
    imagePromptModifier,
    colorPalette,
    signal,
    runStep,
    onResearchSections,
    onPartialUpdate,
  });
  const { pageContext, landingPage, finalUrl, locality, resolvedSiteName } = contextPhase;
  researchSections = contextPhase.researchSections;


  const goal = await runStep("instagram-goal", () =>
    runMetaAdInstagramGoalAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      siteName: resolvedSiteName,
      landingPage,
      pageContext,
      focusKeyword: resolvedKeyword,
      placement: config.placement,
      landingPageUrl: finalUrl,
      teamName,
      contextSource: resolvedContextSource,
      signal,
    }),
  );
  const blueprint = metaGoalToBlueprint(goal);

  researchSections = upsertMetaResearchSection(
    researchSections,
    createMetaResearchSection(
      META_RESEARCH_SECTION_IDS.instagramGoal,
      "done",
      buildInstagramGoalMarkdown(goal),
    ),
  );
  researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  publishPartialUpdate({ instagramGoal: goal, blueprint }, onPartialUpdate);

  const creativeBrief = applyUserVisualToolPaletteToBrief(
    await runStep("creative-brief", () =>
      runMetaAdCreativeBriefAgent({
        apiKey,
        model: researchModel,
        siteId: site.id,
        goal,
        focusKeyword: resolvedKeyword,
        placement: config.placement,
        pageContext,
        teamName,
        contextSource: resolvedContextSource,
        localityCity: locality.hasLocality ? locality.city : undefined,
        localityRegion: locality.region || undefined,
        siteName: resolvedSiteName,
        colorPalette,
        visualToolPalette,
        signal,
      }),
    ),
    visualToolPalette,
  );
  const resolvedAllowPeopleInImage = resolveAllowPeopleInImage(
    creativeBrief.visualToolPalette,
    allowPeopleInImage,
  );
  const resolvedTypographyStyle = resolveMetaTypographyStyle(
    typographyStyle ?? config.defaultTypographyStyle,
  );
  researchSections = upsertMetaResearchSection(
    researchSections,
    createMetaResearchSection(
      META_RESEARCH_SECTION_IDS.creativeBrief,
      "done",
      buildCreativeBriefSectionMarkdown(creativeBrief),
    ),
  );
  researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  publishPartialUpdate({ creativeBrief }, onPartialUpdate);

  const copyChecklist = await runStep("copy-checklist", () =>
    runMetaAdCopyChecklistAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      goal,
      blueprint,
      creativeBrief,
      landingPage,
      pageContext,
      focusKeyword: resolvedKeyword,
      teamName,
      contextSource: resolvedContextSource,
      siteName: resolvedSiteName,
      signal,
    }),
  );
  publishPartialUpdate({ copyChecklist }, onPartialUpdate);

  const copy = await runStep("meta-copy", () =>
    runMetaAdCopyAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      goal,
      blueprint,
      creativeBrief,
      checklist: copyChecklist,
      landingPage,
      pageContext,
      finalUrl: finalUrl.trim() || site.siteUrl?.trim() || "",
      focusKeyword: resolvedKeyword,
      teamName,
      contextSource: resolvedContextSource,
      siteName: resolvedSiteName,
      fbInstagramContent: fbInstagramContent?.trim() || undefined,
      signal,
    }),
  );
  publishPartialUpdate({ copy }, onPartialUpdate);

  if (!includeImage) {
    progress = { ...progress, activeStepId: null, label: "Generate Meta ad", statusMessage: "Complete" };
    onProgress(progress);
    return {
      goal,
      creativeBrief,
      blueprint,
      copyChecklist,
      copy,
      imageReferences: [],
      researchSections,
    };
  }

  const visualReferenceElements = await runStep("visual-reference-plan", () =>
    runMetaAdVisualReferencePlanAgent({
      apiKey,
      model: researchModel,
      goal,
      creativeBrief,
      placement: config.placement,
      focusKeyword: resolvedKeyword,
      contextSource: resolvedContextSource,
      programBrief: isNeoPulseAppContext ? getNeoPulseMetaProgramBrief() : undefined,
      localityCity: locality.hasLocality ? locality.city : undefined,
      signal,
    }),
  );
  researchSections = upsertMetaResearchSection(
    researchSections,
    createMetaResearchSection(
      META_RESEARCH_SECTION_IDS.visualReferencePlan,
      "done",
      buildVisualReferencePlanSectionMarkdown(visualReferenceElements),
    ),
  );
  researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  publishPartialUpdate({ visualReferenceElements }, onPartialUpdate);

  const imageChecklist = await runStep("image-checklist", () =>
    runMetaAdImageChecklistAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      goal,
      blueprint,
      creativeBrief,
      copy,
      pageContext,
      focusKeyword: resolvedKeyword,
      placement: config.placement,
      teamName,
      contextSource: resolvedContextSource,
      allowPeopleInImage: resolvedAllowPeopleInImage,
      localityCity: locality.hasLocality ? locality.city : undefined,
      siteName: resolvedSiteName,
      visualReferenceElements,
      signal,
    }),
  );
  publishPartialUpdate({ imageChecklist }, onPartialUpdate);

  const reference = await runStep("image-reference", () =>
    runMetaAdInstagramReferenceAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      placement: config.placement,
      focusKeyword: resolvedKeyword,
      userFocusKeyword: focusKeyword?.trim() || undefined,
      landingPage,
      creativeBrief,
      visualDirection: creativeBrief.visualConcept,
      referenceElements: visualReferenceElements,
      allowPeopleInImage: resolvedAllowPeopleInImage,
      signal,
    }),
  );
  researchSections = upsertMetaResearchSection(
    researchSections,
    createMetaResearchSection(
      META_RESEARCH_SECTION_IDS.imageReferences,
      "done",
      buildImageReferencesMarkdown(reference.referenceSummaries),
    ),
  );
  researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  publishPartialUpdate({ imageReferences: reference.referenceSummaries }, onPartialUpdate);

  progress = patchPhase(progress, "image-prompt", "running");
  onProgress(progress);

  const imageResult = await runStep("image-generate", () =>
    runMetaAdImageAgent({
      apiKey,
      model: imageModel,
      researchModel,
      siteId: site.id,
      goal,
      blueprint,
      creativeBrief,
      focusKeyword: resolvedKeyword,
      checklist: imageChecklist,
      placement: config.placement,
      reference,
      allowPeopleInImage: resolvedAllowPeopleInImage,
      imagePromptModifier,
      colorPalette,
      localityCity: locality.hasLocality ? locality.city : undefined,
      siteName: resolvedSiteName,
      typographyStyle: resolvedTypographyStyle,
      pageContext,
      signal,
    }),
  );
  publishPartialUpdate(
    {
      creative: imageResult.creative,
      imagePromptDescription: imageResult.imagePromptDescription,
    },
    onPartialUpdate,
  );
  progress = patchPhase(progress, "image-prompt", "done");
  onProgress(progress);

  progress = { ...progress, activeStepId: null, label: "Generate Meta ad", statusMessage: "Complete" };
  onProgress(progress);

  return {
    goal,
    creativeBrief,
    blueprint,
    copyChecklist,
    copy,
    imageChecklist,
    visualReferenceElements,
    creative: imageResult.creative,
    imagePromptDescription: imageResult.imagePromptDescription,
    imageReferences: reference.referenceSummaries,
    researchSections,
  };
}
