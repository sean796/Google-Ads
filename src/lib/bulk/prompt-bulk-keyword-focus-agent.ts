import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK } from "@/lib/content-topic-blocklist";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import {
  isBlocklistedPrimaryKeyword,
  isCompanyNameKeyword,
} from "@/lib/gsc-simple-keyword-recommendation";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";

const FOCUS_FILL_CHUNK = 10;
const FOCUS_REPAIR_MAX_PASSES = 3;
/** Product + brand intent phrases (e.g. Hunter Douglas top down bottom up shades) can need 7–8 words. */
const FOCUS_KEYWORD_MIN_WORDS = 2;
const FOCUS_KEYWORD_MAX_WORDS = 8;

const KEYWORD_FOCUS_AGENT_SYSTEM = `You distill short SEO focus keywords for national blog posts from a general topic, title, and draft keyword.

Output ONLY valid JSON: {"focusKeywords":["..."]} with exactly one focus keyword per input row in rows[], same order.

${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}

PRIMARY KEYWORD BLOCKLIST (mandatory — never appear in focusKeyword, including as a substring):
- guide, listicle, buying guide, complete guide, ultimate guide, how to
- patio, umbrella, outdoor furniture, text field, extra
- Any phrase that is only listicle/guide framing without product or service intent

Rules for each focusKeyword:
- ${FOCUS_KEYWORD_MIN_WORDS} to 6 words when possible; hard max ${FOCUS_KEYWORD_MAX_WORDS}. Intent-only primary SEO / ACF focus phrase.
- Product and brand names that appear in the title (e.g. Hunter Douglas, top down bottom up shades) may appear when they define search intent. Keep the full product name even if that uses 7–8 words.
- Strip ALL guide/listicle framing from titles before distilling. Example: title "Healthy Meal Prep Guide" → focusKeyword "healthy meal prep" (never "healthy meal prep guide").
- Do NOT repeat the full headline. Do NOT include guide, listicle, or how-to wrapper words in the focus keyword.
- Do NOT include the site or business name as the keyword.
- Do NOT include country, state, or city names when origin/geo is handled elsewhere (e.g. drop trailing "in Canada" from the keyword).
- Lowercase is fine. Spaces only between words. No quotes inside the keyword string.
- Vary wording across rows when titles differ.

When repair[] is present in the user payload, each entry matches rows[] in order. The prior focusKeyword was rejected; obey the error and return a new valid focusKeyword for that row only.`;

type FocusAgentResponse = {
  focusKeywords?: unknown;
};

type FocusFillRowPayload = {
  topic: string;
  title: string;
  keyword: string;
  entity: string;
};

type FocusRepairHint = {
  rejected: string;
  error: string;
};

function normalizeFocusPhrase(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 500);
}

function wordCount(phrase: string): number {
  return phrase.split(/\s+/).filter(Boolean).length;
}

export function validateDistilledFocusKeyword(
  focus: string,
  siteName?: string,
): string {
  const kw = normalizeFocusPhrase(focus);
  if (!kw) {
    throw new Error("Keyword focus agent returned an empty focus keyword.");
  }
  const words = wordCount(kw);
  if (words < FOCUS_KEYWORD_MIN_WORDS || words > FOCUS_KEYWORD_MAX_WORDS) {
    throw new Error(
      `Keyword focus must be ${FOCUS_KEYWORD_MIN_WORDS}–${FOCUS_KEYWORD_MAX_WORDS} words (got ${words}): "${kw.slice(0, 80)}"`,
    );
  }
  if (isBlocklistedPrimaryKeyword(kw)) {
    throw new Error(`Keyword focus is blocklisted: "${kw.slice(0, 80)}"`);
  }
  if (isCompanyNameKeyword(kw, siteName)) {
    throw new Error(`Keyword focus must not be the site name: "${kw.slice(0, 80)}"`);
  }
  return kw;
}

function tryValidateDistilledFocusKeyword(
  focus: string,
  siteName: string,
): { ok: true; value: string } | { ok: false; error: string; rejected: string } {
  try {
    return { ok: true, value: validateDistilledFocusKeyword(focus, siteName) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error, rejected: normalizeFocusPhrase(focus) };
  }
}

