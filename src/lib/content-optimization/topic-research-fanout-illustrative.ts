import type { WordPressSite } from "@/components/integrations/types";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/model-json";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { IllustrativeExample, QueryFanoutSerpRow } from "@/lib/overview-seo-content-brief";
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
  type PageLocalContext,
} from "@/lib/content-optimization/page-local-context";
import { formatAnswerTopicContractForIllustrativeExtract } from "@/lib/content-optimization/defensible-specificity-prompt";
import {
  buildIllustrativeExampleResearchQuery,
  formatResearchAsOfLabel,
} from "@/lib/content-optimization/topic-research-fanout-queries";
import { topicResearchFanoutMaxTokens } from "@/lib/content-optimization/topic-research-fanout-shared";

const ILLUSTRATIVE_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "leadIn",
    "personaName",
    "householdProfile",
    "situationHook",
    "scenarioQuestion",
    "scenarioNarrative",
    "recommendationTitle",
    "recommendationParagraph",
  ],
  properties: {
    leadIn: { type: "string" },
    personaName: { type: "string" },
    householdProfile: { type: "string" },
    situationHook: { type: "string" },
    scenarioQuestion: { type: "string" },
    scenarioNarrative: { type: "string" },
    recommendationTitle: { type: "string" },
    recommendationParagraph: { type: "string" },
  },
} as const;

export const ILLUSTRATIVE_PERSONA_EXTRACT_TEMPERATURE = 0.85;

export const ILLUSTRATIVE_EXTRACT_SYSTEM = `Create one persona for this blog article [ILLUSTRATIVE] section: ONE named person facing ONE real decision that this article's Keyword, Service topic, and Answer (when provided) already discuss.

Return JSON only: { leadIn, personaName, householdProfile, situationHook, scenarioQuestion, scenarioNarrative, recommendationTitle, recommendationParagraph }.

Topic contract (non-negotiable): the persona's decision MUST be the same topic as Keyword + Service topic + Page title + ARTICLE ANSWER + CONNECTED SITE IDENTITY when present. The connected site is the seller. Match that site's buyer for this keyword. If the site sells SEO, web, or ads and the keyword names another industry, the persona is a business buyer of that marketing service, not a shopper of the industry product. Forbidden: inventing a different industry, product line, or room problem than those sources. Forbidden: product-trend or homeowner-shopping copy when this site does not sell that product.

leadIn: always "Hypothetical scenario:" (writer ignores this).

personaName: invent a fresh first name for this page only (AI-generated — no fixed lists). Only person in the example.

householdProfile: one-line persona situation that matches this article's buyer (not a default household when the article is B2B or strategy).

situationHook: 1-2 sentences that INTRODUCE the general decision context for any reader facing this topic (from Keyword + Answer). Third-person, industry-level setup only. Describe the tension in plain language so someone understands why this decision is hard BEFORE meeting the persona. Forbidden: personaName or any proper name; "Hypothetical scenario:"; copying scenarioNarrative; posing scenarioQuestion verbatim; opening with "Arthur is…" or any named owner.

scenarioQuestion: one decision question for the blockquote only (never in the intro p, never as H2 or H3, never prefixed with "Scenario:"). Use the site profile city from PRIMARY LOCAL CONTEXT when the example is local. Do not invent a city. Brand and product names (Hunter Douglas, Alta, Duette) are products, never towns. Forbidden: a question about a topic the Answer does not cover.

scenarioNarrative: 2-3 tight sentences for the blockquote. personaName weighs ONE choice from this article and why they are stuck. Weave scenarioQuestion here as a natural sentence when provided. Anchor place names to primary service city when local. Forbidden: repeating situationHook wording or restating the same intro setup.

recommendationTitle: the specific option the connected Company would recommend (strategy, service, product, or tier named in Keyword/Answer).

recommendationParagraph: 2 sentences max. SITE-FIRST: sentence one MUST open with the connected Company name as the grammatical subject ("{Company} would recommend…" or "{Company} recommends…"), then a balanced why that pick can fit this persona's decision. Use may / can / when / depending on plus variance drivers (budget, window orientation, schedule, glazing, daily routines). Forbidden: guaranteed energy savings, significant long-term savings, pays for itself, or opening with personaName ("{persona} should…"), "they should", or "a business should".

Forbidden recommendation phrases without qualification: "significant long-term energy savings", "will reduce energy bills", "guaranteed savings".

GOOD recommendationParagraph: "{Company} would recommend {the pick} when {named constraint} matters most, because {one mechanism from sources}."
BAD: inventing a city when the site profile has none.
BAD: treating a product name as a town.
BAD: citing another city for local examples when primary city is set.
BAD: a persona deciding something Keyword, Service topic, and Answer never mention.
BAD recommendationParagraph: "{personaName} should implement…"

Forbidden: Homeowner A/B, two personas, product-catalog tours, keyword slug phrasing, treating service topic tokens as geography, other-city cost bands when primary city is set, new dollar amounts when sources lack them.

Keep every field to 1-2 short sentences. Finish the entire JSON object in one reply. Never leave a string unclosed.`;

