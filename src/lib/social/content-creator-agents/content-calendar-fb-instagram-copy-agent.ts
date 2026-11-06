import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  META_INSTAGRAM_CAPTION_RULES,
  META_VALUE_PROPOSITION_RULES,
} from "@/lib/ppc/meta-ad-prompt-builder";
import {
  buildContentCreatorBriefBlock,
  buildContentCreatorContextBlock,
  callContentCreatorJsonCompletion,
  CONTENT_CREATOR_EVENTS_RULE,
  CONTENT_CREATOR_PLATFORM_LIMITS_PROMPT,
  requireAgentString,
} from "@/lib/social/content-creator-prompt-builder";
import { appendContentCreatorSocialBestPractices } from "@/lib/social/load-content-creator-social-best-practices";
import type { ContentCreatorSocialBrief } from "@/lib/social/content-creator-social-brief";
import {
  clampInstagramCaption,
  CONTENT_CREATOR_IG_MAX_CHARS,
} from "@/lib/social/content-creator-social-copy-limits";
import { cellString } from "@/lib/social/content-creator-types";

function buildFbInstagramCopySystemPrompt(): string {
  return appendContentCreatorSocialBestPractices(`You write short Instagram/Facebook feed captions for a content calendar.
Return JSON: { "fbInstagramContent": string }.

Expand the brief captionHook only. Do not write landing-page prose or multi-paragraph essays.
Structure: hook line, optional one short support line, CTA line, hashtags on last line (from brief).
Hard max ${CONTENT_CREATOR_IG_MAX_CHARS} characters total including hashtags and line breaks.
${CONTENT_CREATOR_PLATFORM_LIMITS_PROMPT}
${META_VALUE_PROPOSITION_RULES}
${META_INSTAGRAM_CAPTION_RULES}
${CONTENT_CREATOR_EVENTS_RULE}
No emoji chains. No bullet lists. No long URLs in the caption body.`);
}

export async function runContentCalendarFbInstagramCopyAgent(options: {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName?: string;
  siteUrl?: string;
  keyword: string;
  socialBrief: ContentCreatorSocialBrief;
  landingPageUrl?: string;
  events?: string;
  pageContext?: string;
  checklistFeedback?: string;
  signal?: AbortSignal;
}): Promise<{ fbInstagramContent: string }> {
  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }
  await ensureMasterInstructionsInMemory(options.siteId ?? null);

  const rowEvents = cellString(options.events);
  const contextBlock = buildContentCreatorContextBlock({
    siteName: options.siteName,
    siteUrl: options.siteUrl,
    keyword: options.keyword,
    landingPageUrl: options.landingPageUrl,
    events: rowEvents.length > 0 ? rowEvents : undefined,
    pageContext: options.pageContext,
  });

  const system = appendMasterInstructionsToSystemPrompt(
    buildFbInstagramCopySystemPrompt(),
    options.siteId ?? null,
  );

  const feedback = cellString(options.checklistFeedback);
  const user = [
    buildContentCreatorBriefBlock(options.socialBrief),
    contextBlock,
    feedback.length > 0 ? `Checklist feedback (fix these issues):\n${feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await callContentCreatorJsonCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system,
    user,
    maxTokens: Math.min(512, getCompetitorReportMaxOutputTokens(options.model)),
    temperature: 0.45,
    errorLabel: "Content FB/Instagram copy agent",
    signal: options.signal,
  });

  const fbInstagramContent = clampInstagramCaption(
    requireAgentString(
      (raw as { fbInstagramContent?: unknown }).fbInstagramContent,
      "fbInstagramContent",
      "Content FB/Instagram copy agent",
    ),
    options.socialBrief.hashtags,
  );
  return { fbInstagramContent };
}
