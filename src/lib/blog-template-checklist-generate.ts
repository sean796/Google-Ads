import { streamChatCompletion } from "./api";
import type { KeywordData, PeopleAlsoAsk } from "./keyword-types";
import type { CheckedExternalLink } from "./external-research";
import type { ImportedDraftLink } from "./bulk/blog-import-draft-links";
import type { ModifierExternalLink, LlmAuditAuthorityLinkLike } from "./bulk/modifier-external-links";
import type { ExternalLinkPair } from "./content-generation/external-link-placeholders";
import { deriveSerpH2Outline, validateSerpH2OutlineTitles } from "@/lib/content-optimization/serp-h2-outline";
import { isCompetitorCsvKeyword } from "@/lib/competitor-research/competitor-csv-row";
import { appendUniversalContentRulesToSystemPrompt } from "@/lib/content-word-blocklist";
import { isLlmAuditAuthorityDumpChecklistItem } from "@/lib/content-optimization/harness-heading-titles";
import { buildPredeterminedBlogBodyHarnessTitlesFromOutline } from "@/lib/overview/overview-content-optimize-pipeline";
import { parseBlogTemplateChecklist } from "./blog-template-checklist-prompts";
import { getResearchModel } from "./optimization-settings-storage";
import type { ChecklistFromSelectionsResult } from "./blog-template-builder-types";
import { resolveBlogTemplateChecklistPaaQuestions } from "./blog-template-checklist-paa-selector";
import { buildBlogTemplateChecklistContextSections } from "./blog-template-checklist-context-sections";
import { buildBlogTemplateChecklistPromptAssembly } from "./blog-template-checklist-prompt-assembly";
export { selectBestPAAQuestionsWithAI, resolveBlogTemplateChecklistPaaQuestions } from "./blog-template-checklist-paa-selector";
export { buildBlogTemplateChecklistContextSections, type BlogTemplateChecklistGenerateOptions } from "./blog-template-checklist-context-sections";
export { buildBlogTemplateChecklistPromptAssembly } from "./blog-template-checklist-prompt-assembly";

