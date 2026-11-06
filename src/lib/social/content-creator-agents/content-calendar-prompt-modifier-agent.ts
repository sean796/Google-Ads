import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  buildContentCreatorContextBlock,
  callContentCreatorJsonCompletion,
  requireAgentString,
} from "@/lib/social/content-creator-prompt-builder";
import { cellString } from "@/lib/social/content-creator-types";

export async function runContentCalendarPromptModifierAgent(options: {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName?: string;
  siteUrl?: string;
  keyword: string;
  fbInstagramContent?: string;
  linkedinContent?: string;
  landingPageUrl?: string;
  signal?: AbortSignal;
}): Promise<{ promptModifier: string }> {
  if (typeof options.apiKey !== "string" || options.apiKey.length === 0) {
    throw new Error("OpenRouter API key is missing. Set it in Settings first.");
  }
  await ensureMasterInstructionsInMemory(options.siteId ?? null);

  const system = appendMasterInstructionsToSystemPrompt(
    `You write a short image prompt modifier for social creative. Return JSON: { "promptModifier": string }. One or two sentences describing visual direction. No image generation.`,
    options.siteId ?? null,
  );

  const fbCopy = cellString(options.fbInstagramContent);
  const liCopy = cellString(options.linkedinContent);

  const user = [
    buildContentCreatorContextBlock({
      siteName: options.siteName,
      siteUrl: options.siteUrl,
      keyword: options.keyword,
      landingPageUrl: options.landingPageUrl,
    }),
    fbCopy.length > 0 ? `FB/Instagram angle: ${fbCopy}` : "",
    liCopy.length > 0 ? `LinkedIn angle: ${liCopy}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const raw = await callContentCreatorJsonCompletion({
    apiKey: options.apiKey,
    model: options.model,
    system,
    user,
    maxTokens: Math.min(512, getCompetitorReportMaxOutputTokens(options.model)),
    temperature: 0.5,
    errorLabel: "Content prompt modifier agent",
    signal: options.signal,
  });

  return {
    promptModifier: requireAgentString(
      (raw as { promptModifier?: unknown }).promptModifier,
      "promptModifier",
      "Content prompt modifier agent",
    ),
  };
}
