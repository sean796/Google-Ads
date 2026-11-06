/**
 * SEO_techspec: single script for SEM "Fix it" flow.
 * Tech-spec prompt → OpenRouter → parse/merge → WordPress update. Pure logic only (no React, toast, setState).
 */

import { loadApiKey, streamChatCompletion } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { updateWordPressPost } from "@/lib/wordpress-api/crud";
import { updateACFFields } from "@/lib/wordpress-acf-origin";
import type { WordPressSite } from "@/components/integrations/types";
import type { WpExistingPostLike } from "@/hooks/content-optimization/use-optimization-state";

const CONTENT_PROMPT_MAX_CHARS = 12000;

function stripHtmlForPrompt(html: string): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > CONTENT_PROMPT_MAX_CHARS ? text.slice(0, CONTENT_PROMPT_MAX_CHARS) + "…" : text;
}

function subtypeToEndpoint(subtype?: string): string | undefined {
  const map: Record<string, string> = {
    post: "posts",
    page: "pages",
    "service-area": "service-areas",
  };
  return subtype ? map[subtype] : undefined;
}

export interface RunSEO_techspecParams {
  site: WordPressSite;
  resolved: { id: number; subtype?: string; endpoint?: string; slug?: string };
  existingPost: WpExistingPostLike;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  checklist: string[];
  suggestedAction?: string;
  acfFields: Record<string, unknown>;
}

export interface SEO_techspecChanges {
  titleChanged: boolean;
  metaChanged: boolean;
  contentChanged: boolean;
  title?: string;
  meta?: string;
}

export type SEO_techspecResult =
  | {
      success: true;
      postUpdated: true;
      promptSent: { system: string; user: string };
      changes: SEO_techspecChanges;
    }
  | { success: false; error: string };

/**
 * Apply checklist to post via OpenRouter, then update WordPress. Returns result for UI (postUpdated, promptSent, changes) or error.
 */
export async function runSEO_techspec(params: RunSEO_techspecParams): Promise<SEO_techspecResult> {
  const {
    site,
    resolved,
    existingPost,
    existingTitle,
    existingContent,
    existingExcerpt,
    checklist,
    suggestedAction = "",
    acfFields,
  } = params;

  // Cache original post (download) so we can diff and remember what changed after edit/upload
  const originalTitle = existingTitle;
  const originalExcerpt = existingExcerpt;
  const originalContent = existingContent;

  const checklistText = checklist.length > 0 ? checklist.map((c, i) => `${i + 1}. ${c}`).join("\n") : "No specific items.";
  const contentForPrompt = stripHtmlForPrompt(existingContent);

  // Lead tech SEO: checklist = task list. Apply every item. Return full title, excerpt, content so we overwrite the post.
  const systemPrompt = `You are a lead tech SEO. The checklist is the task list: you MUST apply every item and change the post. Return ONLY a JSON object with exactly three keys: "title", "excerpt", "content". Provide the full new value for each (full replacement). For "content", return full HTML. No other text, no markdown.`;
  const userPrompt = `${suggestedAction ? `Action: ${suggestedAction}\n\n` : ""}Checklist (apply every item):\n${checklistText}\n\nCurrent post:\nTitle: ${existingTitle}\nExcerpt: ${existingExcerpt}\nContent (plain text, truncated): ${contentForPrompt}\n\nReturn a single JSON object with "title", "excerpt", "content" containing the full new values after applying the checklist. Always include all three keys.`;

  try {
    const apiKey = loadApiKey();
    if (!apiKey?.trim()) {
      return { success: false, error: "OpenRouter API key not found. Please set it in settings." };
    }

    const model = getResearchModel(site.id);
    const { content: fullResponse } = await streamChatCompletion({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 10000,
      topP: 0.9,
      onContentChunk: () => {},
    });

    let parsed: { title?: string; excerpt?: string; content?: string } = {};
    try {
      const jsonMatch = fullResponse.trim().match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return { success: false, error: "AI did not return valid JSON. No changes applied." };
    }

    // Always overwrite with AI output; fallback to existing only if AI omitted a field (so we don't blank the post)
    const finalTitle = parsed.title != null && String(parsed.title).trim() !== "" ? String(parsed.title).trim() : existingTitle;
    const finalExcerpt = parsed.excerpt != null ? String(parsed.excerpt).trim() : existingExcerpt;
    const finalContent = parsed.content != null && String(parsed.content).trim() !== "" ? String(parsed.content) : existingContent;

    const postTypeEndpoint = (resolved as { endpoint?: string }).endpoint || subtypeToEndpoint(resolved.subtype) || "posts";
    const status = (existingPost.status === "draft" ? "draft" : "publish") as "draft" | "publish";
    const slug = existingPost.slug ?? undefined;

    await updateWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      resolved.id,
      finalTitle,
      finalContent,
      finalExcerpt,
      status,
      resolved.subtype || "post",
      undefined,
      undefined,
      undefined,
      slug,
      postTypeEndpoint
    );

    // Update ACF: meta description (if present) and always overwrite date modifier with update date (bulk run)
    const todayDate = new Date().toISOString().split("T")[0];
    const acfUpdates: Record<string, string> = {
      date_modifier: todayDate,
      seo_date_modifier: todayDate,
    };
    if (finalExcerpt && (acfFields?.meta_description != null || acfFields?.seo_meta_description != null)) {
      const metaFieldName = acfFields.seo_meta_description != null ? "seo_meta_description" : "meta_description";
      acfUpdates[metaFieldName] = finalExcerpt;
    }
    if (Object.keys(acfUpdates).length > 0) {
      try {
        await updateACFFields(
          site.siteUrl,
          site.username,
          site.appPassword,
          resolved.id,
          acfUpdates,
          resolved.subtype || "post",
          postTypeEndpoint
        );
      } catch (acfErr) {
        console.warn("[SEO_techspec] ACF update failed:", acfErr);
      }
    }

    // Remember what we changed: diff cached original vs final (so UI shows correct "changes detected")
    const titleChanged = finalTitle !== originalTitle;
    const metaChanged = finalExcerpt !== originalExcerpt;
    const contentChanged = finalContent !== originalContent;
    const changes: SEO_techspecChanges = {
      titleChanged,
      metaChanged,
      contentChanged,
      title: titleChanged ? finalTitle : undefined,
      meta: metaChanged ? finalExcerpt : undefined,
    };

    return {
      success: true,
      postUpdated: true,
      promptSent: { system: systemPrompt, user: userPrompt },
      changes,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "SEM fix failed.";
    console.error("[SEO_techspec]", err);
    return { success: false, error };
  }
}
