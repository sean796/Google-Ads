import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
/**
 * Single AI path: send full WordPress post (API response) to OpenRouter research model.
 * AI reads everything and returns the primary SEO keyword. No pattern matching, no fallbacks.
 */

const MAX_POST_CHARS = 18000; // Leave room for system prompt in 20k context

export interface ExtractPrimaryKeywordOptions {
  apiKey: string;
  model: string;
}

/**
 * Build full post payload from whatever we have (resolved, acf, meta, title, content, excerpt).
 * Used as the single source for the AI to read.
 */
export function buildFullPostPayload(pieces: {
  resolved?: Record<string, unknown> | null;
  acfFields?: Record<string, unknown> | null;
  existingTitle?: string;
  existingContent?: string;
  existingExcerpt?: string;
  pageUrl?: string;
}): Record<string, unknown> {
  const { resolved, acfFields, existingTitle, existingContent, existingExcerpt, pageUrl } = pieces;
  const wpRendered = (value: unknown): unknown =>
    value && typeof value === "object" && "rendered" in value
      ? (value as { rendered: unknown }).rendered
      : value;
  const payload: Record<string, unknown> = {
    url: pageUrl ?? resolved?.link ?? null,
    title: wpRendered(resolved?.title) ?? existingTitle ?? null,
    content: wpRendered(resolved?.content) ?? existingContent ?? null,
    excerpt: wpRendered(resolved?.excerpt) ?? existingExcerpt ?? null,
    acf: acfFields ?? (resolved?.acf ?? null),
    meta: resolved?.meta ?? null,
  };
  // Include any other top-level keys from resolved so AI sees everything the API returned
  if (resolved && typeof resolved === "object") {
    for (const key of Object.keys(resolved)) {
      if (!["title", "content", "excerpt", "acf", "meta"].includes(key) && resolved[key] !== undefined) {
        payload[key] = resolved[key];
      }
    }
  }
  return payload;
}

/**
 * Send full post JSON to OpenRouter research model. AI returns only the primary keyword phrase.
 * No fallbacks, no pattern matching - AI reads the full post and extracts the keyword.
 */
export async function extractPrimaryKeywordFromFullPostViaAI(
  fullPostPayload: Record<string, unknown>,
  options: ExtractPrimaryKeywordOptions
): Promise<string> {
  const { apiKey, model } = options;
  if (!apiKey?.trim()) throw new Error("OpenRouter API key is required");

  const json = JSON.stringify(fullPostPayload, null, 0);
  const truncated =
    json.length > MAX_POST_CHARS ? json.slice(0, MAX_POST_CHARS) + "\n...(truncated)" : json;

  const systemPrompt = `You are an SEO assistant. You will receive the full WordPress post data (JSON) from the site's API. Your only job is to extract the primary SEO keyword or focus for this page.

Rules:
- Prefer any field that clearly indicates the page focus: e.g. "prompt modifier", "keyword focus", "seo_prompt_modifier", "keyword_focus", or similar. Use that value as the primary keyword.
- If no such field exists or is empty, use the page title, meta description, or content to infer the primary keyword.
- Return ONLY the keyword phrase. No explanation, no quotes, no markdown, no preamble. One line only.`;

  const userPrompt = `Below is the full WordPress post data (JSON). Extract the primary SEO keyword or focus for this page. Return only that phrase.\n\n${truncated}`;

  const response = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  const keyword = content
    .replace(/^["']|["']$/g, "")
    .replace(/\n.*/s, "")
    .trim();
  return keyword;
}
