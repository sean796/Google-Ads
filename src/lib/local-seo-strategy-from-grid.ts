import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { TITLE_WELL_KNOWN_ACRONYMS_RULE } from "@/lib/prompt-builders/title-rules";
import { formatStrategyMarkdownAsBullets } from "@/lib/strategy-markdown-bullets";
import { extractJsonObjectFromModelText } from "@/lib/gsc-manual-ai-aggregate";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import {
  normalizeSapKeywordFromModelOutput,
  sanitizeSapEntityForExport,
  sapKeywordFromModelPhrase,
} from "@/lib/local-seo-strategy-sap-sanitizers";
import {
  attachKeywordQuestionsToRows,
  normalizeQuestionsByKeyword,
  normalizeRow,
  resolveSourcePhraseForSapKeywordColumn,
  type LocalSeoStrategyFromGridParams,
} from "@/lib/local-seo-strategy-deterministic-and-parsers";
import { buildLocalSeoStrategyGridPrompts } from "@/lib/local-seo-strategy-grid-prompts";

export type { EntityGeographicLevel } from "@/lib/entity-geographic-level";
export {
  assertDistinctSapKeywordEntityPairs,
  normalizeSapKeywordFromModelOutput,
  sanitizeSapEntityForExport,
  sapJsonRowTokenFloor,
  sapKeywordFromModelPhrase,
  stripGeographyTokensFromSapKeyword,
} from "@/lib/local-seo-strategy-sap-sanitizers";
export { buildDeterministicSapRowsFromKeywordTargets } from "@/lib/local-seo-strategy-deterministic-and-parsers";
export type {
  LocalKeywordTarget,
  LocalSeoStrategyFromGridParams,
} from "@/lib/local-seo-strategy-deterministic-and-parsers";

function emptyLocalSeoStrategyResult(): {
  strategyMarkdown: string;
  keywordStrategyMarkdown: string;
  questionsByKeyword: Record<string, string[]>;
  sapRows: CSVRow[];
} {
  return {
    strategyMarkdown: "-",
    keywordStrategyMarkdown: "",
    questionsByKeyword: {},
    sapRows: [],
  };
}

/**
 * Calls the research model with Local Dominator grid summary; returns strategy + filled bulk rows.
 * The model must not output a page-count field - strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows.
 */
