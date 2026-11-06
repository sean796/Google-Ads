import type { WordPressSite } from "@/components/integrations/types";
import { getImageModel, getResearchModel } from "@/lib/optimization-settings-storage";
import { loadPpcGoogleMasterRules } from "@/lib/ppc/load-ppc-google-master-rules";
import { loadPpcGoogleGscContext } from "@/lib/ppc/google-ads-gsc-context";
import type { PpcGscPageContext, PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import {
  buildMetaGscQueriesMarkdown,
  buildMetaUnifiedContextBlock,
  loadMetaContextResearch,
  loadMetaNeoPulseAppContextResearch,
  metaContextResearchToLandingPage,
  metaContextUrlsMatch,
  metaNeoPulseAppLandingPage,
  type MetaContextResearch,
} from "@/lib/ppc/meta-ad-context-assembler";
import { applyUserVisualToolPaletteToBrief } from "@/lib/ppc/meta-ad-creative-brief";
import {
  buildCreativeBriefSectionMarkdown,
  buildImageReferencesMarkdown,
  buildInstagramGoalMarkdown,
  buildVisualReferencePlanSectionMarkdown,
  createMetaResearchSection,
  META_RESEARCH_SECTION_IDS,
  syncMetaMergedResearchSections,
  upsertMetaResearchSection,
} from "@/lib/ppc/meta-ad-research-sections";
import { resolveMetaAdLocalityContext } from "@/lib/ppc/meta-ad-locality-context";
import {
  createInitialMetaGenerateProgress,
  patchMetaGenerateGranularStep,
  type MetaGenerateGranularStepId,
  type SocialGenerateProgressState,
  type MetaGenerateStepId,
} from "@/lib/social/social-creator-progress-types";
import {
  resolveAllowPeopleInImage,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle, type MetaAdTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
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
  type MetaAdBlueprint,
  type MetaAdChecklistItem,
  type MetaAdContextSource,
  type MetaAdCopy,
  type MetaAdCreative,
  type MetaAdCreativeBrief,
  type MetaAdInstagramGoal,
  type MetaAdResearchSection,
  type MetaAdVisualReferenceElement,
  type SocialGenerateConfig,
  type SocialCreatorRow,
  type MetaAdColorPalette,
  metaGoalToBlueprint,
} from "@/lib/social/social-creator-types";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import {
  isNeoPulseProductLandingUrl,
} from "@/lib/ppc/neo-pulse-meta-marketing-context";
import { getNeoPulseMetaProgramBrief } from "@/lib/ppc/load-neo-pulse-meta-program-brief";

export type RunSocialCreatorGenerateResult = {
  goal: MetaAdInstagramGoal;
  creativeBrief: MetaAdCreativeBrief;
  blueprint: MetaAdBlueprint;
  copyChecklist: MetaAdChecklistItem[];
  fbInstagramContent: string;
  imageChecklist?: MetaAdChecklistItem[];
  visualReferenceElements?: MetaAdVisualReferenceElement[];
  creative?: MetaAdCreative;
  imagePromptDescription?: string;
  imageReferences: MetaAdImageReferenceSummary[];
  researchSections: MetaAdResearchSection[];
};

export type MetaAdGeneratePartialUpdate = Partial<
  Pick<
    SocialCreatorRow,
    | "instagramGoal"
    | "creativeBrief"
    | "blueprint"
    | "copyChecklist"
    | "fbInstagramContent"
    | "imageChecklist"
    | "visualReferenceElements"
    | "imageReferences"
    | "creative"
    | "imagePromptDescription"
    | "researchSections"
  >
>;

export type RunSocialCreatorGenerateOptions = {
  site: WordPressSite;
  apiKey: string;
  model: string;
  config: SocialGenerateConfig;
  focusKeyword?: string;
  contextSource?: MetaAdContextSource;
  contextUrl?: string;
  landingPageUrl?: string;
  allowPeopleInImage?: boolean;
  imagePromptModifier?: string;
  fbInstagramContent?: string;
  typographyStyle?: MetaAdTypographyStyle;
  colorPalette?: MetaAdColorPalette;
  visualToolPalette?: MetaAdCreativeBrief["visualToolPalette"];
  teamName?: string | null;
  onProgress: (progress: SocialGenerateProgressState) => void;
  onResearchSections?: (sections: MetaAdResearchSection[]) => void;
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void;
  signal?: AbortSignal;
};

function patchStep(
  progress: SocialGenerateProgressState,
  stepId: MetaGenerateGranularStepId,
  status: "running" | "done" | "error",
  statusMessage?: string,
): SocialGenerateProgressState {
  return patchMetaGenerateGranularStep(progress, stepId, status, statusMessage);
}

function patchPhase(
  progress: SocialGenerateProgressState,
  stepId: MetaGenerateStepId,
  status: "running" | "done" | "error",
  statusMessage?: string,
): SocialGenerateProgressState {
  const steps = progress.steps.map((step) =>
    step.id === stepId ? { ...step, status } : step,
  );
  const completed = steps.filter((step) => step.status === "done").length;
  const active = steps.find((step) => step.status === "running");
  return {
    ...progress,
    steps,
    activeStepId: status === "running" ? stepId : progress.activeStepId,
    completed,
    label: active?.label ?? progress.label,
    statusMessage,
  };
}

function publishMergedResearchSections(
  sections: MetaAdResearchSection[],
  onResearchSections?: (sections: MetaAdResearchSection[]) => void,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  const merged = syncMetaMergedResearchSections(sections);
  publishResearchSections(merged, onResearchSections, onPartialUpdate);
  return merged;
}

function resolveContextSource(source: MetaAdContextSource | undefined): MetaAdContextSource {
  return source === "neo-pulse_app" ? "neo-pulse_app" : "custom";
}

function publishPartialUpdate(
  patch: MetaAdGeneratePartialUpdate,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  onPartialUpdate?.(patch);
}

function publishResearchSections(
  sections: MetaAdResearchSection[],
  onResearchSections?: (sections: MetaAdResearchSection[]) => void,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  onResearchSections?.(sections);
  publishPartialUpdate({ researchSections: sections }, onPartialUpdate);
}

function organicCaptionToMetaAdCopy(
  caption: string,
  finalUrl: string,
  headline: string,
): MetaAdCopy {
  return {
    primaryText: caption,
    headline,
    description: "",
    cta: "Learn More",
    finalUrl,
  };
}

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

  let contextResearch: MetaContextResearch | null = null;
  let landingResearch: MetaContextResearch | null = null;
  let gscPage: PpcGscPageContext | undefined;

  if (isNeoPulseAppContext) {
    contextResearch = loadMetaNeoPulseAppContextResearch();
    researchSections = upsertMetaResearchSection(
      researchSections,
      createMetaResearchSection(
        META_RESEARCH_SECTION_IDS.neoPulseAppContext,
        "done",
        contextResearch.markdown,
      ),
    );
    researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  }

  if (needsContextResearch) {
    contextResearch = await runStep("load-seo-context", () =>
      loadMetaContextResearch(customContextUrl, {
        focusKeyword: resolvedKeyword || undefined,
        signal,
      }),
    );
    researchSections = upsertMetaResearchSection(
      researchSections,
      createMetaResearchSection(
        META_RESEARCH_SECTION_IDS.contextUrl,
        "done",
        contextResearch.markdown,
      ),
    );
    researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  }

  if (needsLandingResearch) {
    landingResearch = await runStep("load-landing-research", () =>
      loadMetaContextResearch(resolvedLandingUrl, {
        focusKeyword: resolvedKeyword || undefined,
        signal,
      }),
    );
    researchSections = upsertMetaResearchSection(
      researchSections,
      createMetaResearchSection(
        META_RESEARCH_SECTION_IDS.landingPage,
        "done",
        landingResearch.markdown,
      ),
    );
    researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
  }

  if (hasLandingUrl) {
    gscPage = (
      await runStep("load-gsc-queries", () =>
        loadPpcGoogleGscContext(site, [{ url: resolvedLandingUrl, title: resolvedLandingUrl, excerpt: "", metaDescription: "", keyword: "" }], signal),
      )
    )[0];
    const gscMarkdown = buildMetaGscQueriesMarkdown(gscPage);
    if (gscMarkdown.trim()) {
      researchSections = upsertMetaResearchSection(
        researchSections,
        createMetaResearchSection(META_RESEARCH_SECTION_IDS.gscQueries, "done", gscMarkdown),
      );
      researchSections = publishMergedResearchSections(researchSections, onResearchSections, onPartialUpdate);
    }
  }

  const pageContext = buildMetaUnifiedContextBlock({
    contextResearch,
    landingResearch,
    gscMarkdown: buildMetaGscQueriesMarkdown(gscPage),
    focusKeyword: resolvedKeyword,
    contextSource: resolvedContextSource,
    teamName,
    imagePromptModifier,
    colorPalette,
  });

  let landingPage: PpcWpPageContext | undefined;
  if (landingResearch) {
    landingPage = metaContextResearchToLandingPage(landingResearch, resolvedKeyword);
  } else if (isNeoPulseAppContext) {
    landingPage = metaNeoPulseAppLandingPage(resolvedKeyword);
  } else if (contextResearch) {
    landingPage = metaContextResearchToLandingPage(contextResearch, resolvedKeyword);
  }

  const finalUrl =
    resolvedLandingUrl ||
    (hasCustomContextUrl ? customContextUrl : "") ||
    site.siteUrl?.trim() ||
    "";

  if (!finalUrl.trim() && !resolvedKeyword && !isNeoPulseAppContext) {
    throw new Error("Add a focus keyword or landing page URL before generating.");
  }
  if (!isNeoPulseAppContext && !hasCustomContextUrl && !resolvedKeyword) {
    throw new Error("Add a focus keyword, NEO Pulse app context, or custom context URL before generating.");
  }

  const locality = resolveMetaAdLocalityContext({
    focusKeyword: resolvedKeyword,
    landingPage,
  });

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
