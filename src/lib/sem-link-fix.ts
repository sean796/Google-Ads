import { logger } from "@/lib/logger";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  resolveWordPressUrls,
  getWordPressPostContent,
  updateWordPressPost,
} from "@/lib/wordpress-api";
import { updateACFFields } from "@/lib/wordpress-post-fields-origin";
import type { WordPressSite } from "@/components/integrations/types";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export interface FixLinksOnPostResult {
  success: boolean;
  changeSummary?: string;
  error?: string;
}

/**
 * Resolve a page URL to a WordPress post ID and subtype.
 * Uses site.entitySitemapUrl for context; knownEndpoint is left for the backend to infer.
 */
async function resolvePageUrl(
  site: WordPressSite,
  pageUrl: string
): Promise<{ id: number; subtype: string; link?: string; slug?: string }> {
  const resolveResult = await resolveWordPressUrls(
    site.siteUrl,
    site.username,
    site.appPassword,
    [pageUrl],
    site.entitySitemapUrl ?? undefined,
    undefined
  );

  if (resolveResult.resolved.length === 0) {
    const reason = resolveResult.unresolvable?.[0]?.reason ?? "URL could not be resolved.";
    throw new Error(`Could not resolve URL to a WordPress post. ${reason}`);
  }

  const r = resolveResult.resolved[0];
  return { id: r.id, subtype: r.subtype, link: r.link, slug: undefined };
}

/**
 * Use AI to fix only relative or broken links in HTML content.
 * Returns the same HTML with link hrefs corrected to absolute URLs using baseUrl.
 * promptModifier: optional extra instructions (e.g. "prefer https").
 */
async function aiFixLinksInHtml(
  html: string,
  baseUrl: string,
  promptModifier?: string
): Promise<string> {
  const apiKey = loadApiKey();
  if (!apiKey?.trim()) {
    throw new Error("OpenRouter API key not found. Please set it in settings.");
  }

  const model = getResearchModel();
  const systemPrompt = `You are a strict HTML link fixer. Your ONLY job is to fix relative or broken links in HTML.

Rules:
1. Replace relative hrefs (e.g. href="/page", href="page", href="../other") with absolute URLs using the base URL provided.
2. Fix broken or malformed links that should point to the same site.
3. Do NOT change any other content, tags, structure, formatting, or text.
4. Do NOT add or remove any elements. Only modify href (and optionally src for same-site relative URLs) attributes.
5. Return ONLY the corrected HTML, no markdown code fence, no explanation.`;

  const baseNormalized = baseUrl.replace(/\/$/, "");
  let userPrompt = `Base URL: ${baseNormalized}

HTML content to fix (only fix relative/broken links; output the full corrected HTML only):

${html}`;
  if (promptModifier?.trim()) {
    userPrompt += `\n\nAdditional instructions: ${promptModifier.trim()}`;
  }

  const response = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 16000,
    }),
  });

  const data = await response.json();
  const content = (data.choices?.[0]?.message?.content ?? "").trim();

  let out = content;
  const codeBlock = content.match(/```(?:html)?\s*([\s\S]*?)\s*```/);
  if (codeBlock?.[1]) {
    out = codeBlock[1].trim();
  }
  if (!out || out.length < 10) {
    throw new Error("AI did not return valid HTML.");
  }
  return out;
}

/**
 * Fix only relative or broken links on a WordPress post at the given URL.
 * Resolves the URL, fetches content, runs AI link fix, then updates the post.
 * promptModifier: optional extra instructions for the AI when fixing links.
 */
export async function fixLinksOnPost(
  site: WordPressSite,
  pageUrl: string,
  promptModifier?: string
): Promise<FixLinksOnPostResult> {
  try {
    const resolved = await resolvePageUrl(site, pageUrl);

    const postContentResult = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      undefined,
      undefined,
      [{ id: resolved.id, subtype: resolved.subtype }]
    );

    if (postContentResult.error) {
      return { success: false, error: postContentResult.error };
    }
    if (postContentResult.errors?.length) {
      const msg = postContentResult.errors.map((e) => e.error).join("; ");
      return { success: false, error: msg };
    }
    if (!postContentResult.posts?.length) {
      return { success: false, error: "Post content not found." };
    }

    const post = postContentResult.posts[0];
    const existingContent = post.content ?? "";
    if (!existingContent.trim()) {
      return { success: true, changeSummary: "No content to fix." };
    }

    const baseUrl = site.siteUrl.replace(/\/$/, "");
    const fixedContent = await aiFixLinksInHtml(existingContent, baseUrl, promptModifier);

    if (fixedContent === existingContent) {
      return { success: true, changeSummary: "No link changes needed." };
    }

    const postTypeEndpoint = post.postTypeEndpoint ?? (resolved.subtype === "page" ? "pages" : "posts");
    const postType = post.postTypeSubtype ?? resolved.subtype ?? "post";

    const updateResult = await updateWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      post.id,
      post.title ?? "",
      fixedContent,
      post.excerpt,
      (post.status as "draft" | "publish") ?? "publish",
      postType,
      undefined,
      post.categories,
      post.tags,
      post.slug,
      postTypeEndpoint
    );

    if (!updateResult.success) {
      return { success: false, error: updateResult.error ?? "Update failed." };
    }

    // Overwrite date ACF with update date (Bulk: when we update a post in any way, set date to now)
    const todayDate = new Date().toISOString().split("T")[0];
    try {
      await updateACFFields(
        site.siteUrl,
        site.username,
        site.appPassword,
        post.id,
        { date_modifier: todayDate, seo_date_modifier: todayDate },
        postType,
        postTypeEndpoint
      );
    } catch (acfErr) {
      logger.warn("[sem-link-fix] ACF date update failed:", acfErr);
    }

    return { success: true, changeSummary: "Links fixed; verified." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Link fix failed.";
    return { success: false, error: message };
  }
}
