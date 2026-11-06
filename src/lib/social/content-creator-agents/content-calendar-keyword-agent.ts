import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  buildContentCreatorContextBlock,
  callContentCreatorJsonCompletion,
  requireAgentString,
} from "@/lib/social/content-creator-prompt-builder";
import { cellString } from "@/lib/social/content-creator-types";

export async function runContentCalendarKeywordAgent(options: {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName?: string;
  siteUrl?: string;
  landingPageUrl?: string;
  seedKeyword?: string;
  pageContext?: string;
  signal?: AbortSignal;
}): Promise<{ keyword: string }> {
  const seedKeyword = cellString(options.seedKeyword);
  if (seedKeyword.length > 0) {
    return { keyword: seedKeyword };
  }
  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }
  await ensureMasterInstructionsInMemory(options.siteId ?? null);

  const system = appendMasterInstructionsToSystemPrompt(
    `You are an SEO content strategist. Return JSON: { "keyword": string } with one focus keyword phrase for a social content calendar post.`,
    options.siteId ?? null,
  );

  const user = buildContentCreatorContextBlock({
    siteName: options.siteName,
    siteUrl: options.siteUrl,
    landingPageUrl: options.landingPageUrl,
    pageContext: options.pageContext,
  });

  const raw = await callContentCreatorJsonCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system,
    user,
    maxTokens: Math.min(512, getCompetitorReportMaxOutputTokens(options.model)),
    temperature: 0.4,
    errorLabel: "Content keyword agent",
    signal: options.signal,
  });

  return {
    keyword: requireAgentString(
      (raw as { keyword?: unknown }).keyword,
      "keyword",
      "Content keyword agent",
    ),
  };
}