export async function generateChecklistFromSelections(
  selectedKeywords: string[],
  selectedH2Sections: string[],
  title: string,
  keywordData: KeywordData,
  options: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    userPrompt?: string;
    entity?: string; // Optional entity for content optimization
    entityAnalysis?: string; // AI analysis of the entity for context
    serpData?: unknown; // Full SERP JSON response for context
    selectedPeopleAlsoAsk?: string[]; // Selected People Also Ask questions
    peopleAlsoAskItems?: PeopleAlsoAsk[]; // Full PAA items (question + url/answer) for linking
    selectedResearchLinks?: string[]; // Selected research links for external linking
    checkedExternalLinks?: CheckedExternalLink[]; // Pre-validated external links from Google AI Mode (3-5 per blog)
    runExternalResearch?: boolean; // When true, run Google AI Mode research and inject 3-5 checked external links (uses locationName/languageCode)
    locationName?: string; // For external research (default United States)
    languageCode?: string; // For external research (default en)
    connectedSite?: { name: string; siteUrl: string }; // Connected WordPress site (target topic)
    wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>; // WordPress posts for context
    wordPressPagesForOfferTable?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
    setProgress?: (progress: { step: string; progress: number; message?: string }) => void; // For AI Mode research micro-step
    currentPageUrl?: string; // URL of the page currently being optimized
    /** Semrush url_organic + phrase_related keywords JSON (RAG); optional */
    semrushKeywordsContext?: string;
    /** Semrush cluster/scatter JSON for phrasing spread; optional */
    semrushScatterContext?: string;
    /** Server-filtered Semrush external URLs - third-party hrefs must match exactly when provided */
    semrushApprovedExternalUrls?: string[];
    /** Semrush keyword phrases - external anchor text must match exactly when provided */
    semrushAnchorPhrases?: string[];
    /** Blog import: exact hyperlinks from source draft — mandatory in checklist. */
    importedDraftLinks?: ImportedDraftLink[];
    /** Per-row Modifications field URLs — mandatory external links from DataForSEO research. */
    modifierExternalLinks?: ModifierExternalLink[];
    /** LLM audit liveLinks classified as authority (gov, municipal, news, weather, BBB). */
    llmAuditAuthorityLinks?: LlmAuditAuthorityLinkLike[];
    /** Entity SAP row: verified English Wikipedia URL (mandatory for entity bulk). */
    wikipediaUrl?: string;
    /** Entity SAP row: verified Wikipedia article title. */
    wikipediaTitle?: string;
    /** Prefixed CSV field contract — use title/meta/wiki/slug verbatim. */
    prefilledRowContract?: string;
    /** Row-only external links (modifier_links_json + imported_links_json). */
    userExternalLinks?: ExternalLinkPair[];
    /** Summarized LLM audit facts and mandatory content angles (runs before checklist). */
    llmAuditSummary?: string;
    dfsArticleAuditBlock?: string;
    /** First-party claims + ChatGPT business facts. */
    firstPartyAuthorityBlock?: string;
    siteId?: string;
    primaryKeyword?: string;
    /** Stored SERP brief JSON for dynamic H2 outline (blog paths). */
    serpResearchBriefJson?: string;
    /** Precomputed SERP H2 outline (5-6 titles). */
    serpH2Outline?: string[];
    /** Blog import body H2s. When set, these titles are the outline (no SERP rewrite, no 5-6 cap). */
    importedH2Outline?: string[];
    /** Live post H2s forbidden on optimize. */
    forbiddenLiveH2s?: string[];
    /** Fires when SERP H2 outline is resolved, before checklist LLM. */
    onSerpH2OutlineReady?: (bodyHarnessTitles: string[]) => void;
  }
): Promise<ChecklistFromSelectionsResult> {
  const {
    apiKey,
    model = getResearchModel(),
    temperature = 1.0,
    maxTokens = 16000,
    topP = 0.9,
  } = options;

  const hasSapEntity = Boolean(options.entity?.trim());
  const routeKeyword = keywordData.keyword?.trim() ?? "";
  const competitorComparisonRow = isCompetitorCsvKeyword(routeKeyword);
  const isCompetitorComparison = competitorComparisonRow && hasSapEntity;
  const isServiceArea = hasSapEntity && !competitorComparisonRow;
  const checklistKeywordData: KeywordData =
    competitorComparisonRow && options.primaryKeyword?.trim()
      ? { ...keywordData, keyword: options.primaryKeyword.trim() }
      : keywordData;
  const importedH2Outline = (options.importedH2Outline ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  const useImportedH2Outline = !isServiceArea && importedH2Outline.length > 0;

  let resolvedH2Sections = [...selectedH2Sections];
  if (useImportedH2Outline) {
    resolvedH2Sections = importedH2Outline;
  } else if (!isServiceArea) {
    if (options.serpH2Outline?.length) {
      resolvedH2Sections = validateSerpH2OutlineTitles(
        options.serpH2Outline,
        options.forbiddenLiveH2s,
      );
    } else {
      resolvedH2Sections = await deriveSerpH2Outline({
        apiKey,
        primaryKeyword:
          checklistKeywordData.keyword?.trim() || options.primaryKeyword?.trim() || title,
        title,
        siteName: options.connectedSite?.name?.trim() || "",
        siteUrl: options.connectedSite?.siteUrl,
        serpBriefJson: options.serpResearchBriefJson,
        forbiddenLiveH2s: options.forbiddenLiveH2s,
        model,
        siteId: options.siteId,
      });
    }
  }

  if (!isServiceArea && resolvedH2Sections.length) {
    options.onSerpH2OutlineReady?.(
      buildPredeterminedBlogBodyHarnessTitlesFromOutline(title, resolvedH2Sections),
    );
  }

  const resolvedCheckedLinks = options.checkedExternalLinks;
  const optionsWithCheckedLinks = resolvedCheckedLinks?.length
    ? { ...options, checkedExternalLinks: resolvedCheckedLinks }
    : options;
  const paaQuestions = await resolveBlogTemplateChecklistPaaQuestions({
    options,
    checklistKeyword: checklistKeywordData.keyword,
    title,
  });

  const contextSections = buildBlogTemplateChecklistContextSections({
    selectedKeywords,
    checklistKeywordData,
    resolvedH2Sections,
    paaQuestions,
    competitorComparisonRow,
    options,
    optionsWithCheckedLinks,
  });

  const { systemPrompt, userPrompt } = buildBlogTemplateChecklistPromptAssembly({
    title,
    selectedKeywords,
    resolvedH2Sections,
    isServiceArea,
    isCompetitorComparison,
    competitorComparisonRow,
    useImportedH2Outline,
    importedH2Outline,
    context: contextSections,
    options,
  });

  const allKeywords = [checklistKeywordData.keyword, ...selectedKeywords].filter(Boolean);
  const MIN_CHECKLIST_ITEMS = useImportedH2Outline
    ? importedH2Outline.length
    : isCompetitorComparison
      ? 9
      : isServiceArea
        ? 6
        : 5;

  let fullResponse = "";
  let checklistFinishReason: string | undefined;

  const streamResult = await streamChatCompletion({
    apiKey,
    model,
    messages: [
      { role: "system", content: appendUniversalContentRulesToSystemPrompt(systemPrompt) },
      { role: "user", content: userPrompt },
    ],
    contentHarness: true,
    temperature,
    maxTokens,
    topP,
    onContentChunk: (chunk) => {
      fullResponse += chunk;
    },
    onFinishReason: (reason) => {
      checklistFinishReason = reason;
    },
  });

  const parsed = parseBlogTemplateChecklist(fullResponse, allKeywords).filter(
    (item) => !isLlmAuditAuthorityDumpChecklistItem(item),
  );

  const effectiveFinish = checklistFinishReason || streamResult.finishReason;
  if (parsed.length >= MIN_CHECKLIST_ITEMS) {
    return {
      items: parsed,
      h2Outline: isServiceArea || isCompetitorComparison ? undefined : resolvedH2Sections,
    };
  }

  throw new Error(
    `Checklist generated ${parsed.length} items; need at least ${MIN_CHECKLIST_ITEMS} (finishReason=${effectiveFinish}, len=${fullResponse.length}).`,
  );
}
