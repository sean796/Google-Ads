/**
 * AI-driven link relevance filter: uses OpenRouter to select only posts that are
 * topically relevant to the target keyword. No manual pattern matching; no arbitrary caps.
 * Call this before HTTP 200 validation so we only validate links that matter.
 * Results are cached per siteId + keyword so bulk runs skip repeated AI calls.
 */

import { logger } from "@/lib/logger";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export type PostWithLink = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
};

// siteId -> normalized keyword -> filtered posts
const relevanceCache = new Map<string, Map<string, PostWithLink[]>>();

function normalizeUrlForMatch(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Clears the relevance cache for a site (call when site cache is cleared).
 */
export function clearRelevanceCache(siteId: string): void {
  relevanceCache.delete(siteId);
}

/**
 * Uses OpenRouter with a content-specialist prompt to select only posts that are
 * topically relevant to the target keyword. Returns the filtered array (no cap).
 * If the AI call fails or returns invalid data, returns the original list so we don't break the pipeline.
 * Caches result by siteId + keyword so repeated calls for the same keyword skip the AI call.
 */
export async function filterPostsByTopicalRelevance(
  posts: PostWithLink[],
  keyword: string,
  apiKey: string,
  siteId?: string
): Promise<PostWithLink[]> {
  if (!posts?.length || !keyword?.trim() || !apiKey?.trim()) {
    return posts;
  }

  const key = keyword.trim().toLowerCase();
  if (siteId) {
    let siteMap = relevanceCache.get(siteId);
    if (siteMap?.has(key)) {
      const cached = siteMap.get(key)!;
      return cached.length > 0 ? cached : posts;
    }
    if (!siteMap) {
      siteMap = new Map();
      relevanceCache.set(siteId, siteMap);
    }
  }

  const model = getResearchModel(siteId);
  const listText = posts
    .map((p) => `- Title: "${p.title}"\n  URL: ${p.link}`)
    .join("\n");

  const systemPrompt = `You are a content specialist for internal linking. Given a target keyword and a list of site pages (title + URL), select ONLY the pages that are topically relevant as internal link targets for content about that keyword. Consider semantic relationship, user journey, and genuine topical fit. Exclude pages that are only loosely related. Return a JSON array of the exact URLs you selected (strings), copying them character-for-character from the Site pages list below - e.g. ["https://client-domain.com/page-a"]. Return only the JSON array, no markdown code fence, no explanation.`;

  const userPrompt = `Target keyword: "${keyword.trim()}"\n\nSite pages:\n${listText}\n\nReturn a JSON array of the exact URLs (as strings) that are topically relevant internal link targets for this keyword.`;

  try {
    const res = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });
    if (!res.ok) {
      logger.warn("[ai-link-relevance-filter] OpenRouter failed:", res.status, "- using all posts");
      return posts;
    }
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
    const selectedUrls = JSON.parse(jsonStr) as string[];
    if (!Array.isArray(selectedUrls)) {
      logger.warn("[ai-link-relevance-filter] Response was not an array - using all posts");
      return posts;
    }

    const selectedSet = new Set(
      selectedUrls.map((u) => normalizeUrlForMatch(String(u))).filter(Boolean)
    );
    const filtered = posts.filter((p) => {
      const norm = normalizeUrlForMatch(p.link);
      return norm && selectedSet.has(norm);
    });

    if (filtered.length === 0) {
      logger.warn("[ai-link-relevance-filter] AI selected no posts - using all posts");
      if (siteId) relevanceCache.get(siteId)?.set(key, posts);
      return posts;
    }
    if (siteId) relevanceCache.get(siteId)?.set(key, filtered);
    return filtered;
  } catch (err) {
    logger.warn("[ai-link-relevance-filter] Error:", err, "- using all posts");
    return posts;
  }
}