export async function fetchLocalSeoStrategyFromGrid(
  params: LocalSeoStrategyFromGridParams
): Promise<{
  strategyMarkdown: string;
  keywordStrategyMarkdown: string;
  questionsByKeyword: Record<string, string[]>;
  sapRows: CSVRow[];
}> {
  const {
    apiKey,
    temperature,
    topP,
    signal,
    targetSapCount,
    keywordTargets,
    entityLocation,
    siteId,
    proposalKeywordMode = false,
    refineSapRowKeywordsWithRag = false,
    localAnalysisSingleSeed: localAnalysisSingleSeedParam = false,
    onSapGenerateStart,
  } = params;
  const localAnalysisSingleSeed = localAnalysisSingleSeedParam === true;

  const prompts = await buildLocalSeoStrategyGridPrompts(params);
  if (!prompts) {
    return emptyLocalSeoStrategyResult();
  }
  const { systemPrompt, userPrompt, rowSeeds, laSingleSeedSap, hasWpInventoryForPrompt } = prompts;

  type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
  const baseMessages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const runOpenRouterJsonCompletion = async (
    messages: ChatMsg[],
    opts?: { temperature?: number },
  ): Promise<string> => {
    const t = opts?.temperature ?? temperature;
    const response = await postOpenRouterAppChatFetch({
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: resolveModelForAgentCategory("research", siteId),
        messages,
        temperature: t,
        top_p: topP,
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return content;
  };

  const runRefineSapRowKeywordsPass = async (draft: CSVRow[]): Promise<CSVRow[]> => {
    if (draft.length === 0) return draft;
    const refineInventoryClause = hasWpInventoryForPrompt
      ? `When **postInventoryRows** appears in the first user message, each **keyword** must reuse **only** vocabulary from that JSON (2–4 words) — **no** invented "buy … online", "… near me", cost, installation, packages, or financing strings unless those exact substrings exist in inventory. `
      : "";
    const refineSystem = `You are a local SEO editor. Output ONLY one JSON object with key "sapRows" (array). Length and order MUST match the draft exactly. Each element: "keyword" (string, required). Rules: (1) ${refineInventoryClause}Each "keyword" is **2–4 words**, **service/commercial intent** — **no** city, neighbourhood, province, region, or words copied from that row's "entity" in the draft (including hyperlocal first-segment tokens); do not append geography to differentiate rows. **No** transactional filler (buy, online, cost, installation, packages, financing, generic near me) unless it appears in post inventory. (2) Do not output "entity" or "title" in JSON - the server keeps draft entities unchanged and titles are filled by a separate Gemini title agent. The server stores your "keyword" after **trim and internal whitespace collapse only** — **no** automatic geography stripping, token removal, or rewrites. Rejects duplicate keyword+entity pairs. ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;
    const draftJson = JSON.stringify(
      draft.map((r) => ({ keyword: r.keyword, entity: r.entity })),
      null,
      0
    );
    const refineUser = `${userPrompt}

--- SAP draft rows (rewrite keyword only; entities are fixed server-side; same row count and order) ---
${draftJson}`;
    const refineMessages: ChatMsg[] = [
      { role: "system", content: refineSystem },
      { role: "user", content: refineUser },
    ];
    try {
      const out = await runOpenRouterJsonCompletion(refineMessages, {
        temperature: Math.min(temperature, 0.25),
      });
      if (!out.trim()) return draft;
      const p = JSON.parse(out) as Record<string, unknown>;
      const arr = p.sapRows ?? p.sap_rows;
      if (!Array.isArray(arr) || arr.length !== draft.length) return draft;
      const refined: CSVRow[] = [];
      for (let i = 0; i < draft.length; i++) {
        const row = draft[i]!;
        const item = arr[i] as Record<string, unknown>;
        const kwModel = String(item?.keyword ?? "");
        const entityBefore = row.entity;
        const entityAfter = sanitizeSapEntityForExport(entityBefore, entityLocation);
        const sourcePhrase = resolveSourcePhraseForSapKeywordColumn({
          rowIndex: i,
          modelKeyword: kwModel || row.keyword,
          laSingleSeedSap,
          proposalKeywordMode,
          keywordTargets,
          rowSeeds,
        });
        const kw = sapKeywordFromModelPhrase(sourcePhrase, entityAfter, entityLocation);
        if (!kw.trim()) {
          refined.push(row);
          continue;
        }
        refined.push({ ...row, keyword: kw, entity: entityAfter, title: "" });
      }
      return refined;
    } catch {
      return draft;
    }
  };

  const parseModelObjectFromContent = (rawContent: string): Record<string, unknown> => {
    const parsed = JSON.parse(extractJsonObjectFromModelText(rawContent)) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Research model returned invalid JSON.");
    }
    return parsed as Record<string, unknown>;
  };

  const buildFromModelObject = (obj: Record<string, unknown>) => {
    const strategyMarkdown =
      formatStrategyMarkdownAsBullets(String(obj.strategyMarkdown ?? obj.strategy_markdown ?? "").trim()) || "-";
    const keywordStrategyMarkdown = String(
      obj.keywordStrategyMarkdown ?? obj.keyword_strategy_markdown ?? "",
    ).trim();
    const questionsByKeyword = normalizeQuestionsByKeyword(
      obj.questionsByKeyword ?? obj.questions_by_keyword,
      keywordTargets,
    );
    const rawRows = obj.sapRows ?? obj.sap_rows;
    if (!Array.isArray(rawRows)) {
      return {
        strategyMarkdown,
        keywordStrategyMarkdown,
        questionsByKeyword,
        sapRowsRaw: [] as CSVRow[],
      };
    }
    const sapRowsRaw: CSVRow[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const item = rawRows[i];
      if (!item || typeof item !== "object") continue;
      const row = normalizeRow(item as Record<string, unknown>, i);
      if (!row) continue;
      const entityBefore = row.entity;
      const entityAfter = sanitizeSapEntityForExport(entityBefore, entityLocation);
      const sourcePhrase = resolveSourcePhraseForSapKeywordColumn({
        rowIndex: i,
        modelKeyword: row.keyword,
        laSingleSeedSap,
        proposalKeywordMode,
        keywordTargets,
        rowSeeds,
      });
      let kwAfter = sapKeywordFromModelPhrase(sourcePhrase, entityAfter, entityLocation);
      if (!/\S/.test(kwAfter)) {
        kwAfter = normalizeSapKeywordFromModelOutput(row.keyword);
      }
      sapRowsRaw.push({ ...row, keyword: kwAfter, entity: entityAfter, title: "" });
    }
    return {
      strategyMarkdown,
      keywordStrategyMarkdown,
      questionsByKeyword,
      sapRowsRaw,
    };
  };

  onSapGenerateStart?.();
  const content = await runOpenRouterJsonCompletion(baseMessages);
  if (!content.trim()) {
    return emptyLocalSeoStrategyResult();
  }

  const parsed = parseModelObjectFromContent(content);
  const built = buildFromModelObject(parsed);
  const { strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRowsRaw } = built;

  let refinedSapRows = sapRowsRaw;
  if (
    refineSapRowKeywordsWithRag === true &&
    proposalKeywordMode !== true &&
    localAnalysisSingleSeed !== true &&
    refinedSapRows.length === targetSapCount
  ) {
    refinedSapRows = await runRefineSapRowKeywordsPass(refinedSapRows);
  }

  const sapRows = attachKeywordQuestionsToRows(
    refinedSapRows.slice(0, targetSapCount),
    questionsByKeyword,
    keywordTargets,
  );
  return { strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows };
}
