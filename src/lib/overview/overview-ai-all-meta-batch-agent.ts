import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  appendMasterInstructionsToSystemPrompt,
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";
import { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
import {
  META_DESCRIPTION_ANTI_CLICKBAIT_RULE,
  TITLE_ANTI_CLICKBAIT_RULE,
  TITLE_CASE_RULE,
  TITLE_KEYWORD_WEAVING_RULE,
  TITLE_WELL_KNOWN_ACRONYMS_RULE,
  UNIFIED_COPY_FORMATTING_RULE,
} from "@/lib/prompt-builders/title-rules";
import { normalizeOverviewKeywordUrlKey } from "@/lib/overview/overview-keyword-batch-parse";
import {
  OVERVIEW_AI_ALL_META_BATCH_MAX_TOKENS,
} from "@/lib/overview/overview-ai-all-meta-batch-constants";
import {
  catalogRowToPayload,
  type AiAllMetaCatalogRow,
} from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import {
  aiAllMetaBatchResultsToMap,
  parseAiAllMetaBatchJson,
  type AiAllMetaRowPatch,
} from "@/lib/overview/overview-ai-all-meta-batch-parse";

export type AiAllMetaBatchAgentOptions = {
  apiKey: string;
  model: string;
  siteId?: string | null;
  napSummary?: string;
  signal?: AbortSignal;
};

const SYSTEM = `You are an expert SEO copywriter optimizing Overview grid rows in bulk.

For EVERY url in allowedUrls return exactly one result object with that exact url.

Meta rules (always):
- metaDescription: 130-155 characters, natural language, specific value for the searcher, neutral tone, standard sentence case (capitalize the first word of the sentence and proper nouns/trademarks only).
- ${META_DESCRIPTION_ANTI_CLICKBAIT_RULE}
- **Grammar and natural flow come first**: Never dump the focusKeyword at the start with a colon, dash, or comma (e.g. FORBIDDEN: "energy efficient windows science: How Low-E..."). Weave the topic words from focusKeyword naturally into a complete, grammatically sound sentence using prepositions, articles, and natural word order. Do not add brand or site names. Do not paste JSON briefs into output.
- Use seoResearchBrief as primary intent signal per row.

Title rules (only when includeTitle is true for that row):
- title: 50-60 characters, specific, informative, and neutral.
- ${TITLE_CASE_RULE}
- Include focus keyword once with same words and spacing as catalog. Title Case every word in the title. Never copy lowercase keyword casing from catalog (e.g. never "Best hunter douglas blinds Near …").
- No leading business or site name. No "Brand | Topic" pattern.
- NO COLONS in titles. Never topic-then-subtitle. One flowing headline joined with natural connecting words ("and", "for", "vs", "how", "what", "why", "when"), or ending with "?". This overrides any colon allowance below.
- ${TITLE_KEYWORD_WEAVING_RULE}
- ${TITLE_ANTI_CLICKBAIT_RULE}
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}
- Omit title field when includeTitle is false.

Return ONLY valid JSON matching outputSchema (no markdown fences).`;

function postProcessPatch(
  patch: AiAllMetaRowPatch,
  catalog: AiAllMetaCatalogRow,
): AiAllMetaRowPatch {
  const kw = catalog.focusKeyword;
  const metaDescription = enforceExactFocusKeyword(patch.metaDescription, kw);
  const next: AiAllMetaRowPatch = {
    metaDescription,
    aiMeta: metaDescription,
  };
  if (catalog.includeTitle && patch.title?.trim()) {
    const title = patch.title.trim();
    next.title = title;
    next.aiTitle = title;
  }
  return next;
}

export async function runAiAllMetaBatch(
  catalog: AiAllMetaCatalogRow[],
  options: AiAllMetaBatchAgentOptions,
): Promise<Map<string, AiAllMetaRowPatch>> {
  if (!catalog.length) return new Map();
  if (!options.apiKey?.trim()) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }

  await ensureMasterInstructionsInMemory(options.siteId ?? null);

  const catalogPayload = catalog.map(catalogRowToPayload);
  const allowedUrls = catalogPayload.map((c) => String(c.url));
  const catalogByUrl = new Map<string, AiAllMetaCatalogRow>();
  for (const row of catalog) {
    catalogByUrl.set(normalizeOverviewKeywordUrlKey(row.url), row);
  }

  const user = JSON.stringify({
    task: "overview_ai_all_meta_batch",
    requiredCount: catalog.length,
    allowedUrls,
    napSummary: options.napSummary?.trim() || undefined,
    catalog: catalogPayload,
    outputSchema: {
      results: [
        {
          url: "string (exact from catalog)",
          metaDescription: "string 130-150 chars",
          title: "string optional when includeTitle false omit",
        },
      ],
    },
  });

  const systemWithMaster = appendMasterInstructionsToSystemPrompt(SYSTEM, options.siteId ?? null);

  const { content } = await callOpenRouterChatCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system: systemWithMaster,
    user,
    maxTokens: OVERVIEW_AI_ALL_META_BATCH_MAX_TOKENS,
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal: options.signal,
  });

  const parsed = parseAiAllMetaBatchJson(content);
  const allowed = new Set(allowedUrls.map(normalizeOverviewKeywordUrlKey));
  const filtered = parsed.filter((r) => allowed.has(normalizeOverviewKeywordUrlKey(r.url)));
  const rawMap = aiAllMetaBatchResultsToMap(filtered, catalogByUrl);

  const out = new Map<string, AiAllMetaRowPatch>();
  for (const [key, patch] of rawMap) {
    const catalogRow = catalogByUrl.get(key);
    if (!catalogRow) continue;
    out.set(key, postProcessPatch(patch, catalogRow));
  }
  return out;
}
