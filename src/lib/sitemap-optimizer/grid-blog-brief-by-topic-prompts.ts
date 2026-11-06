import { BULK_WORDPRESS_POST_TITLE_RULE } from "@/lib/prompt-builders/title-rules";
import {
  GRID_BRIEF_TECHNICAL_APPEND,
  TECHNICAL_SEO_STRATEGIST_ROLE,
} from "@/lib/sitemap-optimizer/seo-strategist-prompts";
import { ensureKeywordYearsInTitle } from "@/lib/sitemap-optimizer/grid-title-year";
import type { SitemapOptimizerMergeRecommendation } from "@/lib/sitemap-optimizer/types";

const GRID_BLOG_BRIEF_BY_TOPIC_SYSTEM = `${TECHNICAL_SEO_STRATEGIST_ROLE}

For a **topic section** of GSC URL clusters, plan one definitive **new article** per cluster (not merging existing WordPress posts).

Output rules (apply to EVERY brief in the briefs array):
- recommendedTitle: under 60 characters, compelling new post headline.
${BULK_WORDPRESS_POST_TITLE_RULE}
- recommendedPrimaryKeyword: 2-5 word short-tail focus phrase; preserve any 4-digit year (19xx/20xx) from tagLabel, slug, or member titles when present (e.g. "2026 federal budget changes").
- **Year in keyword → year in title (mandatory)**: If recommendedPrimaryKeyword contains a 4-digit year, recommendedTitle MUST include that **exact same year** (same digits). Never omit the year. Never substitute vague framing like "historical overview", "current rules", or "latest update" instead of the year. Forbidden example: keyword "2026 federal budget changes" → title "Federal Budget Changes: A Historical Overview".
- recommendedMeta: 120-160 characters; no double quotes inside the value. If the keyword includes a year, include that year in recommendedMeta.
- combinedOutline: complete H2 headings for the new article.
- whatToKeepFromEach: every member URL in that cluster; bullets are search intents or angles.
- redirectOrCanonicalNote: brief note on how source URLs relate to the new post (internal linking).
- lockedDestinationUrl: REQUIRED full https canonical URL on the same origin as that cluster's members. Use the section topicTag for the slug phrase. **Keep the permalink folder from a member URL in that cluster** (if they use /YYYY/MM/DD/, keep that date path). Only shorten the final slug (3-5 words, max ~48 chars). Never remove date folders.
- priority and confidence: high|medium|low.
- rationale: 2-3 sentences on intent overlap, cannibalization fix, and GSC opportunity.
- For tax/budget/guide clusters (topicTag not "company") with **no** year in the keyword, you may use the current calendar year when the topic is an annual budget or tax-year guide.
- For company/firm news (topicTag "company"), keep historical years from the keyword in recommendedTitle when they reflect the announcement date.
- clusterId in each brief MUST match a clusterId from the user payload exactly.
- You MUST return exactly requiredBriefCount brief objects (one per cluster). Do not omit clusters.
Return ONLY valid JSON: { "briefs": [ { clusterId, recommendedTitle, recommendedPrimaryKeyword, recommendedMeta, lockedDestinationUrl, combinedOutline, whatToKeepFromEach, redirectOrCanonicalNote, priority, confidence, rationale } ] }${GRID_BRIEF_TECHNICAL_APPEND}`;

const GRID_BLOG_BRIEF_ONE_TO_ONE_APPEND = `

Redirect-map mode: one content plan per cluster. Each cluster may include many member URLs (old_url sources) sharing the same lockedDestinationUrl (canonical new_url).
Use canonicalDestinationUrl from the payload when present. Roll forward 19xx/20xx year tokens in the slug to the current content year (e.g. canada-2023-budget → canada-2026-budget) while preserving /blog/ path structure.
**Anti-cannibalization:** Do not plan separate competing articles for the same searcher intent. When memberCount > 1 or mergedTopicGroup is true, output ONE definitive guide: combine angles as H2 sections in combinedOutline (not separate pillar + spin-off titles). Keyword order/year wording differences alone are NOT separate articles (e.g. "alberta tax brackets 2026" vs "2026 canadian alberta tax brackets" = one post).
When tagLabel or permalinkSamples include a year, carry that year into recommendedPrimaryKeyword and recommendedTitle.`;

export function applyKeywordYearTitleRules(
  brief: SitemapOptimizerMergeRecommendation,
): SitemapOptimizerMergeRecommendation {
  const keyword = brief.recommendedPrimaryKeyword.trim();
  const title = ensureKeywordYearsInTitle(keyword, brief.recommendedTitle);
  const meta = ensureKeywordYearsInTitle(keyword, brief.recommendedMeta);
  return {
    ...brief,
    recommendedTitle: title,
    recommendedMeta: meta.length <= 160 ? meta : `${meta.slice(0, 157).trim()}...`,
  };
}

export function briefSystemPrompt(fixedDestinations: boolean): string {
  return fixedDestinations
    ? GRID_BLOG_BRIEF_BY_TOPIC_SYSTEM + GRID_BLOG_BRIEF_ONE_TO_ONE_APPEND
    : GRID_BLOG_BRIEF_BY_TOPIC_SYSTEM;
}
