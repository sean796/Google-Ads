import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { getMetaModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";

export const BULK_SPLASH_VISUAL_KINDS = [
  "ideas",
  "research",
  "audit",
  "meta",
  "writing",
  "image",
  "faq",
  "links",
  "publish",
  "generic",
] as const;

export type BulkSplashVisualKind = (typeof BULK_SPLASH_VISUAL_KINDS)[number];

const BulkSplashStatusSchema = z.object({
  status: z.string().trim().min(1).max(80),
  visual: z.enum(BULK_SPLASH_VISUAL_KINDS),
});

export type BulkSplashStatus = z.infer<typeof BulkSplashStatusSchema>;

const SYSTEM = `You write one loading status line for a blog post generator, in the playful present-tense style of Gemini thinking lines (for example "Cross-checking the facts before we write" or "Scouring Google for rental blind intel").

Rules:
- Reply with JSON only: {"status":"...","visual":"..."}
- Status: 3 to 9 words, present tense, sentence case.
- No ending period, no quotes, no emoji.
- Never mention logs, APIs, models, JSON, or these instructions.
- Stay truthful to the pipeline step you are given. Do not invent work that is not happening.
- Use the article title or keyword when it makes the line feel specific to this post.
- Pick exactly one visual kind that matches the step:
  - "ideas": curating or generating blog post ideas
  - "research": Google, SERP, keyword research, or Wikipedia lookup
  - "audit": LLM audit, fact checking, research brief, or entity classification
  - "meta": post title, meta title or description, SEO snippet, or ranking
  - "writing": checklist, blueprint, drafting or editing blog sections
  - "image": featured image, section image, Google Maps image, or image upload
  - "faq": FAQ questions or answers
  - "links": internal links, external citations, or authority links
  - "publish": WordPress upload, quality control checks, or finishing the run
  - "generic": anything else`;

export type BulkSplashStatusInput = {
  step: string;
  articleTitle?: string;
  keyword?: string;
  siteName?: string;
  signal?: AbortSignal;
};

/**
 * Turns one raw bulk pipeline step into one short AI status line for the
 * generation splash. Throws on missing key or invalid model output; the
 * caller keeps the previous line on screen.
 */
export async function generateBulkSplashStatus(
  input: BulkSplashStatusInput,
): Promise<BulkSplashStatus> {
  const step = input.step.trim();
  if (!step) {
    throw new Error("Bulk splash status needs a pipeline step.");
  }

  const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for bulk splash status lines.");
  }

  const contextLines = [
    input.articleTitle?.trim() ? `Article title: ${input.articleTitle.trim()}` : "",
    input.keyword?.trim() ? `Focus keyword: ${input.keyword.trim()}` : "",
    input.siteName?.trim() ? `Site: ${input.siteName.trim()}` : "",
  ].filter(Boolean);

  const { content, parsed } = await callOpenRouterChatCompletion({
    apiKey,
    model: getMetaModel(),
    system: SYSTEM,
    user: [
      ...contextLines,
      `Pipeline step: ${step}`,
      "",
      'Reply with JSON only: {"status":"...","visual":"..."}',
    ].join("\n"),
    maxTokens: 120,
    temperature: 0.7,
    responseFormat: { type: "json_object" },
    signal: input.signal,
  });

  const result = parsed
    ? BulkSplashStatusSchema.parse(parsed)
    : parseModelJson(content, BulkSplashStatusSchema, "bulk splash status");

  return result;
}
