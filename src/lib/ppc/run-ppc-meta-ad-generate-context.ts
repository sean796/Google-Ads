import type { WordPressSite } from "@/components/integrations/types";
import type { PpcGscPageContext, PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import { loadPpcGoogleGscContext } from "@/lib/ppc/google-ads-gsc-context";
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
import type { MetaGenerateGranularStepId } from "@/lib/ppc/meta-ads-progress-types";
import type {
  MetaAdColorPalette,
  MetaAdContextSource,
  MetaAdResearchSection,
} from "@/lib/ppc/meta-ads-types";
import { publishMergedResearchSections } from "@/lib/ppc/run-ppc-meta-ad-generate-publish";
import type { MetaAdGeneratePartialUpdate } from "@/lib/ppc/run-ppc-meta-ad-generate-types";

export async function loadMetaGenerateContextPhase(args: {
  site: WordPressSite;
  resolvedContextSource: MetaAdContextSource;
  isNeoPulseAppContext: boolean;
  customContextUrl: string;
  hasCustomContextUrl: boolean;
  resolvedLandingUrl: string;
  hasLandingUrl: boolean;
  needsLandingResearch: boolean;
  needsContextResearch: boolean;
  resolvedKeyword: string;
  teamName?: string | null;
  imagePromptModifier?: string;
  colorPalette?: MetaAdColorPalette;
  signal?: AbortSignal;
  runStep: <T>(stepId: MetaGenerateGranularStepId, fn: () => Promise<T>) => Promise<T>;
  onResearchSections?: (sections: MetaAdResearchSection[]) => void;
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void;
}) {
  const {
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
  } = args;
  let researchSections: MetaAdResearchSection[] = [];

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
        loadPpcGoogleGscContext(
          site,
          [
            {
              url: resolvedLandingUrl,
              title: resolvedLandingUrl,
              excerpt: "",
              metaDescription: "",
              keyword: "",
            },
          ],
          signal,
        ),
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

  return { pageContext, landingPage, finalUrl, locality, resolvedSiteName, researchSections };
}
