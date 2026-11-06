import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  buildContentCreatorContextBlock,
  callContentCreatorJsonCompletion,
} from "@/lib/social/content-creator-prompt-builder";
import { appendContentCreatorSocialBestPractices } from "@/lib/social/load-content-creator-social-best-practices";
import {
  buildContentCreatorSocialBriefSystemPrompt,
  buildContentCreatorSocialBriefUserPayload,
  parseContentCreatorSocialBrief,
  type ContentCreatorSocialBrief,
} from "@/lib/social/content-creator-social-brief";
import { cellString } from "@/lib/social/content-creator-types";

export async function runContentCalendarSocialBriefAgent(options: {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName?: string;
  siteUrl?: string;
  keyword: string;
  landingPageUrl?: string;
  events?: string;
  pageContext?: string;
  signal?: AbortSignal;
}): Promise<ContentCreatorSocialBrief> {
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
    appendContentCreatorSocialBestPractices(
      buildContentCreatorSocialBriefSystemPrompt(options.siteName),
    ),
    options.siteId ?? null,
  );

  const user = `${buildContentCreatorSocialBriefUserPayload({
    siteName: options.siteName,
    siteUrl: options.siteUrl,
    keyword: options.keyword,
    landingPageUrl: options.landingPageUrl,
    events: rowEvents.length > 0 ? rowEvents : undefined,
    pageContext: options.pageContext,
  })}\n\n${contextBlock}`;

  const raw = await callContentCreatorJsonCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system,
    user,
    maxTokens: Math.min(768, getCompetitorReportMaxOutputTokens(options.model)),
    temperature: 0.4,
    errorLabel: "Content social brief agent",
    signal: options.signal,
  });

  return parseContentCreatorSocialBrief(raw);
}
