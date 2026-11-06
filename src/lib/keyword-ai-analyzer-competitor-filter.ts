import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { logger } from "@/lib/logger";

/**
 * Filters competitor keywords from a string array using AI (similar to Content Optimizer logic)
 * This is a simplified version that works with string arrays instead of GSC query objects
 */
export async function filterCompetitorKeywordsFromStrings(
  keywords: string[],
  siteUrl: string,
  companyName: string | undefined,
  apiKey: string,
  model: string
): Promise<string[]> {
  if (!keywords || keywords.length === 0) {
    return keywords;
  }

  // If only one keyword, check it individually
  if (keywords.length === 1) {
    const isValid = await checkIfServiceKeywordString(keywords[0], siteUrl, companyName, apiKey, model);
    return isValid ? keywords : [];
  }

  // Batch process keywords in parallel
  const batchSize = 35;
  const validKeywords: string[] = [];

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    try {
      const filtered = await filterBatchOfKeywordStrings(batch, siteUrl, companyName, apiKey, model);
      validKeywords.push(...filtered);
    } catch (error) {
      logger.warn('[Keyword AI Analyzer] Error filtering competitor keywords batch:', error);
      // Fail-safe: skip this batch
    }
  }

  return validKeywords;
}

/**
 * Filters a batch of keyword strings using AI
 */
async function filterBatchOfKeywordStrings(
  keywords: string[],
  siteUrl: string,
  companyName: string | undefined,
  apiKey: string,
  model: string
): Promise<string[]> {
  try {
    const keywordsList = keywords.map((kw, idx) => `${idx + 1}. "${kw}"`).join('\n');
    const prompt = `You are a local SEO expert. Filter these keywords - keep English service/product keywords, exclude competitor business names${companyName ? ` or "${companyName}" queries` : ''}.

Keywords:
${keywordsList}

Return JSON array of keyword numbers to KEEP: [1, 3, 5]`;

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = content.match(/\[[\d\s,]+\]/) || content.match(/```(?:json)?\s*(\[[\d\s,]+\])\s*```/);
    
    if (jsonMatch) {
      const validIndices: number[] = JSON.parse(jsonMatch[0] || jsonMatch[1] || '[]');
      return keywords.filter((_, idx) => validIndices.includes(idx + 1));
    }
    return keywords;
  } catch (error) {
    logger.warn('[Keyword AI Analyzer] Error filtering keywords:', error);
    return keywords;
  }
}

/**
 * Checks a single keyword string to determine if it's a service keyword (not a competitor)
 */
async function checkIfServiceKeywordString(
  keyword: string,
  siteUrl: string,
  companyName: string | undefined,
  apiKey: string,
  model: string
): Promise<boolean> {
  try {
    const prompt = `Is "${keyword}" a service/product keyword or competitor business name? Return "true" for service, "false" for competitor.`;

    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 50,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    return content.includes('true');
  } catch (error) {
    logger.warn('[Keyword AI Analyzer] Error checking single keyword:', error);
    return true;
  }
}
