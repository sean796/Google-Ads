import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { META_VALUE_PROPOSITION_RULES } from "@/lib/ppc/meta-ad-prompt-builder";
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
  clampLinkedinCaption,
  CONTENT_CREATOR_LINKEDIN_MAX_CHARS,
} from "@/lib/social/content-creator-social-copy-limits";
import { cellString } from "@/lib/social/content-creator-types";

function buildLinkedinCopySystemPrompt(): string {
  return appendContentCreatorSocialBestPractices(`You write LinkedIn feed posts for a content calendar.
Return JSON: { "linkedinContent": string }.

Expand the social strategy brief into 2 to 3 short professional paragraphs.
Hard max ${CONTENT_CREATOR_LINKEDIN_MAX_CHARS} characters including optional hashtags.
${CONTENT_CREATOR_PLATFORM_LIMITS_PROMPT}
${META_VALUE_PROPOSITION_RULES}
${CONTENT_CREATOR_EVENTS_RULE}
Professional tone. No emoji chains. No hashtag dumps. One clear CTA.`);
}

export async function runContentCalendarLinkedinCopyAgent(options: {
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
  signal?: AbortSignal;
}): Promise<{ linkedinContent: string }> {
  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }
  await ensureMasterInstructionsInMemory(options.siteId ?? null);

  const rowEvents = cellString(options.events);
  const user = [
    buildContentCreatorBriefBlock(options.socialBrief),
    buildContentCreatorContextBlock({
      siteName: options.siteName,
      siteUrl: options.siteUrl,
    keyword: options.keyword,
    landingPageUrl: options.landingPageUrl,
      events: rowEvents.length > 0 ? rowEvents : undefined,
      pageContext: options.pageContext,
    }),
  ].join("\n\n");

  const system = appendMasterInstructionsToSystemPrompt(
    buildLinkedinCopySystemPrompt(),
    options.siteId ?? null,
  );

  const raw = await callContentCreatorJsonCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system,
    user,
    maxTokens: Math.min(768, getCompetitorReportMaxOutputTokens(options.model)),
    temperature: 0.5,
    errorLabel: "Content LinkedIn copy agent",
    signal: options.signal,
  });

  const linkedinContent = clampLinkedinCaption(
    requireAgentString(
      (raw as { linkedinContent?: unknown }).linkedinContent,
      "linkedinContent",
      "Content LinkedIn copy agent",
    ),
    options.socialBrief.hashtags,
  );
  return { linkedinContent };
}
