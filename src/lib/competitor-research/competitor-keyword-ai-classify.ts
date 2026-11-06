import { z } from "zod";
import { loadApiKey } from "@/lib/api";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { sortKeywordsByTrafficThenVolume } from "@/lib/competitor-research/competitor-keyword-sort";
import type {
  CompetitorKeywordRow,
  CompetitorResearchSemrushResponse,
} from "@/lib/competitor-research/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";

export type CompetitorKeywordVerdict = "keep" | "rival-brand" | "off-topic";

export type CompetitorKeywordVerdictItem = {
  domain: string;
  phrase: string;
  verdict: CompetitorKeywordVerdict;
};

const verdictBatchSchema = z.object({
  results: z
    .array(
      z.object({
        domain: z.string().min(1),
        phrase: z.string().min(1),
        verdict: z.enum(["keep", "rival-brand", "off-topic"]),
      }),
    )
    .min(1),
});

const BATCH_SIZE = 40;

const SYSTEM_PROMPT = `You filter competitor keyword lists for an SEO research tool.
For each keyword, in the context of the seed site it competes with, return one verdict:
- rival-brand: a navigational query for that competitor's own business or brand name (someone looking for that specific company, not a service)
- off-topic: unrelated to the products, services, or topics the seed site offers
- keep: everything else, including generic service, product, and location queries
Return ONLY a JSON object: {"results":[{"domain":"...","phrase":"...","verdict":"keep"}]} with one entry per input item, copying domain and phrase exactly.`;

function verdictKey(domain: string, phrase: string): string {
  return `${domain.trim().toLowerCase()}\n${phrase.trim().toLowerCase()}`;
}

/**
 * AI verdicts for competitor keywords. Fails visibly: malformed model output or a
 * missing item in the response throws instead of passing keywords through.
 */
export async function classifyCompetitorKeywordsWithAi(args: {
  seedDomain: string;
  seedKeywordPhrases: string[];
  items: { domain: string; phrase: string }[];
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<Map<string, CompetitorKeywordVerdict>> {
  const cleaned: { domain: string; phrase: string }[] = [];
  const seen = new Set<string>();
  for (const item of args.items) {
    const domain = (item.domain || "").trim();
    const phrase = (item.phrase || "").trim();
    if (!domain || !phrase) continue;
    const key = verdictKey(domain, phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ domain, phrase });
  }
  const out = new Map<string, CompetitorKeywordVerdict>();
  if (!cleaned.length) return out;

  const apiKey = args.apiKey ?? loadApiKey();
  const model = args.model ?? getResearchModel();
  const seedContext = {
    seedDomain: args.seedDomain,
    seedKeywords: args.seedKeywordPhrases.slice(0, 30),
  };

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const batch = cleaned.slice(i, i + BATCH_SIZE);
    const { content } = await callOpenRouterChatCompletion({
      apiKey,
      model,
      system: SYSTEM_PROMPT,
      user: JSON.stringify({ ...seedContext, keywords: batch }),
      maxTokens: 200 + batch.length * 50,
      temperature: 0,
      responseFormat: { type: "json_object" },
      signal: args.signal,
    });

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(content);
    } catch {
      throw new Error("Competitor keyword classifier returned invalid JSON");
    }
    const parsed = verdictBatchSchema.parse(rawJson);

    const byKey = new Map<string, CompetitorKeywordVerdict>();
    for (const r of parsed.results) {
      byKey.set(verdictKey(r.domain, r.phrase), r.verdict);
    }
    for (const item of batch) {
      const verdict = byKey.get(verdictKey(item.domain, item.phrase));
      if (!verdict) {
        throw new Error(
          `Competitor keyword classifier omitted keyword: ${item.phrase} (${item.domain})`,
        );
      }
      out.set(verdictKey(item.domain, item.phrase), verdict);
    }
  }

  return out;
}

/**
 * Drops rival-brand and off-topic keywords from enrichment, per domain.
 * Throws when classification fails; never returns unfiltered keywords on error.
 */
export async function filterEnrichmentWithAiClassifier(
  enrichment: CompetitorResearchSemrushResponse["enrichmentByDomain"],
  ctx: { seedDomain: string; seedKeywordPhrases: string[] },
  opts?: { apiKey?: string; model?: string; signal?: AbortSignal },
): Promise<CompetitorResearchSemrushResponse["enrichmentByDomain"]> {
  if (!enrichment) return enrichment;

  const items: { domain: string; phrase: string }[] = [];
  for (const [domain, enr] of Object.entries(enrichment)) {
    for (const row of enr.topKeywords ?? []) {
      items.push({ domain, phrase: row.phrase || "" });
    }
  }
  if (!items.length) return enrichment;

  const verdicts = await classifyCompetitorKeywordsWithAi({
    seedDomain: ctx.seedDomain,
    seedKeywordPhrases: ctx.seedKeywordPhrases,
    items,
    apiKey: opts?.apiKey,
    model: opts?.model,
    signal: opts?.signal,
  });

  const keepRow = (domain: string, row: CompetitorKeywordRow): boolean =>
    verdicts.get(verdictKey(domain, row.phrase || "")) === "keep";

  const out: NonNullable<typeof enrichment> = {};
  for (const [domain, enr] of Object.entries(enrichment)) {
    const top = sortKeywordsByTrafficThenVolume(
      (enr.topKeywords ?? []).filter((r) => keepRow(domain, r)),
    );
    if (top.length > 0) {
      out[domain] = { ...enr, topKeywords: top };
    }
  }
  return out;
}