export function normalizeIllustrativeExample(
  raw: unknown,
  asOf: string,
  illustrativeH2Title?: string,
): IllustrativeExample | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const leadIn = String(rec.leadIn ?? "").trim();
  const personaName = String(rec.personaName ?? "").trim();
  const householdProfile = String(rec.householdProfile ?? "").trim();
  const situationHook = String(rec.situationHook ?? "").trim();
  const scenarioQuestion = String(rec.scenarioQuestion ?? "").trim();
  const scenarioNarrative = String(rec.scenarioNarrative ?? "").trim();
  const recommendationTitle = String(rec.recommendationTitle ?? "").trim();
  const recommendationParagraph = String(rec.recommendationParagraph ?? "").trim();
  let quoteBody = String(rec.quoteBody ?? "").trim();
  if (!quoteBody && scenarioNarrative) {
    quoteBody = [scenarioQuestion, scenarioNarrative, recommendationTitle, recommendationParagraph]
      .filter(Boolean)
      .join("\n\n");
  }
  const usedLeadIn = leadIn || "Hypothetical scenario:";
  const usedQuote =
    quoteBody
    || [scenarioQuestion, scenarioNarrative, recommendationTitle, recommendationParagraph, personaName, householdProfile, situationHook]
      .filter(Boolean)
      .join("\n\n");
  if (!usedQuote) return undefined;
  const out: IllustrativeExample = { leadIn: usedLeadIn, quoteBody: usedQuote, asOf };
  const h2 = illustrativeH2Title?.trim();
  if (h2) out.illustrativeH2Title = h2;
  out.personaName = personaName;
  if (householdProfile) out.householdProfile = householdProfile;
  if (situationHook) out.situationHook = situationHook;
  if (scenarioQuestion) out.scenarioQuestion = scenarioQuestion;
  out.scenarioNarrative = scenarioNarrative;
  if (recommendationTitle) out.recommendationTitle = recommendationTitle;
  out.recommendationParagraph = recommendationParagraph;
  return out;
}

function serpContextForIllustrativeQuery(
  serpByQuery: QueryFanoutSerpRow[] | undefined,
  illustrativeExampleQuery: string,
): string {
  const q = illustrativeExampleQuery.trim().toLowerCase();
  const row = serpByQuery?.find((r) => r.query.trim().toLowerCase() === q);
  if (!row) return "";
  const lines: string[] = [`Query: ${row.query}`];
  for (const o of row.organicTop ?? []) {
    const parts = [o.title, o.description].filter(Boolean);
    if (parts.length) lines.push(parts.join(" — "));
  }
  for (const title of row.organicTitles ?? []) {
    if (title.trim()) lines.push(title.trim());
  }
  return lines.join("\n").trim();
}

