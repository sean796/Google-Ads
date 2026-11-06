import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import {
  TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES,
  type FactualVerificationPlanItem,
  uniqueTrimmed,
  requireFanoutLocation,
  topicResearchFanoutMaxTokens,
} from "@/lib/content-optimization/topic-research-fanout-shared";
import {
  buildProgramStatusResearchQuery,
  cityTokenFromLocation,
} from "@/lib/content-optimization/topic-research-fanout-queries";

const FactualVerificationPlanItemModelSchema = z.object({
  claimLabel: z.string().nullish(),
  verificationQuery: z.string().nullish(),
  preferDomains: z.array(z.string()).nullish(),
});

const PageClaimInventoryModelSchema = z.object({
  claims: z.array(FactualVerificationPlanItemModelSchema).nullish(),
});

const FactualVerificationPlanModelSchema = z.object({
  verifications: z.array(FactualVerificationPlanItemModelSchema).nullish(),
});

const FACTUAL_VERIFICATION_PLAN_SYSTEM = `You plan factual verification queries for a connected-site article rewrite. Return every checkable claim the rewrite must verify or drop.

Return JSON only: { "verifications": [ { "claimLabel": string, "verificationQuery": string, "preferDomains": string[] } ] }.

Read Keyword, Title, Location, Research as-of, and Page excerpt (when present). List only checkable claims that appear in Keyword, Title, or the page excerpt. Do not invent rebate, incentive, solar, climate, or program-status checks unless those appear in Keyword, Title, or excerpt.

Each verificationQuery must surface official government, utility, or authoritative spec sources for the connected province when the claim is governmental. Forbidden: installer blogs or generic SEO articles.

If page excerpt contains a specific number or program name, include a verification row for it.

preferDomains: 1-4 domain suffixes to prefer (e.g. alberta.ca, canada.ca).

Return { "verifications": [] } only when no checkable claims apply. Never exceed ${TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES} items. Prioritize page-excerpt figures first.`;

const PAGE_CLAIM_INVENTORY_SYSTEM = `Extract every checkable factual claim from the page excerpt that a rewrite must verify against official sources or omit.

Return JSON only: { "claims": [ { "claimLabel": string, "verificationQuery": string, "preferDomains": string[] } ] }.

Include ALL specific figures and assertions from the excerpt:
- Dollar amounts and CAD install cost bands (e.g. $15,000–$30,000)
- Payback periods in years
- Property-value or resale premium percentages
- kWh/month usage assumptions
- ¢/kWh or $/kWh electricity and export rates
- Rebate, grant, and incentive program names and implied status
- Roofline setback distances (e.g. 1.2 m above roof)
- Municipal permit or compliance requirements

Each verificationQuery must target official government, utility, weather, or spec sources for Location. Forbidden: installer blogs.

If excerpt has no checkable claims, return { "claims": [] }. Never exceed ${TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES} items.`;

