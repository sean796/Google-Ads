import { useCallback, useMemo, useState } from "react";
import { streamChatCompletion, type Message } from "@/lib/api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
export { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
import { appendUniversalContentRulesToSystemPrompt, assertNoForbiddenWordViolations } from "@/lib/content-word-blocklist";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { runContentKeywordsBatch, runEntityKeywordsBatch, type OverviewKeywordCatalogRow } from "@/lib/overview/overview-keyword-batch-agent";
import { runAiAllMetaBatch } from "@/lib/overview/overview-ai-all-meta-batch-agent";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import type { AiAllMetaRowPatch } from "@/lib/overview/overview-ai-all-meta-batch-parse";
import type { WordPressSite } from "@/components/integrations/types";
import { getMetaModel } from "@/lib/optimization-settings-storage";
import { createOverviewMetaOptimizer, createOverviewTitleOptimizer } from "@/hooks/overview/overview-ai-title-meta-prompts";
import { createOverviewFaqAnswerOptimizer, createOverviewFaqOptimizer, createOverviewFaqQuestionOptimizer } from "@/hooks/overview/overview-ai-faq-prompts";
import { createOverviewEntityKeywordDeriver, createOverviewFocusKeywordDeriver, createOverviewGscFocusKeywordEnhancer, createOverviewShortTailKeywordDeriver } from "@/hooks/overview/overview-ai-keyword-prompts";
export { createOverviewMetaOptimizer, createOverviewTitleOptimizer } from "@/hooks/overview/overview-ai-title-meta-prompts";
export { createOverviewFaqAnswerOptimizer, createOverviewFaqOptimizer, createOverviewFaqQuestionOptimizer } from "@/hooks/overview/overview-ai-faq-prompts";
export { createOverviewEntityKeywordDeriver, createOverviewFocusKeywordDeriver, createOverviewGscFocusKeywordEnhancer, createOverviewShortTailKeywordDeriver } from "@/hooks/overview/overview-ai-keyword-prompts";

interface UseOverviewAiOptions {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  napSummary?: string;
  /** When set, client master instructions for this WordPress site are appended to every system prompt. */
  wordPressSiteId?: string | null;
  /** Full site record for primary city in FAQ/Answer prompts (Edmonton from Integrations profile). */
  wordPressSite?: WordPressSite | null;
}

interface UseOverviewAiResult {
  loading: boolean;
  focusKeywordLoading: boolean;
  error: string | null;
  optimizeTitle: (
    url: string,
    existingTitle: string,
    focusKeyword?: string,
    faq?: string,
    sentimentSource?: string,
    /** Merged JSON brief (tile `seo_research`); primary research signal when set. */
    seoResearchBrief?: string,
    options?: { skipLoadingState?: boolean; titleMode?: "default" | "sap"; signal?: AbortSignal },
  ) => Promise<string | null>;
  optimizeMeta: (
    url: string,
    existingMeta: string,
    focusKeyword?: string,
    faq?: string,
    sentimentSource?: string,
    gscQuickWinsContext?: string,
    /** When set, used as primary research context; raw GSC JSON is omitted from the prompt to save tokens. */
    seoResearchBrief?: string,
    /** Parallel bulk: do not toggle shared `loading` / global error (single-row UI still uses loading). */
    options?: { skipLoadingState?: boolean; signal?: AbortSignal },
  ) => Promise<string | null>;
  optimizeFaq: (
    url: string,
    focusKeyword?: string,
    existingFaq?: string,
    dfsSerpContext?: string,
    pageTitle?: string,
    pageMeta?: string,
    /** When set, used instead of slim DFS context in the prompt. */
    seoResearchBrief?: string,
    options?: { exactQuestionCount?: number; skipLoadingState?: boolean; includeAnswers?: boolean },
  ) => Promise<string | null>;
  optimizeFaqQuestion: (
    url: string,
    focusKeyword: string | undefined,
    currentQuestion: string,
    faqContext?: string,
    dfsSerpContext?: string,
    pageTitle?: string,
    pageMeta?: string,
    seoResearchBrief?: string,
  ) => Promise<string | null>;
  optimizeFaqAnswer: (
    url: string,
    focusKeyword: string | undefined,
    question: string,
    currentAnswer: string,
    faqContext?: string,
    dfsSerpContext?: string,
    pageTitle?: string,
    pageMeta?: string,
    seoResearchBrief?: string,
  ) => Promise<string | null>;
  enhanceFocusKeywordFromGsc: (
    url: string,
    gscKeywordBasis: string,
    pageTitle?: string,
    pageMeta?: string,
  ) => Promise<string | null>;
  deriveFocusKeywordFromPageContext: (
    url: string,
    pageTitle?: string,
    pageMeta?: string,
    faq?: string,
    pageContentPlainText?: string,
    options?: { skipLoadingState?: boolean; seoResearchBrief?: string },
  ) => Promise<string | null>;
  deriveEntityKeyword: (
    url: string,
    pageTitle?: string,
    pageMeta?: string,
    options?: { skipLoadingState?: boolean },
  ) => Promise<string | null>;
  deriveFocusKeywordsFromPageContextBatch: (
    catalog: OverviewKeywordCatalogRow[],
  ) => Promise<Map<string, string>>;
  deriveEntityKeywordsBatch: (
    catalog: OverviewKeywordCatalogRow[],
  ) => Promise<Map<string, string>>;
  runAiAllMetaBatchForCatalog: (
    catalog: AiAllMetaCatalogRow[],
  ) => Promise<Map<string, AiAllMetaRowPatch>>;
  /** Short-tail keyword from SEO brief (primary), then title, then URL; 2–5 words, comparisons allowed. */
  deriveShortTailFocusKeywordFromResearch: (
    brief: string,
    pageTitle: string,
    url: string,
  ) => Promise<string | null>;
  /** True while Semrush audit fix checklist AI is running (separate from title/meta/FAQ loading). */
  auditChecklistLoading: boolean;
  buildSemrushAuditFixChecklist: (pageUrl: string, auditContext: string) => Promise<string | null>;
}

/**
 * Hook that uses OpenRouter (Gemini) via streamChatCompletion to optimize
 * titles and meta descriptions for URLs in the Overview grid.
 */
export function useOverviewAiOptimize(options: UseOverviewAiOptions): UseOverviewAiResult {
  const { apiKey, model, temperature, maxTokens, topP, napSummary, wordPressSiteId, wordPressSite } = options;
  const resolveMetaModel = useCallback(
    () => getMetaModel(wordPressSiteId) || model,
    [wordPressSiteId, model],
  );
  const [loading, setLoading] = useState(false);
  const [focusKeywordLoading, setFocusKeywordLoading] = useState(false);
  const [auditChecklistLoading, setAuditChecklistLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCompletion = useCallback(
    async (
      systemPrompt: string,
      userPrompt: string,
      signal?: AbortSignal,
      maxTokensOverride?: number,
    ): Promise<string> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      if (!resolvedKey) {
        throw new Error("OpenRouter API key is missing. Set it in Settings first.");
      }

      await ensureMasterInstructionsInMemory(wordPressSiteId);

      const messages: Message[] = [
        {
          role: "system",
          content: appendUniversalContentRulesToSystemPrompt(
            appendMasterInstructionsToSystemPrompt(systemPrompt, wordPressSiteId ?? null),
          ),
        },
        { role: "user", content: userPrompt },
      ];

      const startedAt = Date.now();
      const activeModel = resolveMetaModel();
      console.log("[Auto SEO][OpenRouter Start]", {
        model: activeModel,
        maxTokens: maxTokensOverride ?? Math.min(maxTokens || 1024, 1500),
      });

      let result = "";
      const completion = await streamChatCompletion({
        apiKey: resolvedKey,
        model: activeModel,
        messages,
        temperature,
        maxTokens: maxTokensOverride ?? Math.min(maxTokens || 1024, 1500),
        topP,
        signal,
        contentHarness: true,
        onContentChunk: (chunk) => {
          result += chunk;
        },
      });

      const finalRaw = (result.trim() || completion?.content?.trim() || "").trim();
      assertNoForbiddenWordViolations(finalRaw, "Overview optimize output");
      const cleaned = finalRaw;
      console.log("[Auto SEO][OpenRouter Done]", {
        model: activeModel,
        ms: Date.now() - startedAt,
        chars: cleaned.length,
        preview: cleaned.slice(0, 140),
      });
      return cleaned;
    },
    [apiKey, resolveMetaModel, temperature, maxTokens, topP, wordPressSiteId],
  );

  const optimizeTitle = useMemo(() => createOverviewTitleOptimizer({ runCompletion, setLoading, setError }), [runCompletion]);
  const optimizeMeta = useMemo(() => createOverviewMetaOptimizer({ runCompletion, setLoading, setError }), [runCompletion]);
  const optimizeFaq = useMemo(() => createOverviewFaqOptimizer({ runCompletion, setLoading, setError, napSummary, wordPressSite }), [runCompletion, napSummary, wordPressSite]);
  const optimizeFaqQuestion = useMemo(() => createOverviewFaqQuestionOptimizer({ runCompletion, setLoading, setError, napSummary, wordPressSite }), [runCompletion, napSummary, wordPressSite]);
  const optimizeFaqAnswer = useMemo(() => createOverviewFaqAnswerOptimizer({ runCompletion, setLoading, setError, napSummary, wordPressSite }), [runCompletion, napSummary, wordPressSite]);
  const enhanceFocusKeywordFromGsc = useMemo(() => createOverviewGscFocusKeywordEnhancer({ runCompletion, setFocusKeywordLoading, setError }), [runCompletion]);
  const deriveFocusKeywordFromPageContext = useMemo(() => createOverviewFocusKeywordDeriver({ runCompletion, setFocusKeywordLoading, setError }), [runCompletion]);
  const deriveEntityKeyword = useMemo(() => createOverviewEntityKeywordDeriver({ runCompletion, setFocusKeywordLoading, setError, napSummary }), [runCompletion, napSummary]);
  const deriveShortTailFocusKeywordFromResearch = useMemo(() => createOverviewShortTailKeywordDeriver({ runCompletion, setFocusKeywordLoading, setError }), [runCompletion]);

  const buildSemrushAuditFixChecklist = useCallback(
    async (pageUrl: string, auditContext: string): Promise<string | null> => {
      setAuditChecklistLoading(true);
      setError(null);
      try {
        const safeUrl = (pageUrl || "").trim() || "(unknown)";
        const ctx = (auditContext || "").trim();
        if (!ctx) {
          throw new Error("No audit data to analyze.");
        }

        const userPrompt = `You are given Semrush Site Audit JSON for a single page (compact extract). The data may be truncated at the end with the marker [TRUNCATED].

Page URL (context only)
${safeUrl}

Audit JSON (only source of truth - do not invent problems)
${ctx}

TASK
Produce a markdown checklist ONLY for on-page **content and copy** issues that a content editor could fix (title, meta, body text, headings, readability, keyword use in copy). Examples of IN-SCOPE issues when they appear in the JSON: thin or low word count, title tag too long or too short, meta description too long or too short or missing, H1 missing/wrong/multiple, heading structure problems, duplicate or weak title/description, readability, keyword stuffing or cannibalization called out in copy checks, thin main content, missing or poor alt text on content images (copy/UX), low text-to-HTML ratio when framed as content bloat.

STRICTLY OMIT (do not list, do not mention) issues that are primarily technical, server, crawl, or infrastructure, for example: SSL/certificate, DNS, redirects/redirect chains as infra, broken links to other sites, 4xx/5xx unless the fix is purely "add content on this URL", robots.txt, sitemap, canonical configuration, page speed/Core Web Vitals, structured data markup errors, hreflang, AMP, mixed content, security headers, crawl budget, orphan pages unless the fix is "add internal links in body copy" (only then you may mention adding contextual links in content).

Rules:
- Use ONLY checks present in the JSON. If nothing in-scope appears, reply in one short paragraph that no content-fixable audit items were found (or only out-of-scope items were present).
- One checklist item per distinct in-scope issue (merge duplicates).
- Each item: what is wrong + concrete content/editor steps. When the JSON includes an issue id, code, check name, or title, mention it briefly.
- Do NOT use SERP, GSC, focus keywords, or FAQ - audit JSON and page URL only.
- Output valid markdown (numbered list or ### + bullets). No preamble like "Here is the checklist".`;

        const systemPrompt =
          "You are an SEO content editor. You output markdown checklists grounded strictly in the Semrush Site Audit JSON, limited to on-page content and copy fixes only. You never invent findings and you skip technical or infrastructure issues.";
        const text = await runCompletion(systemPrompt, userPrompt);
        return text?.trim() || null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Audit checklist generation failed.");
        return null;
      } finally {
        setAuditChecklistLoading(false);
      }
    },
    [runCompletion],
  );

  const deriveFocusKeywordsFromPageContextBatch = useCallback(
    async (catalog: OverviewKeywordCatalogRow[]): Promise<Map<string, string>> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      return runContentKeywordsBatch(catalog, {
        apiKey: resolvedKey,
        model: resolveMetaModel(),
        siteId: wordPressSiteId,
        napSummary,
      });
    },
    [apiKey, resolveMetaModel, wordPressSiteId, napSummary],
  );

  const deriveEntityKeywordsBatch = useCallback(
    async (catalog: OverviewKeywordCatalogRow[]): Promise<Map<string, string>> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      return runEntityKeywordsBatch(catalog, {
        apiKey: resolvedKey,
        model: resolveMetaModel(),
        siteId: wordPressSiteId,
        napSummary,
      });
    },
    [apiKey, resolveMetaModel, wordPressSiteId, napSummary],
  );

  const runAiAllMetaBatchForCatalog = useCallback(
    async (catalog: AiAllMetaCatalogRow[]): Promise<Map<string, AiAllMetaRowPatch>> => {
      const resolvedKey = apiKey?.trim() || (await resolveOpenRouterApiKeyForHarness());
      return runAiAllMetaBatch(catalog, {
        apiKey: resolvedKey,
        model: resolveMetaModel(),
        siteId: wordPressSiteId,
        napSummary,
      });
    },
    [apiKey, resolveMetaModel, wordPressSiteId, napSummary],
  );

  return {
    loading,
    focusKeywordLoading,
    auditChecklistLoading,
    error,
    optimizeTitle,
    optimizeMeta,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    enhanceFocusKeywordFromGsc,
    deriveFocusKeywordFromPageContext,
    deriveEntityKeyword,
    deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch,
    runAiAllMetaBatchForCatalog,
    deriveShortTailFocusKeywordFromResearch,
    buildSemrushAuditFixChecklist,
  };
}
