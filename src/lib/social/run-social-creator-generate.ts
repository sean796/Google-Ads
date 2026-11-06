import type { WordPressSite } from "@/components/integrations/types";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { loadPpcGoogleMasterRules } from "@/lib/ppc/load-ppc-google-master-rules";
import {
  applyUserVisualToolPaletteToBrief,
} from "@/lib/ppc/meta-ad-creative-brief";
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
  type SocialGenerateProgressState,
} from "@/lib/social/social-creator-progress-types";
import {
  resolveAllowPeopleInImage,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import {
  runMetaAdCreativeBriefAgent,
  runMetaAdImageAgent,
  runMetaAdImageChecklistAgent,
  runMetaAdInstagramGoalAgent,
  runMetaAdInstagramReferenceAgent,
  runMetaAdVisualReferencePlanAgent,
} from "@/lib/ppc/meta-ad-agents";
import {
  formatContentCreatorChecklistFeedback,
  runContentCalendarFbInstagramCopyAgent,
  runContentCalendarSocialBriefAgent,
  runContentCalendarSocialCopyChecklistAgent,
} from "@/lib/social/content-creator-agents";
import { contentCreatorSocialBriefMarkdown } from "@/lib/social/content-creator-social-brief";
import { clampInstagramCaption } from "@/lib/social/content-creator-social-copy-limits";
import {
  type MetaAdChecklistItem,
  type MetaAdResearchSection,
  metaGoalToBlueprint,
} from "@/lib/social/social-creator-types";
import { metaContextUrlsMatch } from "@/lib/ppc/meta-ad-context-assembler";
import {
  isNeoPulseProductLandingUrl,
} from "@/lib/ppc/neo-pulse-meta-marketing-context";
import { getNeoPulseMetaProgramBrief } from "@/lib/ppc/load-neo-pulse-meta-program-brief";
import {
  organicCaptionToMetaAdCopy,
  patchPhase,
  patchStep,
  publishMergedResearchSections,
  publishPartialUpdate,
  resolveContextSource,
  type MetaAdGeneratePartialUpdate,
  type RunSocialCreatorGenerateOptions,
  type RunSocialCreatorGenerateResult,
} from "./run-social-creator-generate-types";
import { loadSocialCreatorGenerateContext } from "./run-social-creator-generate-context";

export type {
  MetaAdGeneratePartialUpdate,
  RunSocialCreatorGenerateOptions,
  RunSocialCreatorGenerateResult,
} from "./run-social-creator-generate-types";

export async function runSocialCreatorGenerate(
  options: RunSocialCreatorGenerateOptions,
): Promise<RunSocialCreatorGenerateResult> {
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

  const loadedContext = await loadSocialCreatorGenerateContext({
    isNeoPulseAppContext,
    needsContextResearch,
    needsLandingResearch,
    hasLandingUrl,
    hasCustomContextUrl,
    customContextUrl,
    resolvedLandingUrl,
    resolvedKeyword,
    site,
    resolvedContextSource,
    teamName,
    imagePromptModifier,
    colorPalette,
    signal,
    researchSections,
    onResearchSections,
    onPartialUpdate,
    runStep,
  });
  researchSections = loadedContext.researchSections;
  const pageContext = loadedContext.pageContext;
  const landingPage = loadedContext.landingPage;
  const finalUrl = loadedContext.finalUrl;
  const locality = loadedContext.locality;

  const resolvedSiteName = site.name?.trim();
  if (!resolvedSiteName) {
    throw new Error("Connected site name is required.");
  }

  const isContextVisualMode = config.defaultVisualToolMode === "context";

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

  const creativeBriefRaw = await runStep("creative-brief", () =>
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
      visualToolMode: isContextVisualMode ? "context" : "fixed",
      signal,
    }),
  );
  const creativeBrief =
    visualToolPalette != null
      ? applyUserVisualToolPaletteToBrief(creativeBriefRaw, visualToolPalette)
      : creativeBriefRaw;
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

  const socialBrief = await runStep("copy-checklist", () =>
    runContentCalendarSocialBriefAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      siteName: resolvedSiteName,
      siteUrl: site.siteUrl ?? "",
      keyword: resolvedKeyword || goal.primaryTopic,
      landingPageUrl: finalUrl,
      pageContext,
      signal,
    }).then((brief) => {
      researchSections = upsertMetaResearchSection(
        researchSections,
        createMetaResearchSection(
          "social-strategy-brief",
          "done",
          contentCreatorSocialBriefMarkdown(brief),
        ),
      );
      researchSections = publishMergedResearchSections(
        researchSections,
        onResearchSections,
        onPartialUpdate,
      );
      return brief;
    }),
  );

  const keyword = resolvedKeyword || goal.primaryTopic;
  const manualFb = fbInstagramContent?.trim() || "";
  let fbResult =
    manualFb.length > 0
      ? { fbInstagramContent: clampInstagramCaption(manualFb, socialBrief.hashtags) }
      : await runStep("meta-copy", () =>
          runContentCalendarFbInstagramCopyAgent({
            apiKey,
            model: researchModel,
            siteId: site.id,
            siteName: resolvedSiteName,
            siteUrl: site.siteUrl ?? "",
            keyword,
            socialBrief,
            landingPageUrl: finalUrl,
            pageContext,
            signal,
          }),
        );

  let socialCopyChecklist: MetaAdChecklistItem[] = [];
  if (manualFb.length === 0) {
    socialCopyChecklist = await runContentCalendarSocialCopyChecklistAgent({
      apiKey,
      model: researchModel,
      siteId: site.id,
      keyword,
      socialBrief,
      fbInstagramContent: fbResult.fbInstagramContent,
      hasEventContext: false,
      signal,
    });
    if (socialCopyChecklist.length > 0) {
      fbResult = await runStep("meta-copy", () =>
        runContentCalendarFbInstagramCopyAgent({
          apiKey,
          model: researchModel,
          siteId: site.id,
          siteName: resolvedSiteName,
          siteUrl: site.siteUrl ?? "",
          keyword,
          socialBrief,
          landingPageUrl: finalUrl,
          pageContext,
          checklistFeedback: formatContentCreatorChecklistFeedback(socialCopyChecklist),
          signal,
        }),
      );
    }
  }
  publishPartialUpdate({ copyChecklist: socialCopyChecklist }, onPartialUpdate);

  const resolvedFbInstagramContent = fbResult.fbInstagramContent;
  publishPartialUpdate({ fbInstagramContent: resolvedFbInstagramContent }, onPartialUpdate);
  const imageCopy = organicCaptionToMetaAdCopy(resolvedFbInstagramContent, finalUrl, keyword);

  if (!includeImage) {
    progress = { ...progress, activeStepId: null, label: "Generate Social post", statusMessage: "Complete" };
    onProgress(progress);
    return {
      goal,
      creativeBrief,
      blueprint,
      copyChecklist: socialCopyChecklist,
      fbInstagramContent: resolvedFbInstagramContent,
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
      copy: imageCopy,
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

  progress = { ...progress, activeStepId: null, label: "Generate Social post", statusMessage: "Complete" };
  onProgress(progress);

  return {
    goal,
    creativeBrief,
    blueprint,
    copyChecklist: socialCopyChecklist,
    fbInstagramContent: resolvedFbInstagramContent,
    imageChecklist,
    visualReferenceElements,
    creative: imageResult.creative,
    imagePromptDescription: imageResult.imagePromptDescription,
    imageReferences: reference.referenceSummaries,
    researchSections,
  };
}