const PAGE_CLAIM_INVENTORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claimLabel", "verificationQuery", "preferDomains"],
        properties: {
          claimLabel: { type: "string" },
          verificationQuery: { type: "string" },
          preferDomains: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const FACTUAL_VERIFICATION_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verifications"],
  properties: {
    verifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claimLabel", "verificationQuery", "preferDomains"],
        properties: {
          claimLabel: { type: "string" },
          verificationQuery: { type: "string" },
          preferDomains: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function buildFactualVerificationPlanUser(input: {
  keyword: string;
  title?: string;
  location: string;
  researchAsOf: string;
  pageExcerpt?: string;
  serpPeopleAlsoAsk?: string[];
}): string {
  const lines = [
    `Keyword: ${input.keyword.trim()}`,
    `Title: ${(input.title ?? "").trim() || input.keyword.trim()}`,
    `Location: ${input.location.trim()}`,
    `Research as of: ${input.researchAsOf.trim()}`,
  ];
  if (input.pageExcerpt?.trim()) {
    lines.push(`Page excerpt:\n${input.pageExcerpt.trim()}`);
  }
  if (input.serpPeopleAlsoAsk?.length) {
    lines.push(
      "SERP people-also-ask (intent hints):",
      ...input.serpPeopleAlsoAsk.map((q) => `- ${q.trim()}`),
    );
  }
  lines.push("", `Return 0-${TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES} official-source verification queries.`);
  return lines.join("\n");
}

/** Dedupe by claimLabel and cap at TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES. Earlier plans win. */
export function mergeVerificationPlanItems(
  ...plans: FactualVerificationPlanItem[][]
): FactualVerificationPlanItem[] {
  const seen = new Set<string>();
  const out: FactualVerificationPlanItem[] = [];
  for (const plan of plans) {
    for (const item of plan) {
      const key = item.claimLabel.trim().toLowerCase();
      if (!key || !item.verificationQuery.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES) return out;
    }
  }
  return out;
}

export function buildMandatoryVerificationItems(input: {
  keyword: string;
  location: string;
  researchAsOf: string;
  pageExcerpt?: string;
}): FactualVerificationPlanItem[] {
  const keyword = input.keyword.trim();
  const location = input.location.trim();
  const researchAsOf = input.researchAsOf.trim();
  const excerpt = (input.pageExcerpt ?? "").toLowerCase();
  const corpus = `${keyword} ${excerpt}`.toLowerCase();
  const locUpper = location.toUpperCase();
  const isAlberta = locUpper.includes(", AB") || locUpper.includes("ALBERTA");
  const isSolar = /solar|pv|photovoltaic|micro-?generation|microgeneration/.test(corpus);
  const city = cityTokenFromLocation(location);
  const items: FactualVerificationPlanItem[] = [];

  if (
    isSolar ||
    /incentive|rebate|grant|financ|roi|payback|cost|savings|efficiency/.test(corpus)
  ) {
    items.push({
      claimLabel: "Provincial solar rebate and incentive program status",
      verificationQuery: buildProgramStatusResearchQuery({
        topic: keyword || "solar",
        location,
        asOfLabel: researchAsOf,
      }),
      preferDomains: isAlberta
        ? ["alberta.ca", "efficiencyalberta.ca", "canada.ca"]
        : ["canada.ca", "gc.ca"],
    });
  }

  if (isAlberta && isSolar) {
    items.push({
      claimLabel: "Alberta Solar Club micro-generation export rate",
      verificationQuery: `What is the Alberta Solar Club export rate for excess solar electricity as of ${researchAsOf}?`,
      preferDomains: ["aeso.ca", "alberta.ca", "canada.ca"],
    });
  }

  if (/efficiency|rating|tier|spec|panel/.test(corpus)) {
    items.push({
      claimLabel: "Residential solar panel efficiency tier bands",
      verificationQuery: `What are typical residential solar panel efficiency percentage ranges for standard vs high-efficiency modules as of ${researchAsOf}?`,
      preferDomains: ["nrel.gov", "energy.gov", "canada.ca"],
    });
  }

  if (city && (/sunshine|sun hours|sun-hour|2,?300|2300|daylight/.test(excerpt) || isSolar)) {
    items.push({
      claimLabel: `Annual sunshine or sun hours for ${city}`,
      verificationQuery: `How many hours of sunshine does ${city} ${location} receive per year according to official sources?`,
      preferDomains: ["canada.ca", "weather.gc.ca", "gc.ca"],
    });
  }

  if (/17 hours|seventeen hours|daylight hours daily/.test(excerpt)) {
    items.push({
      claimLabel: `Peak summer daylight hours for ${city || location}`,
      verificationQuery: `What is the maximum daylight length in ${city || location} during summer?`,
      preferDomains: ["canada.ca", "weather.gc.ca", "timeanddate.com"],
    });
  }

  if (/edmonton/.test(excerpt) && /grant|rebate|incentive/.test(excerpt)) {
    items.push({
      claimLabel: "Edmonton municipal solar grant or incentive status",
      verificationQuery: `Is the City of Edmonton residential solar rebate or grant program open to new applications as of ${researchAsOf}?`,
      preferDomains: ["edmonton.ca", "alberta.ca", "canada.ca"],
    });
  }

  if (isSolar) {
    items.push({
      claimLabel: "Residential solar install cost band",
      verificationQuery: `What is a typical installed cost range in CAD for residential solar in ${location} as of ${researchAsOf}?`,
      preferDomains: ["canada.ca", "nrcan.gc.ca", "alberta.ca"],
    });
    items.push({
      claimLabel: "Solar payback period horizon",
      verificationQuery: `What payback period do official or utility sources cite for residential solar in ${location} as of ${researchAsOf}?`,
      preferDomains: ["canada.ca", "nrcan.gc.ca", "aeso.ca"],
    });
    items.push({
      claimLabel: "Residential electricity rate",
      verificationQuery: `What is the residential electricity rate in ¢/kWh or $/kWh for ${location} as of ${researchAsOf}?`,
      preferDomains: ["epcor.com", "aeso.ca", "alberta.ca", "canada.ca"],
    });
  }

  if (/resale|property.value|home value|3.?4%|3–4%/.test(excerpt)) {
    items.push({
      claimLabel: "Solar property-value or resale premium",
      verificationQuery: `Does official research support a resale or property-value premium from solar in ${location}?`,
      preferDomains: ["canada.ca", "nrcan.gc.ca", "cmhc.ca"],
    });
  }

  if (/kwh|kwh\/month|800/.test(excerpt)) {
    items.push({
      claimLabel: "Typical household electricity usage kWh/month",
      verificationQuery: `What is typical residential electricity usage in kWh per month for ${location}?`,
      preferDomains: ["canada.ca", "nrcan.gc.ca"],
    });
  }

  if (/roofline|setback|1\.2\s*m|above the roof/.test(excerpt)) {
    items.push({
      claimLabel: "Solar panel roofline setback requirement",
      verificationQuery: `What roofline or fire setback distance applies to rooftop solar in ${location}?`,
      preferDomains: ["edmonton.ca", "alberta.ca", "canada.ca"],
    });
  }

  if (/edmonton/.test(corpus) && /permit|compliance|requirement/.test(excerpt)) {
    items.push({
      claimLabel: "Edmonton solar permit requirements",
      verificationQuery: `What permits does the City of Edmonton require for residential rooftop solar as of ${researchAsOf}?`,
      preferDomains: ["edmonton.ca"],
    });
  }

  return items;
}

export function normalizePageClaimInventory(raw: unknown): FactualVerificationPlanItem[] {
  if (!raw || typeof raw !== "object") return [];
  const claims = (raw as { claims?: unknown }).claims;
  if (!Array.isArray(claims)) return [];
  const out: FactualVerificationPlanItem[] = [];
  for (const item of claims) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const claimLabel = String(rec.claimLabel ?? "").trim();
    const verificationQuery = String(rec.verificationQuery ?? "").trim();
    const preferDomains = uniqueTrimmed(rec.preferDomains) as string[];
    if (!claimLabel || !verificationQuery) continue;
    out.push({ claimLabel, verificationQuery, preferDomains });
    if (out.length >= TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES) break;
  }
  return out;
}

export async function extractCheckableClaimsFromPageExcerpt(input: {
  keyword: string;
  location: string;
  researchAsOf: string;
  pageExcerpt: string;
  siteId?: string;
}): Promise<FactualVerificationPlanItem[]> {
  const excerpt = input.pageExcerpt.trim();
  if (!excerpt) return [];
  try {
    const location = requireFanoutLocation(input.location);
    const apiKey = await resolveOpenRouterApiKeyForHarness();
    const inventoryModel = getResearchModel(input.siteId);
    const { content } = await callOpenRouterChatCompletion({
      apiKey,
      model: inventoryModel,
      system: PAGE_CLAIM_INVENTORY_SYSTEM,
      user: [
        `Keyword: ${input.keyword.trim()}`,
        `Location: ${location}`,
        `Research as of: ${input.researchAsOf.trim()}`,
        "",
        "Page excerpt:",
        excerpt,
      ].join("\n"),
      maxTokens: topicResearchFanoutMaxTokens(inventoryModel),
      temperature: 0.1,
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "page_claim_inventory", strict: false, schema: PAGE_CLAIM_INVENTORY_SCHEMA },
      },
    });
    const parsed = parseModelJson(content, PageClaimInventoryModelSchema, "claim inventory");
    return normalizePageClaimInventory(parsed);
  } catch {
    return [];
  }
}