export function buildFocusKeywordsResponseFormat(count: number): {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
} {
  const n = Math.max(1, Math.min(FOCUS_FILL_CHUNK, Math.floor(count) || 1));
  return {
    type: "json_schema",
    json_schema: {
      name: "prompt_bulk_keyword_focus",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["focusKeywords"],
        properties: {
          focusKeywords: {
            type: "array",
            minItems: n,
            maxItems: n,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
  };
}

function focusKeywordsFromModelContent(raw: string, expectedCount: number): string[] {
  const parsed = parseJsonObjectFromModelText(raw) as FocusAgentResponse;
  if (!Array.isArray(parsed.focusKeywords)) {
    throw new Error("Keyword focus agent JSON missing focusKeywords array.");
  }
  const list = parsed.focusKeywords.map((k) => String(k ?? "").trim());
  if (list.length !== expectedCount) {
    throw new Error(
      `Keyword focus agent returned ${list.length}/${expectedCount} keywords.`,
    );
  }
  return list;
}

function focusKeywordsFromChatResponse(
  response: { content: string; parsed?: unknown },
  expectedCount: number,
): string[] {
  if (response.parsed && typeof response.parsed === "object" && !Array.isArray(response.parsed)) {
    const parsed = response.parsed as FocusAgentResponse;
    if (Array.isArray(parsed.focusKeywords)) {
      const list = parsed.focusKeywords.map((k) => String(k ?? "").trim());
      if (list.length === expectedCount) return list;
    }
  }
  const raw = response.content.trim();
  if (!raw) {
    throw new Error("Keyword focus agent returned empty content.");
  }
  return focusKeywordsFromModelContent(raw, expectedCount);
}

function buildFocusFillPayload(
  rows: CSVRow[],
  topic: string,
): FocusFillRowPayload[] {
  const topicTrim = topic.trim();
  return rows.map((row) => ({
    topic: topicTrim,
    title: (row.title ?? "").trim(),
    keyword: (row.keyword ?? "").trim(),
    entity: (row.entity ?? "").trim(),
  }));
}

async function callFocusKeywordAgent(args: {
  apiKey: string;
  siteId: string | undefined;
  rows: CSVRow[];
  topic: string;
  repair?: FocusRepairHint[];
  modelCategory?: "research" | "meta";
}): Promise<string[]> {
  const count = args.rows.length;
  if (count === 0) return [];

  const model = resolveModelForAgentCategory(args.modelCategory ?? "meta", args.siteId);
  const userPayload: {
    rows: FocusFillRowPayload[];
    repair?: FocusRepairHint[];
  } = {
    rows: buildFocusFillPayload(args.rows, args.topic),
  };
  if (args.repair?.length) {
    userPayload.repair = args.repair;
  }

  const response = await postOpenRouterAppChat({
    apiKey: args.apiKey,
    model,
    system: KEYWORD_FOCUS_AGENT_SYSTEM,
    user: JSON.stringify(userPayload),
    temperature: 0,
    maxTokens: Math.max(512, count * 80),
    responseFormat: buildFocusKeywordsResponseFormat(count),
  });

  return focusKeywordsFromChatResponse(response, count);
}

async function fetchFocusKeywordsBatchSinglePass(
  apiKey: string,
  siteId: string | undefined,
  topic: string,
  rows: CSVRow[],
  siteName: string,
  modelCategory: "research" | "meta",
): Promise<string[]> {
  const rawList = await callFocusKeywordAgent({
    apiKey,
    siteId,
    rows,
    topic,
    modelCategory,
  });
  return rawList.map((raw, i) => {
    try {
      return validateDistilledFocusKeyword(raw, siteName);
    } catch {
      const fromRow = normalizeFocusPhrase(rows[i]?.keyword ?? "");
      if (fromRow) return fromRow;
      return normalizeFocusPhrase(raw) || "blog topic";
    }
  });
}

async function fetchFocusKeywordsBatch(
  apiKey: string,
  siteId: string | undefined,
  topic: string,
  rows: CSVRow[],
  siteName: string,
  options?: { singlePass?: boolean; modelCategory?: "research" | "meta" },
): Promise<string[]> {
  if (rows.length === 0) return [];

  if (options?.singlePass) {
    return fetchFocusKeywordsBatchSinglePass(
      apiKey,
      siteId,
      topic,
      rows,
      siteName,
      options.modelCategory ?? "research",
    );
  }

  const validated: string[] = new Array(rows.length);
  let pendingRowIndices = rows.map((_, index) => index);
  let repairHints: FocusRepairHint[] = [];

  for (let pass = 0; pass < FOCUS_REPAIR_MAX_PASSES && pendingRowIndices.length > 0; pass++) {
    const pendingRows = pendingRowIndices.map((index) => rows[index]!);
    const rawList = await callFocusKeywordAgent({
      apiKey,
      siteId,
      rows: pendingRows,
      topic,
      repair: pass > 0 ? repairHints : undefined,
    });

    const nextPending: number[] = [];
    const nextRepair: FocusRepairHint[] = [];

    pendingRowIndices.forEach((origIndex, j) => {
      const attempt = tryValidateDistilledFocusKeyword(rawList[j] ?? "", siteName);
      if (attempt.ok) {
        validated[origIndex] = attempt.value;
        return;
      }
      nextPending.push(origIndex);
      nextRepair.push({ rejected: attempt.rejected, error: attempt.error });
    });

    pendingRowIndices = nextPending;
    repairHints = nextRepair;
  }

  const firstMissing = validated.findIndex((value) => !value?.trim());
  if (firstMissing >= 0) {
    const hint = repairHints[0];
    throw new Error(
      hint?.error ??
        `Keyword focus agent did not return a valid focus keyword for row ${firstMissing + 1}.`,
    );
  }

  return validated;
}

export type FillBlogRowKeywordFocusOptions = {
  apiKey: string;
  siteId?: string;
  siteName?: string;
  /** General topic / flowPurpose passed into the ideas step. */
  topic?: string;
  /** Parallel to rows: when true, do not overwrite row.keyword (user-locked slot). */
  lockedSlotKeywords?: boolean[];
  strict?: boolean;
  /** Prompt checklist: one research-model call per chunk, no repair loop. */
  singlePass?: boolean;
  modelCategory?: "research" | "meta";
  onProgress?: (done: number, total: number) => void;
};

/** Distill ACF-style focus keywords before meta/slug agents (Prompt Ideas path). */
export async function fillBlogRowKeywordFocusFromOpenRouter(
  rows: CSVRow[],
  options: FillBlogRowKeywordFocusOptions,
): Promise<CSVRow[]> {
  if (rows.length === 0) return rows;
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for keyword focus distillation.");
  }
  const topic = (options.topic ?? "").trim();
  const siteName = (options.siteName ?? "").trim();
  const out = rows.map((r) => ({ ...r }));
  const total = out.length;
  const locked = options.lockedSlotKeywords ?? [];

  const pendingIndices = out.map((_, index) => index);

  const chunkStarts: number[] = [];
  for (let chunkStart = 0; chunkStart < pendingIndices.length; chunkStart += FOCUS_FILL_CHUNK) {
    chunkStarts.push(chunkStart);
  }

  await Promise.all(
    chunkStarts.map(async (chunkStart) => {
      const chunkIndices = pendingIndices.slice(chunkStart, chunkStart + FOCUS_FILL_CHUNK);
      const chunkRows = chunkIndices.map((i) => out[i]!);
      try {
        const focusList = await fetchFocusKeywordsBatch(
          apiKey,
          options.siteId,
          topic,
          chunkRows,
          siteName,
          {
            singlePass: options.singlePass,
            modelCategory: options.modelCategory,
          },
        );
        chunkIndices.forEach((idx, i) => {
          const focus = focusList[i]!;
          const userLocked = locked[idx] === true;
          out[idx] = {
            ...out[idx]!,
            keyword_focus: focus,
            keyword: userLocked ? out[idx]!.keyword : focus,
          };
        });
      } catch (err) {
        if (options.strict !== false) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
      options.onProgress?.(
        out.filter((r) => (r.keyword_focus ?? "").trim().length > 0).length,
        total,
      );
    }),
  );

  const missing = out.find((r) => !(r.keyword_focus ?? "").trim());
  if (missing && options.strict !== false) {
    throw new Error("Keyword focus agent did not return a focus keyword for every idea row.");
  }

  return out;
}
