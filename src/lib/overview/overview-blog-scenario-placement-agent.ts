import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import { htmlBodyToMarkdownH2Projection } from "@/lib/in-content-image-generator";
import { parseMarkdownSections } from "@/lib/section-parser";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { isBadIllustrativeH2Title } from "@/lib/content-optimization/illustrative-h2";
import { isFaqHeadingTitle } from "@/lib/overview/overview-blog-faq-append";

const placementSchema = z.object({
  afterSectionHeader: z.string(),
  illustrativeH2Title: z.string(),
});

export type ScenarioPlacementPlan = z.infer<typeof placementSchema>;

const RESERVED_H2 = new Set(["answer", "overview"]);

function isReservedH2(title: string): boolean {
  const key = title.trim().toLowerCase();
  return RESERVED_H2.has(key) || isFaqHeadingTitle(title);
}

function pickFallbackBodyH2(headers: string[]): string {
  for (const header of headers) {
    const h = header.trim();
    if (!h || isReservedH2(h)) continue;
    return h;
  }
  return headers.find((h) => h.trim())?.trim() ?? "";
}

export function matchHeaderFromList(headers: string[], candidate: string): string {
  const target = candidate.trim().toLowerCase();
  if (!target) return "";
  const exact = headers.find((h) => h.trim().toLowerCase() === target);
  if (exact) return exact.trim();
  const fuzzy = headers.find((h) => {
    const sectionLower = h.trim().toLowerCase();
    return sectionLower.includes(target) || target.includes(sectionLower);
  });
  return fuzzy?.trim() ?? "";
}

/**
 * OpenRouter: pick which existing H2 section the illustrative scenario should follow,
 * and the unique topical H2 title for the new scenario block.
 */
export async function analyzeScenarioInsertionPlan(args: {
  html: string;
  focusKeyword: string;
  pageTitle: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<ScenarioPlacementPlan> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) throw new Error("OpenRouter API key is required for scenario placement");

  const markdown = htmlBodyToMarkdownH2Projection(args.html);
  const sections = parseMarkdownSections(markdown).filter((s) => s.headerLevel === 2);
  const bodySections = sections.filter((s) => !isReservedH2(s.header));
  if (!bodySections.length) {
    throw new Error("No body H2 sections found for scenario placement");
  }

  const headers = bodySections.map((s) => s.header.trim()).filter(Boolean);
  const sectionsSummary = bodySections
    .map((section, index) => {
      const preview = section.content.substring(0, 400).replace(/\n/g, " ").trim();
      return `${index + 1}. "${section.header}"\n   Preview: ${preview}${preview.length >= 400 ? "…" : ""}`;
    })
    .join("\n\n");

  const systemPrompt = `You are an expert SEO content editor placing one [ILLUSTRATIVE] scenario section on an existing article.

Return JSON only: { "afterSectionHeader": string, "illustrativeH2Title": string }.

afterSectionHeader: exact H2 title from the list below. The new scenario section will be inserted immediately AFTER this section's content (before the next H2). Pick the section where a genderless named persona example best supports the reader's decision on "${args.focusKeyword.trim() || args.pageTitle.trim()}". Prefer a mid-article topical section, not Answer or Overview. Never pick FAQ.

illustrativeH2Title: topical title for the NEW scenario section (3-8 words). Short decision-focused title tied to the article topic. Do NOT include "Scenario:" in this field — the app adds that prefix. Topical only (e.g. "Import tariff cost pressure"). Forbidden: persona names or possessives (Alex, Liam, Alex's, Liam's); questions; "A realistic local situation"; "Local homeowner example"; Section N labels; place-name slugs; duplicate titles from the list below. Persona names belong only in blockquote prose, never in the H2.`;

  const userPrompt = `Page title: ${args.pageTitle.trim() || args.focusKeyword.trim()}
Keyword: ${args.focusKeyword.trim()}

Existing H2 sections:
${sectionsSummary}

Choose afterSectionHeader and illustrativeH2Title.`;

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: args.model?.trim() || getResearchModel(),
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 2048,
    temperature: 0.4,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });

  const parsed = placementSchema.parse(parseAssistantJsonObject(content));
  const afterSectionHeader =
    matchHeaderFromList(headers, parsed.afterSectionHeader) || pickFallbackBodyH2(headers);
  let illustrativeH2Title = parsed.illustrativeH2Title.trim();
  if (!illustrativeH2Title || isBadIllustrativeH2Title(illustrativeH2Title)) {
    illustrativeH2Title = `${args.focusKeyword.trim() || "Local"} decision example`;
  }

  return { afterSectionHeader, illustrativeH2Title };
}