export function normalizeFactualVerificationPlan(raw: unknown): FactualVerificationPlanItem[] {
  if (!raw || typeof raw !== "object") return [];
  const verifications = (raw as { verifications?: unknown }).verifications;
  if (!Array.isArray(verifications)) return [];
  const out: FactualVerificationPlanItem[] = [];
  for (const item of verifications) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const claimLabel = String(rec.claimLabel ?? "").trim();
    const verificationQuery = String(rec.verificationQuery ?? "").trim();
    const preferDomains = uniqueTrimmed(rec.preferDomains) as string[];
    if (!claimLabel || !verificationQuery) continue;
    out.push({ claimLabel, verificationQuery, preferDomains });
    if (out.length >= TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES) break;
  }
  return out;
}

export async function planFactualVerificationQueries(input: {
  keyword: string;
  title?: string;
  location: string;
  researchAsOf: string;
  pageExcerpt?: string;
  serpPeopleAlsoAsk?: string[];
  siteId?: string;
}): Promise<FactualVerificationPlanItem[]> {
  try {
    const location = requireFanoutLocation(input.location);
    const apiKey = await resolveOpenRouterApiKeyForHarness();
    const verificationPlanModel = getResearchModel(input.siteId);
    const { content } = await callOpenRouterChatCompletion({
      apiKey,
      model: verificationPlanModel,
      system: FACTUAL_VERIFICATION_PLAN_SYSTEM,
      user: buildFactualVerificationPlanUser({ ...input, location }),
      maxTokens: topicResearchFanoutMaxTokens(verificationPlanModel),
      temperature: 0.2,
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "factual_verification_plan", strict: false, schema: FACTUAL_VERIFICATION_PLAN_SCHEMA },
      },
    });
    const parsed = parseModelJson(content, FactualVerificationPlanModelSchema, "verification plan");
    return normalizeFactualVerificationPlan(parsed);
  } catch {
    return [];
  }
}

