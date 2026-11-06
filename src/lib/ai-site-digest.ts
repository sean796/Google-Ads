/**
 * AI-compressed site digest: topic clusters + compact linkable list.
 * Generated once per site per run and stored on SiteContentCache to reduce prompt tokens.
 */

import { getSiteCache } from "@/lib/wordpress-site-cache";
import type { SiteDigest } from "@/lib/wordpress-site-cache";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

const MAX_POSTS_FOR_COMPACT = 30;

type PostLike = { title: string; link: string };

function buildLinkablePostsCompact(posts: PostLike[]): string {
  return posts
    .slice(0, MAX_POSTS_FOR_COMPACT)
    .map((p) => `"${(p.title || "").replace(/"/g, "'")}" | ${p.link || ""}`)
    .join("\n");
}

/**
 * Returns or creates a site digest (topic clusters + compact link list) and stores it on the cache.
 * On first call for a site, calls OpenRouter to summarize post titles into 5-10 topic clusters.
 */
export async function getOrCreateSiteDigest(
  siteId: string,
  posts: PostLike[],
  apiKey: string,
  siteIdForModel?: string
): Promise<SiteDigest | null> {
  if (!posts.length || !apiKey?.trim()) return null;

  const cache = getSiteCache(siteId);
  if (cache?.siteDigest) return cache.siteDigest;

  const linkablePostsCompact = buildLinkablePostsCompact(posts);
  const titles = posts.slice(0, 100).map((p) => p.title).filter(Boolean);
  if (!titles.length) {
    const digest: SiteDigest = {
      siteId,
      topicClusters: "General site content.",
      linkablePostsCompact,
      generatedAt: Date.now(),
    };
    if (cache) cache.siteDigest = digest;
    return digest;
  }

  const model = getResearchModel(siteIdForModel ?? siteId);
  const listText = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const systemPrompt = `You are a content analyst. Given a list of page titles from a website, group them into 5-10 topic clusters. For each cluster, give a short topic name and 2-3 representative titles. Output a single concise paragraph: "Site covers: [topic1] (e.g. title A, title B), [topic2] (e.g. title C), ..." No bullet lists, no markdown. Keep under 400 words.`;

  const userPrompt = `Page titles:\n${listText}\n\nSummarize into 5-10 topic clusters in one paragraph.`;

  try {
    const res = await postOpenRouterAppChatFetch({
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const topicClusters = (data.choices?.[0]?.message?.content ?? "").trim() || "General site content.";

    const digest: SiteDigest = {
      siteId,
      topicClusters,
      linkablePostsCompact,
      generatedAt: Date.now(),
    };

    if (cache) cache.siteDigest = digest;
    return digest;
  } catch {
    const digest: SiteDigest = {
      siteId,
      topicClusters: "General site content.",
      linkablePostsCompact,
      generatedAt: Date.now(),
    };
    if (cache) cache.siteDigest = digest;
    return digest;
  }
}

export type { SiteDigest };
