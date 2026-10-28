import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { getBlogModel } from "@/lib/optimization-settings-storage";
import { BULK_WORDPRESS_POST_TITLE_RULE } from "@/lib/prompt-builders/title-rules";
import { buildKeywordPunctuationPromptBlock } from "@/lib/prompt-builders/keyword-canonical-punctuation";

export type BulkPostTitleCandidates = {
  researchSeoTitle?: string;
  csvTitle?: string;
  blueprintTitle?: string;
};

export const BULK_WORDPRESS_TITLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["wordpress_title"],
  properties: {
    wordpress_title: { type: "string", minLength: 1 },
  },
} as const;

export const BULK_WORDPRESS_TITLE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "bulk_wordpress_post_title",
    strict: true,
    schema: BULK_WORDPRESS_TITLE_SCHEMA,
  },
};

const SYSTEM = `You are a WordPress post title editor.

${BULK_WORDPRESS_POST_TITLE_RULE}

The writing keyword and place/entity in the user message are topic facts. They are not the title. Candidate titles are intent signals only. Write one fresh headline. Never concatenate, prefix-merge, or paste the keyword as a block.

The keyword appears once. The place appears once. Never restate the same service and place after a colon.

Forbidden (do not produce this shape):
"Blackout Blinds Mediterra Naples Florida: Blackout Blinds For Homes In Mediterra Naples Florida"
"Window Blinds Coquina Sands Naples Florida: Window Blinds For Coquina Sands Naples Florida Homes"

If any candidate contains ":", rewrite that candidate into natural joins ("and", "for", "how to", "what", "why", "near"). Never keep the colon in wordpress_title.

Return the complete wordpress_title string. Never shorten, truncate, or cut off mid-word.

JSON contract (mandatory, last): output one object only. Double-quoted keys and string values. No JavaScript object notation. No markdown fences. No extra keys. Exact shape:
{"wordpress_title":"<complete Title Case headline>"}`;

function titleCandidateLine(label: string, value: string | undefined): string | null {
  const t = value?.trim();
  if (!t) return null;
  return `${label}: ${t}`;
}

function parseTitleAgentJson(content: string): string {
  let parsed: { wordpress_title?: unknown };
  try {
    parsed = JSON.parse(content.trim()) as { wordpress_title?: unknown };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Title agent returned invalid JSON (expected {"wordpress_title":"..."}): ${msg}. Got: ${content.slice(0, 240)}`,
    );
  }
  const title = typeof parsed.wordpress_title === "string" ? parsed.wordpress_title.trim() : "";
  if (!title) {
    throw new Error(
      `Title agent JSON missing wordpress_title. Got: ${content.slice(0, 240)}`,
    );
  }
  return title;
}

/** OpenRouter writes the WordPress post title. No CSV, blueprint, or keyword substitute. */
export async function resolveBulkWordPressPostTitle(args: {
  apiKey: string;
  focusKeyword: string;
  entity?: string;
  candidates: BulkPostTitleCandidates;
  siteId?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const kw = args.focusKeyword.trim();
  const place = args.entity?.trim() ?? "";
  const model = args.model?.trim() || getBlogModel(args.siteId);
  const apiKey = args.apiKey.trim();
  if (!apiKey) {
    throw new Error("Title agent requires an OpenRouter API key");
  }

  const candidateLines = [
    titleCandidateLine("research_seo_title", args.candidates.researchSeoTitle),
    titleCandidateLine("csv_title", args.candidates.csvTitle),
    titleCandidateLine("blueprint_title", args.candidates.blueprintTitle),
  ]
    .filter(Boolean)
    .join("\n");

  const user = `TOPIC KEYWORD (do not paste as the title): ${kw || "(none)"}
PLACE / ENTITY (include once if it fits; do not repeat the keyword): ${place || "(none)"}
${kw ? buildKeywordPunctuationPromptBlock(kw) : ""}

Candidate titles (intent only; write ONE new complete title):
${candidateLines || "(no candidates)"}

JSON contract: respond with one object only. Double-quoted key wordpress_title. Example shape: {"wordpress_title":"How To Choose Between Hunter Douglas And Alta Shades"}`;

  const { content, parsed } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: SYSTEM,
    user,
    maxTokens: getCompetitorReportMaxOutputTokens(model),
    temperature: 0.25,
    responseFormat: BULK_WORDPRESS_TITLE_RESPONSE_FORMAT,
    signal: args.signal,
  });

  const fromParsed = parsed?.wordpress_title;
  if (typeof fromParsed === "string" && fromParsed.trim()) {
    return fromParsed.trim();
  }
  return parseTitleAgentJson(content);
}
