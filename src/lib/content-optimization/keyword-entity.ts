import { getResearchModel } from "@/lib/optimization-settings-storage";
import { filterAndRankQueriesWithAI, isNonEnglishKeyword } from "@/lib/gsc-query-processor";
import { stripBracketPlaceholders, stripLeadingP } from "@/lib/gsc-simple-keyword-recommendation";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { logger } from "@/lib/logger";

/** One row for batched entity keyword generation (Bulk: up to 100 per OpenRouter call). */
export type EntityKeywordBatchItem = { index: number; pageTitle: string; pageUrl: string };

function cleanEntityKeywordPhrase(raw: string): string {
  const t = raw.replace(/^["']|["']$/g, "").trim();
  if (!t) return "";
  return stripLeadingP(stripBracketPlaceholders(t));
}

function fallbackEntityKeyword(
  pageTitle: string,
  pageUrl: string,
  companyName: string,
): string {
  return cleanEntityKeywordPhrase(removeCompanyNameFromKeyword(pageTitle, companyName, pageTitle, pageUrl));
}

function parseEntityBatchJson(
  text: string,
): { keywords?: Array<{ index?: unknown; keyword?: unknown }> } | null {
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let v: unknown = tryParse(text);
  if (!v && text.includes("```")) {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m?.[1]) v = tryParse(m[1].trim());
  }
  if (!v || typeof v !== "object" || v === null) return null;
  const kw = (v as { keywords?: unknown }).keywords;
  if (!Array.isArray(kw)) return null;
  return { keywords: kw as Array<{ index?: unknown; keyword?: unknown }> };
}

/**
 * One OpenRouter call for many entity/service-area rows (same rules as `generateLocalKeywordForEntityPage`).
 * Caller should slice inputs (e.g. 100). Missing indices get title/URL fallback (no extra model calls).
 */
export async function generateLocalKeywordsForEntityPagesBatch(
  items: EntityKeywordBatchItem[],
  companyName: string,
  apiKey: string,
  model?: string,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();

  const fillFallbacks = () => {
    for (const it of items) {
      if (out.has(it.index)) continue;
      const fb = fallbackEntityKeyword(it.pageTitle, it.pageUrl, companyName);
      if (fb.length > 2) out.set(it.index, fb);
    }
  };

  if (!items.length) return out;
  if (!apiKey?.trim()) {
    fillFallbacks();
    return out;
  }

  const researchModel = model || getResearchModel();
  const lines = items
    .map(
      (it) =>
        `- index=${it.index} title=${JSON.stringify(it.pageTitle)} url=${JSON.stringify(it.pageUrl)}`,
    )
    .join("\n");

  try {
    const { content: rawText } = await postOpenRouterAppChat({
      apiKey,
      model: researchModel,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `You are given multiple entity or service-area pages. For EACH input row output exactly one localized search keyword in JSON only.

Output shape: {"keywords":[{"index":number,"keyword":string},...]}
Rules:
- Include every input index exactly once. Echo the same numeric "index" from the input line for each object.
- NEVER include the company name "${companyName}"
- NEVER use a competitor name or competitor-focused phrasing
- Prefer product or service terms; align with the page title and URL
- For neighborhood or sub-city URLs: include the named area from the URL plus metro or region when the slug encodes a distinct place
- Without a sub-city in the URL: service type + city + region is fine
- Natural search phrases: about 2–6 words (more when neighborhood + city + region need naming)
- NEVER use placeholders like [city], [region], or [city name]; use real words only
- "keyword" is the phrase only, no quotes in the JSON string value

Input rows:
${lines}`,
        },
      ],
      temperature: 0.35,
      maxTokens: Math.min(16000, 400 + items.length * 48),
    });
    const parsed = parseEntityBatchJson(rawText);
    const rows = parsed?.keywords;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const idx = row?.index;
        const kwRaw = row?.keyword;
        if (typeof idx !== "number" || typeof kwRaw !== "string") continue;
        const cleaned = cleanEntityKeywordPhrase(kwRaw);
        if (cleaned.length > 2) out.set(idx, cleaned);
      }
    }
  } catch (error) {
    logger.warn("[Local Keyword Batch] AI generation failed:", error);
  }

  fillFallbacks();
  return out;
}

/**
 * Removes company name from keyword and cleans it up.
 * For entity pages, focuses on local keywords that align with the page title.
 */
export function removeCompanyNameFromKeyword(
  keyword: string,
  companyName: string,
  _pageTitle?: string,
  _pageUrl?: string
): string {
  if (!keyword || !companyName) return keyword;
  const keywordLower = keyword.toLowerCase().trim();
  const companyNameLower = companyName.toLowerCase().trim();
  const companyWords = companyNameLower.split(/\s+/).filter((w) => w.length > 2);
  let cleanedKeyword = keywordLower;
  for (const word of companyWords) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    cleanedKeyword = cleanedKeyword.replace(regex, "").trim();
  }
  cleanedKeyword = cleanedKeyword.replace(/\s+/g, " ").trim();
  if (!cleanedKeyword || cleanedKeyword.length < 2) return keyword;
  return cleanedKeyword;
}

