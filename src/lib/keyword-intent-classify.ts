import { z } from "zod";
import { loadApiKey } from "@/lib/api";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export type KeywordIntentLabel =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export type KeywordIntentResult = {
  keyword: string;
  intent: KeywordIntentLabel;
  probability: number;
};

const intentBatchSchema = z.object({
  results: z
    .array(
      z.object({
        keyword: z.string().min(1),
        intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
        probability: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

const BATCH_SIZE = 40;

const SYSTEM_PROMPT = `You classify the search intent of keywords for an SEO tool.
For each keyword return exactly one intent:
- informational: the searcher wants to learn (questions, guides, definitions)
- commercial: the searcher is comparing or evaluating options before buying (best, review, vs, alternatives)
- transactional: the searcher is ready to buy, book, hire, or get a quote (buy, price, near me, hire, order)
- navigational: the searcher wants a specific site, brand, or page
Also return probability: your confidence from 0 to 1.
Return ONLY a JSON object: {"results":[{"keyword":"...","intent":"...","probability":0.0}]} with one entry per input keyword, copying each keyword exactly.`;

/**
 * AI keyword intent classification. Fails visibly: malformed model output or a
 * missing keyword in the response throws instead of guessing.
 */
export async function classifyKeywordIntentWithAi(
  keywords: string[],
  opts?: { apiKey?: string; model?: string; signal?: AbortSignal },
): Promise<KeywordIntentResult[]> {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords) {
    const kw = typeof raw === "string" ? raw.trim() : "";
    if (!kw) continue;
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(kw);
  }
  if (!cleaned.length) return [];

  const apiKey = opts?.apiKey ?? loadApiKey();
  const model = opts?.model ?? getResearchModel();
  const out: KeywordIntentResult[] = [];

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE);
    const { content } = await callOpenRouterChatCompletion({
      apiKey,
      model,
      system: SYSTEM_PROMPT,
      user: JSON.stringify({ keywords: batch }),
      maxTokens: 200 + batch.length * 60,
      temperature: 0,
      responseFormat: { type: "json_object" },
      signal: opts?.signal,
    });

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(content);
    } catch {
      throw new Error("Keyword intent classifier returned invalid JSON");
    }
    const parsed = intentBatchSchema.parse(rawJson);

    const byKeyword = new Map<string, KeywordIntentResult>();
    for (const r of parsed.results) {
      byKeyword.set(r.keyword.trim().toLowerCase(), {
        keyword: r.keyword,
        intent: r.intent,
        probability: r.probability,
      });
    }
    for (const kw of batch) {
      const hit = byKeyword.get(kw.toLowerCase());
      if (!hit) {
        throw new Error(`Keyword intent classifier omitted keyword: ${kw}`);
      }
      out.push({ keyword: kw, intent: hit.intent, probability: hit.probability });
    }
  }

  return out;
}
