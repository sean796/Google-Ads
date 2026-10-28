import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";

export const TOPIC_RESEARCH_FANOUT_MIN_QUERIES = 3;

export const TOPIC_RESEARCH_FANOUT_MAX_QUERIES = 5;

export const TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES = 18;

/** Max follow-up web-search verifies for economic not_found rows after primary pass. */
export const TOPIC_RESEARCH_SECONDARY_VERIFY_MAX = 4;

export const TOPIC_RESEARCH_FANOUT_CITY_REQUIRED =
  "Topic fan-out requires a company city on the connected site";

export const TOPIC_RESEARCH_PLAN_TEMPERATURE = 0.55;

/** Structured JSON fan-out calls: use the model’s full allowed completion budget. */


export const TOPIC_RESEARCH_PLAN_SYSTEM = `You invent localized buyer research questions for a first-party company page.

Return JSON only: { "researchQueries": string[], "namedPrograms": string[] }.

researchQueries: 3 to 5 distinct questions a real local buyer in Location would ask about THIS Keyword and Title. Each question must:
- Be 4 to 9 words maximum (DataForSEO SERP rejects queries over 10 words).
- Read like a concise natural question or search phrase (how/what/when/can/does/why, or "compare…").
- Mention the city inside the question, not as a trailing keyword suffix.
- Target a different buyer intent derived from Keyword, Title, and page context only (compare, quality, features, climate fit, process). Do not force cost, incentives, examples, or any other slot.
- Be a topic-research question whose SERP answers the Keyword decision. Do not repeat the seed keyword verbatim as the whole query.

Forbidden:
- Where-to-shop questions (where can I see, get, buy, find, or visit samples, showrooms, dealers, or this company). Those SERPs recommend other stores.
- Questions whose subject is the connected company ("Can {Company} help me…"). Research the topic, not the store.
- Rebate, incentive, grant, promotion, financing, or sale questions unless Keyword or Title is already about those.
- Required slots (no mandatory example question, no mandatory program-status question).
- "{seed keyword} {city}"
- "{company name} {city} financing"
- "{topic} rates {city}" or "{topic} installation process {city}" unless rewritten as a full natural question
- Generic national queries with no city
- Other provinces, countries, or cities
- An example from a different industry than Keyword

namedPrograms: official product or program names for THIS company ONLY if explicitly named in inputs. Copy exactly. Otherwise [].
Do not invent programs, years, or install counts.`;

export type TopicResearchPlan = {
  researchQueries: string[];
  namedPrograms: string[];
  plannerModel?: string;
  plannedAt?: string;
  researchAsOf?: string;
  illustrativeExampleQuery?: string;
  programStatusQuery?: string;
};

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["researchQueries", "namedPrograms"],
  properties: {
    researchQueries: { type: "array", items: { type: "string" } },
    namedPrograms: { type: "array", items: { type: "string" } },
  },
} as const;

export const CLAIMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "source"],
        properties: {
          text: { type: "string" },
          source: { type: "string" },
        },
      },
    },
  },
} as const;

export const CLAIMS_SYSTEM = `Extract first-party business claims the company can say as we/our.

Return JSON only: { "claims": [ { "text": string, "source": string } ] }.
Sources allowed: chatgpt, swot, gbp, master.
CONNECTED_SITE is this client. Discard ChatGPT facts about a same-name company on a different website, city, province, or country.
Discard grants, loans, rates, tax classes, and payback facts that belong to a different city or province than CONNECTED_SITE location.
Street address, headquarters, phone, and hours: only from GBP_MASTER. Never from chatgpt.
Use only facts in the source text. Years, install counts, and program names only if the source states them. If a source says a program is closed, keep that as a closed-program claim. Never invent a figure.
If the source asserts experience or volume without a figure, write a qualitative claim (years of experience, lots of installs) and never invent a number.
If the sources contain no first-party facts, return { "claims": [] }.`;

export function topicResearchFanoutMaxTokens(modelId: string): number {
  return getCompetitorReportMaxOutputTokens(modelId);
}

export type FactualVerificationPlanItem = {
  claimLabel: string;
  verificationQuery: string;
  preferDomains: string[];
};

export function uniqueTrimmed(values: unknown, max?: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (!Array.isArray(values)) return out;
  for (const raw of values) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (max != null && out.length >= max) break;
  }
  return out;
}

export function requireFanoutLocation(location: string): string {
  return location.trim();
}
