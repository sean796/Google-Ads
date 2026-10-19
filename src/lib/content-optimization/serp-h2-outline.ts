import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import { getResearchModel } from "@/lib/optimization-settings-storage";

const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["h2Titles"],
  properties: {
    h2Titles: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 6,
    },
  },
} as const;

const SERP_H2_OUTLINE_SYSTEM = `You are an AISEO content strategist. Return JSON only: { "h2Titles": string[] } with exactly 5 or 6 body H2 headings for one blog article.

Rules:
- Headings must be specific to the primary keyword, connected site, and SERP research (competitor patterns, PAA, gaps).
- Each title is unique, SEO-friendly, active, and 3-12 words. No colons in titles.
- Cover search intent: decision criteria, comparison or process, one illustrative scenario section, application or selection, site-first recommendation.
- Forbidden body H2 titles: "Introduction", "Overview", "FAQ", "Frequently Asked Questions", "Q&A", "What is [topic]", "Your Guide to [topic]".
- Do not copy competitor titles word-for-word; adapt for this site and keyword.`;

export function formatSerpH2OutlineBlock(h2Titles: readonly string[]): string {
  const rows = h2Titles.map((title, index) => `${index + 1}. ${title}`);
  return [
    "--- SERP H2 OUTLINE (NON-NEGOTIABLE) ---",
    "Use these exact H2 titles as the first words on each checklist line (one H2 per item).",
    "Do not rename or merge sections.",
    ...rows,
    "--- END SERP H2 OUTLINE ---",
  ].join("\n");
}

function organicHeadingHints(brief: SeoContentBriefV1 | null | undefined): string[] {
  const hints: string[] = [];
  for (const row of brief?.dataforseo?.organic ?? []) {
    const t = row.title?.trim();
    if (t) hints.push(t);
  }
  return hints.slice(0, 12);
}

export function validateSerpH2OutlineTitles(
  titles: string[],
  forbiddenLiveH2s?: readonly string[],
): string[] {
  const liveLower = new Set((forbiddenLiveH2s ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    const title = raw.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    if (liveLower.has(key)) {
      throw new Error(`SERP H2 outline reused live post H2: ${title}`);
    }
    seen.add(key);
    out.push(title);
  }
  if (out.length < 5 || out.length > 6) {
    throw new Error(`SERP H2 outline must have 5-6 titles; got ${out.length}`);
  }
  return out;
}

export async function deriveSerpH2Outline(input: {
  apiKey: string;
  primaryKeyword: string;
  title?: string;
  siteName: string;
  siteUrl?: string;
  serpBrief?: SeoContentBriefV1 | null;
  serpBriefJson?: string | null;
  forbiddenLiveH2s?: readonly string[];
  model?: string;
  siteId?: string;
}): Promise<string[]> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new Error("OpenRouter API key required for SERP H2 outline");

  let brief = input.serpBrief ?? null;
  if (!brief && input.serpBriefJson?.trim()) {
    try {
      brief = JSON.parse(input.serpBriefJson) as SeoContentBriefV1;
    } catch {
      brief = null;
    }
  }

  const keyword = input.primaryKeyword.trim();
  const paa = (brief?.dataforseo?.peopleAlsoAsk ?? [])
    .map((p) => p.question?.trim())
    .filter(Boolean)
    .slice(0, 8);
  const related = [
    ...(brief?.dataforseo?.relatedSearches ?? []),
    ...(brief?.dataforseo?.peopleAlsoSearchPhrases ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  const user = [
    input.title?.trim() ? `Article title: ${input.title.trim()}` : "",
    keyword ? `Primary keyword: ${keyword}` : "",
    input.siteName.trim() ? `Connected site: ${input.siteName.trim()}` : "",
    input.siteUrl?.trim() ? `Site URL: ${input.siteUrl.trim()}` : "",
    paa.length ? `People Also Ask:\n${paa.map((q) => `- ${q}`).join("\n")}` : "",
    related.length ? `Related searches:\n${related.map((r) => `- ${r}`).join("\n")}` : "",
    organicHeadingHints(brief).length
      ? `SERP organic title hints:\n${organicHeadingHints(brief).map((h) => `- ${h}`).join("\n")}`
      : "",
    brief?.gsc?.queries?.length
      ? `GSC query sample:\n${brief.gsc.queries
          .slice(0, 15)
          .map((q) => `- ${q}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!keyword) {
    throw new Error("SERP H2 outline requires a primary keyword");
  }

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: input.model?.trim() || getResearchModel(input.siteId),
    system: SERP_H2_OUTLINE_SYSTEM,
    user,
    maxTokens: 2048,
    temperature: 0.4,
    reasoning: { effort: "low" },
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "serp_h2_outline", strict: true, schema: OUTLINE_SCHEMA },
    },
  });

  const parsed = parseJsonStrict<{ h2Titles?: unknown }>(content);
  const raw = Array.isArray(parsed?.h2Titles)
    ? parsed!.h2Titles.map((t) => String(t ?? "").trim()).filter(Boolean)
    : [];
  return validateSerpH2OutlineTitles(raw, input.forbiddenLiveH2s);
}
