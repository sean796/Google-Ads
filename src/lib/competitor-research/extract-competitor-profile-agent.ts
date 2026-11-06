import { callOpenRouterJsonObject } from "@/lib/competitor-research/competitor-openrouter-json-object";
import type { CompetitorPageMeta, CompetitorSiteProfile } from "@/lib/competitor-research/types";

const PROFILE_SYSTEM = `You are a local business site analyst. Output ONLY valid JSON:
{"services":["..."],"categories":["..."],"metaPatterns":["..."]}

Rules:
- services: concrete offerings inferred from page titles, meta, and body snippets (max 15)
- categories: high-level business categories (max 5)
- metaPatterns: short notes on how they describe themselves in meta/titles (max 5)
- Use only evidence from the input pages; do not invent services not suggested by the text`;

export async function runExtractCompetitorProfileAgent(args: {
  apiKey: string;
  model: string;
  businessName: string;
  domain: string | null;
  pages: CompetitorPageMeta[];
  signal?: AbortSignal;
}): Promise<Pick<CompetitorSiteProfile, "services" | "categories" | "metaPatterns">> {
  const payload = {
    businessName: args.businessName,
    domain: args.domain,
    pages: args.pages.map((p) => ({
      url: p.url,
      title: p.title,
      metaDescription: p.metaDescription,
      bodySnippet: p.bodySnippet.slice(0, 1500),
    })),
  };

  const parsedRaw = await callOpenRouterJsonObject({
    apiKey: args.apiKey,
    model: args.model,
    system: PROFILE_SYSTEM,
    user: JSON.stringify(payload),
    maxTokens: 2048,
    temperature: 0.2,
    signal: args.signal,
    allowEmptyOnFailure: true,
  });

  const parsed = (parsedRaw ?? {}) as {
    services?: unknown;
    categories?: unknown;
    metaPatterns?: unknown;
  };

  const toStrings = (v: unknown, max: number): string[] => {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max);
  };

  return {
    services: toStrings(parsed.services, 15),
    categories: toStrings(parsed.categories, 5),
    metaPatterns: toStrings(parsed.metaPatterns, 5),
  };
}
