import type { WordPressSite } from "@/components/integrations/types";
import { loadPpcGoogleGscContext } from "@/lib/ppc/google-ads-gsc-context";
import type { PpcGscPageContext, PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import {
  buildMetaGscQueriesMarkdown,
  buildMetaUnifiedContextBlock,
  loadMetaContextResearch,
  loadMetaNeoPulseAppContextResearch,
  metaContextResearchToLandingPage,
  metaNeoPulseAppLandingPage,
  type MetaContextResearch,
} from "@/lib/ppc/meta-ad-context-assembler";
import {
  createMetaResearchSection,
  META_RESEARCH_SECTION_IDS,
  upsertMetaResearchSection,
} from "@/lib/ppc/meta-ad-research-sections";
import { resolveMetaAdLocalityContext } from "@/lib/ppc/meta-ad-locality-context";
import type { MetaGenerateGranularStepId } from "@/lib/social/social-creator-progress-types";
import type {
  MetaAdColorPalette,
  MetaAdContextSource,
  MetaAdResearchSection,
} from "@/lib/social/social-creator-types";
import {
  publishMergedResearchSections,
  type MetaAdGeneratePartialUpdate,
} from "./run-social-creator-generate-types";

export async function loadSocialCreatorGenerateContext(args: {
  isNeoPulseAppContext: boolean;
  needsContextResearch: boolean;
  needsLandingResearch: boolean;
  hasLandingUrl: boolean;
  hasCustomContextUrl: boolean;
  customContextUrl: string;
  resolvedLandingUrl: string;
  resolvedKeyword: string;
  site: WordPressSite;
  resolvedContextSource: MetaAdContextSource;
  teamName?: string | null;
  imagePromptModifier?: string;
  colorPalette?: MetaAdColorPalette;
  signal?: AbortSignal;
  researchSections: MetaAdResearchSection[];
  onResearchSections?: (sections: MetaAdResearchSection[]) => void;
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void;
  runStep: <T>(stepId: MetaGenerateGranularStepId, fn: () => Promise<T>) => Promise<T>;
}): Promise<{
  researchSections: MetaAdResearchSection[];
  pageContext: string;
  landingPage: PpcWpPageContext | undefined;
  finalUrl: string;
  locality: ReturnType<typeof resolveMetaAdLocalityContext>;
}> {
  const {
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
    onResearchSections,
    onPartialUpdate,
    runStep,
  } = args;
  let researchSections = args.researchSections;

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

  return {
    researchSections,
    pageContext,
    landingPage,
    finalUrl,
    locality,
  };
}