/**
 * Generates a local-focused keyword for entity pages based on page title and URL.
 * Uses Open Router AI; fallback: removeCompanyNameFromKeyword from title.
 */
export async function generateLocalKeywordForEntityPage(
  pageTitle: string,
  pageUrl: string,
  companyName: string,
  apiKey: string,
  model?: string
): Promise<string> {
  const researchModel = model || getResearchModel();
  try {
    const { content: aiKeywordRaw } = await postOpenRouterAppChat({
      apiKey,
      model: researchModel,
      messages: [
        {
          role: "user",
          content: `Analyze this entity/service area page and generate a local-focused keyword:

Page Title: "${pageTitle}"
Page URL: "${pageUrl}"
Company Name: "${companyName}"

Generate a keyword that:
- NEVER includes the company name "${companyName}"
- NEVER is a competitor name or competitor-focused; never optimize for competitors
- A competitor keyword is often location + main topic; avoid that pattern when it would target another business
- Prefer product- or service-based when they fit the page; not restricted to only those
- Closely aligns with the page title
- For service-area / neighborhood URLs: include the named sub-city place from the URL when present (neighborhood, district, borough) plus metro/region - e.g. service + neighborhood + city, not service + city only when the slug encodes a distinct area
- For pages without a sub-city entity in the URL: local keywords (service type + city + region) are fine
- Is what users would actually search for (about 2–6 words; use more words when neighborhood + city + province/state are needed)
- NEVER use placeholders like [city], [region], [city name], or [city/region] - use only real words.

Return ONLY the keyword phrase, nothing else.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 50,
    });
    const aiKeyword = aiKeywordRaw.trim();
    if (aiKeyword && aiKeyword.length > 2) {
      const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim();
      return stripLeadingP(stripBracketPlaceholders(cleaned));
    }
  } catch (error) {
    logger.warn("[Local Keyword Generation] AI generation failed:", error);
  }
  return removeCompanyNameFromKeyword(pageTitle, companyName, pageTitle, pageUrl);
}

/**
 * Uses AI to select the best keyword from GSC queries for entity pages.
 */
export async function selectBestKeywordForEntityPage(
  pageTitle: string,
  pageUrl: string,
  companyName: string,
  gscQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  apiKey: string,
  model?: string
): Promise<{ query: string; clicks: number; impressions: number; ctr: number; position: number } | null> {
  const researchModel = model || getResearchModel();
  if (!gscQueries?.length) return null;

  let companyNameToCheck = companyName.toLowerCase().trim();
  if (!companyNameToCheck && pageUrl) {
    try {
      const urlObj = new URL(pageUrl);
      const domain = urlObj.hostname.replace("www.", "").split(".")[0];
      companyNameToCheck = domain.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    } catch {
      // ignore
    }
  }

  const filteredQueries = await filterAndRankQueriesWithAI(
    gscQueries,
    pageUrl,
    apiKey,
    researchModel,
    companyNameToCheck
  );
  if (filteredQueries.length === 0) return null;

  try {
    const queriesList = filteredQueries
      .map(
        (q, idx) =>
          `${idx + 1}. "${q.query}" - ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position?.toFixed(1) || "N/A"}`
      )
      .join("\n");

    const { content: selectedKeywordRaw } = await postOpenRouterAppChat({
      apiKey,
      model: researchModel,
      messages: [
        {
          role: "user",
          content: `Select the BEST keyword from these GSC queries for page "${pageTitle}".

Queries:
${queriesList}

Select the keyword that best matches the page content and has good traffic potential. Location+service keywords (e.g., "tooth crown edmonton ab") are valid if they describe a service, not a business name.

Return the exact keyword phrase or 'NONE' if none are suitable.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 100,
    });
    const selectedKeyword = selectedKeywordRaw.trim();
      if (selectedKeyword.toUpperCase().includes("NONE") || selectedKeyword.length === 0) return null;
      const cleaned = selectedKeyword.replace(/^["']|["']$/g, "").trim();
      const normalizedCleaned = cleaned.toLowerCase().replace(/\s+/g, "");
      const matchingQuery = filteredQueries.find((q) => {
        if (!q.query || typeof q.query !== "string" || isNonEnglishKeyword(q.query)) return false;
        if (q.query.toLowerCase().trim() === cleaned.toLowerCase().trim()) return true;
        const normalizedQuery = q.query.toLowerCase().trim().replace(/\s+/g, "");
        if (normalizedQuery === normalizedCleaned) return true;
        if (normalizedQuery.includes(normalizedCleaned) || normalizedCleaned.includes(normalizedQuery)) return true;
        return false;
      });
      if (matchingQuery) return matchingQuery;
      return null;
  } catch (error) {
    logger.warn("[Entity Keyword Selection] AI selection failed:", error);
  }
  return filteredQueries.length > 0 ? filteredQueries[0] : null;
}