export async function extractIllustrativeExample(input: {
  keyword: string;
  location: string;
  researchAsOf: string;
  companyName: string;
  illustrativeExampleQuery?: string;
  pageUrl?: string;
  entity?: string;
  serpByQuery?: QueryFanoutSerpRow[];
  chatGptByQuery?: Array<{ query: string; responseText: string }>;
  illustrativeH2Title?: string;
  pageTitle?: string;
  pageExcerpt?: string;
  siteId?: string;
  site?: WordPressSite | null;
  pageLocalContext?: PageLocalContext;
  /** Published Answer HTML: scenario must illustrate this topic, not another vertical. */
  answerSectionHtml?: string;
}): Promise<IllustrativeExample | undefined> {
  const keyword = input.keyword.trim();
  const companyName = input.companyName.trim();
  const location = input.location.trim();
  if (!keyword || !companyName) {
    console.warn("[Illustrative extract] missing keyword or company name; skipping persona extract");
    return undefined;
  }
  const pageCtx =
    input.pageLocalContext
    ?? resolvePageLocalContext({
      keyword,
      site: input.site,
      entity: input.entity,
    });
  const researchLocation = pageCtx.prosePlaceLabel || pageCtx.primaryCity || location;
  const researchTopic = pageCtx.serviceTopic || keyword;
  const query =
    input.illustrativeExampleQuery?.trim() ||
    buildIllustrativeExampleResearchQuery({
      topic: researchTopic,
      location: researchLocation || researchTopic,
      asOfLabel: input.researchAsOf.trim() || formatResearchAsOfLabel(new Date()),
    });
  const serpContext = serpContextForIllustrativeQuery(input.serpByQuery, query);
  const chatGptMatch = input.chatGptByQuery?.find(
    (r) => r.query.trim().toLowerCase() === query.toLowerCase(),
  );
  const chatGptText = chatGptMatch?.responseText?.trim() ?? "";
  const chatGptContext = (input.chatGptByQuery ?? [])
    .map((r) => r.responseText?.trim())
    .filter(Boolean)
    .join("\n\n");
  const researchText = [serpContext, chatGptText || chatGptContext].filter(Boolean).join("\n\n").trim();
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const illustrativeModel = getResearchModel(input.siteId);
  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: illustrativeModel,
    system: ILLUSTRATIVE_EXTRACT_SYSTEM,
    user: [
      formatPageLocalContextPromptBlock(pageCtx),
      pageCtx.primaryCity ? `Primary service city: ${pageCtx.primaryCity}` : "",
      pageCtx.serviceTopic ? `Service topic (product or brand, never a city): ${pageCtx.serviceTopic}` : "",
      pageCtx.placeEntity ? `Place entity: ${pageCtx.placeEntity}` : "",
      input.pageTitle?.trim() ? `Page title: ${input.pageTitle.trim()}` : "",
      input.pageUrl?.trim() ? `Page URL: ${input.pageUrl.trim()}` : "",
      `Keyword: ${keyword}`,
      location && location !== pageCtx.primaryCity ? `Legacy location hint: ${location}` : "",
      `Connected business (recommendation paragraph MUST open with this name as the subject): ${companyName}`,
      `Research as-of: ${input.researchAsOf.trim()}`,
      input.pageExcerpt?.trim() ? `Page context: ${input.pageExcerpt.trim()}` : "",
      formatAnswerTopicContractForIllustrativeExtract(input.answerSectionHtml),
      researchText ? `\nResearch snippets:\n${researchText}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: topicResearchFanoutMaxTokens(illustrativeModel),
    temperature: ILLUSTRATIVE_PERSONA_EXTRACT_TEMPERATURE,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "illustrative_example_extract", strict: false, schema: ILLUSTRATIVE_EXTRACT_SCHEMA },
    },
  });
  let parsed: unknown;
  try {
    parsed = parseJsonStrict(content);
  } catch {
    console.warn("[Illustrative extract] JSON parse failed; continuing without stored persona");
    return undefined;
  }
  const normalized = normalizeIllustrativeExample(parsed, input.researchAsOf, input.illustrativeH2Title);
  if (!normalized) {
    console.warn("[Illustrative extract] invalid persona shape; continuing without stored persona");
    return undefined;
  }
  return normalized;
}
