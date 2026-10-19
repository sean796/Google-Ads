import type { WordPressSite } from "@/components/integrations/types";
import pLimit from "p-limit";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import { fetchSerpOrganicForQuery } from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import { isDfsPaymentLatched } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { QueryFanoutSerpRow, SerpOrganicTopEntry, VerifiedFact } from "@/lib/overview-seo-content-brief";
import { extractDataForSeoSerpBrief } from "@/lib/overview-seo-content-brief";
import { buildLlmAuditOfficialVerificationPrompt } from "@/lib/llm-audit/llm-audit-prompts";
import { fetchUrlTextViaApi } from "@/lib/proxy-fetch-text";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { TOPIC_RESEARCH_VERIFICATION_SERP_CONCURRENCY } from "@/lib/overview/overview-research-batch-constants";
import {
  TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES,
  TOPIC_RESEARCH_SECONDARY_VERIFY_MAX,
  type FactualVerificationPlanItem,
  uniqueTrimmed,
  requireFanoutLocation,
  topicResearchFanoutMaxTokens,
} from "@/lib/content-optimization/topic-research-fanout-shared";
import {
  attachLocationToQfoQuery,
  buildProgramStatusResearchQuery,
  cityTokenFromLocation,
} from "@/lib/content-optimization/topic-research-fanout-queries";

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

const VERIFIED_FACT_EXTRACT_SYSTEM = `Extract one factual claim from official page text only.

Return JSON: { "status": "confirmed"|"contradicted"|"not_found", "fact": string, "sourceUrl": string, "sourceDomain": string }.

Rules:
- fact must be directly supported by the page text; no inference or extrapolation.
- If the page does not address the claimLabel, status is not_found and fact is "".
- sourceUrl must match the page URL given in the user message.
- contradicted only when the page explicitly conflicts with a stale figure described in the user message.`;

const VERIFIED_FACT_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "fact", "sourceUrl", "sourceDomain"],
  properties: {
    status: { type: "string", enum: ["confirmed", "contradicted", "not_found"] },
    fact: { type: "string" },
    sourceUrl: { type: "string" },
    sourceDomain: { type: "string" },
  },
} as const;

const PROVINCE_OFFICIAL_DOMAINS: Record<string, string[]> = {
  AB: ["alberta.ca", "gov.ab.ca", "efficiencyalberta.ca"],
  BC: ["gov.bc.ca"],
  ON: ["ontario.ca", "gov.on.ca"],
  SK: ["saskatchewan.ca"],
  MB: ["gov.mb.ca"],
  QC: ["quebec.ca", "gouv.qc.ca"],
};

const BASE_OFFICIAL_DOMAIN_SUFFIXES = ["canada.ca", "gc.ca"];

export function officialDomainsForLocation(location: string): string[] {
  const upper = location.trim().toUpperCase();
  const domains = [...BASE_OFFICIAL_DOMAIN_SUFFIXES];
  const provMatch = upper.match(/,\s*(AB|BC|ON|SK|MB|QC|NL|NB|NS|PE|YT|NT|NU)\b/);
  if (provMatch?.[1]) {
    domains.push(...(PROVINCE_OFFICIAL_DOMAINS[provMatch[1]] ?? []));
  }
  return domains;
}

export function isOfficialDomain(domain: string, preferDomains: string[], location: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  const candidates = [
    ...preferDomains.map((x) => x.trim().toLowerCase()).filter(Boolean),
    ...officialDomainsForLocation(location).map((x) => x.toLowerCase()),
  ];
  return candidates.some(
    (suffix) => d === suffix || d.endsWith(`.${suffix}`) || d.endsWith(suffix),
  );
}

export function pickOfficialOrganicResult(
  organicTop: SerpOrganicTopEntry[],
  preferDomains: string[],
  location: string,
): SerpOrganicTopEntry | undefined {
  for (const entry of organicTop) {
    const domain = entry.domain?.trim() ?? "";
    if (domain && isOfficialDomain(domain, preferDomains, location)) return entry;
    const url = entry.url?.trim() ?? "";
    if (url) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (isOfficialDomain(host, preferDomains, location)) return { ...entry, domain: host };
      } catch {
        // skip invalid URL
      }
    }
  }
  return undefined;
}

export function organicTopFromSerpDump(serpDumpJson: Record<string, unknown>): SerpOrganicTopEntry[] {
  const extracted = extractDataForSeoSerpBrief(serpDumpJson);
  return extracted.organic.map((o) => ({
    domain: o.domain,
    url: o.url,
    title: o.title,
    description: o.description,
  }));
}

export function serpRowFromDump(query: string, serpDumpJson: Record<string, unknown>): QueryFanoutSerpRow {
  const extracted = extractDataForSeoSerpBrief(serpDumpJson);
  const organicTop = organicTopFromSerpDump(serpDumpJson);
  return {
    query,
    organicTop,
    organicTitles: organicTop.map((o) => o.title).filter((t): t is string => Boolean(t)),
    paa: extracted.peopleAlsoAsk.map((p) => p.question).filter(Boolean),
  };
}

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
    const parsed = parseJsonStrict<unknown>(content);
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
    const parsed = parseJsonStrict<unknown>(content);
    return normalizeFactualVerificationPlan(parsed);
  } catch {
    return [];
  }
}

function normalizeExtractedVerifiedFact(
  raw: unknown,
  claimLabel: string,
  asOf: string,
  fallbackUrl: string,
  fallbackDomain: string,
): VerifiedFact {
  const base: VerifiedFact = {
    claimLabel,
    status: "not_found",
    fact: "",
    sourceUrl: fallbackUrl,
    sourceDomain: fallbackDomain,
    asOf,
  };
  if (!raw || typeof raw !== "object") return base;
  const rec = raw as Record<string, unknown>;
  const statusRaw = String(rec.status ?? "").trim();
  const status =
    statusRaw === "confirmed" || statusRaw === "contradicted" || statusRaw === "not_found"
      ? statusRaw
      : "not_found";
  const fact = String(rec.fact ?? "").trim();
  const sourceUrl = String(rec.sourceUrl ?? fallbackUrl).trim() || fallbackUrl;
  let sourceDomain = String(rec.sourceDomain ?? fallbackDomain).trim() || fallbackDomain;
  if (!sourceDomain && sourceUrl) {
    try {
      sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      sourceDomain = fallbackDomain;
    }
  }
  if (status === "not_found" || !fact) {
    return { ...base, status: "not_found", sourceUrl, sourceDomain };
  }
  return { claimLabel, status, fact, sourceUrl, sourceDomain, asOf };
}

async function extractVerifiedFactFromPageText(input: {
  claimLabel: string;
  pageUrl: string;
  pageDomain: string;
  pageText: string;
  researchAsOf: string;
  siteId?: string;
}): Promise<VerifiedFact> {
  const clipped = input.pageText.trim();
  if (!clipped) {
    return {
      claimLabel: input.claimLabel,
      status: "not_found",
      fact: "",
      sourceUrl: input.pageUrl,
      sourceDomain: input.pageDomain,
      asOf: input.researchAsOf,
    };
  }
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const factExtractModel = getResearchModel(input.siteId);
  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: factExtractModel,
    system: VERIFIED_FACT_EXTRACT_SYSTEM,
    user: [
      `claimLabel: ${input.claimLabel}`,
      `sourceUrl: ${input.pageUrl}`,
      `sourceDomain: ${input.pageDomain}`,
      "",
      "Official page text:",
      clipped,
    ].join("\n"),
    maxTokens: topicResearchFanoutMaxTokens(factExtractModel),
    temperature: 0,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "verified_fact_extract", strict: false, schema: VERIFIED_FACT_EXTRACT_SCHEMA },
    },
  });
  const parsed = parseJsonStrict<unknown>(content);
  return normalizeExtractedVerifiedFact(
    parsed,
    input.claimLabel,
    input.researchAsOf,
    input.pageUrl,
    input.pageDomain,
  );
}

async function verifyClaimViaOpenRouter(input: {
  item: FactualVerificationPlanItem;
  keyword: string;
  location: string;
  researchAsOf: string;
}): Promise<VerifiedFact> {
  const userPrompt = buildLlmAuditOfficialVerificationPrompt({
    verificationQuery: input.item.verificationQuery,
    claimLabel: input.item.claimLabel,
    focusKeyword: input.keyword,
    location: input.location,
    researchAsOf: input.researchAsOf,
    preferDomains: input.item.preferDomains,
  });
  try {
    const apiKey = await resolveOpenRouterApiKeyForHarness();
    const verifyModel = getResearchModel();
    const { content } = await postOpenRouterAppChat({
      apiKey,
      model: verifyModel,
      system: "You verify facts from official government web sources only. Follow the user format exactly.",
      user: userPrompt,
      maxTokens: topicResearchFanoutMaxTokens(verifyModel),
      temperature: 0,
      signal: AbortSignal.timeout(90_000),
    });
    const text = content.trim();
    const urlMatch = text.match(/https:\/\/[^\s)]+/);
    const sourceUrl = urlMatch?.[0]?.replace(/[.,;]+$/, "") ?? "";
    let sourceDomain = "";
    if (sourceUrl) {
      try {
        sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        sourceDomain = "";
      }
    }
    const statusMatch = text.match(/status:\s*(confirmed|contradicted|not_found)/i);
    const statusRaw = statusMatch?.[1]?.toLowerCase() ?? "not_found";
    const status =
      statusRaw === "confirmed" || statusRaw === "contradicted" ? statusRaw : ("not_found" as const);
    const factMatch = text.match(/fact:\s*(.+?)(?:\n|$)/i);
    const fact = factMatch?.[1]?.trim() ?? "";
    if (status === "not_found" || !fact) {
      return {
        claimLabel: input.item.claimLabel,
        status: "not_found",
        fact: "",
        sourceUrl,
        sourceDomain,
        asOf: input.researchAsOf,
      };
    }
    return {
      claimLabel: input.item.claimLabel,
      status,
      fact,
      sourceUrl,
      sourceDomain,
      asOf: input.researchAsOf,
    };
  } catch {
    return {
      claimLabel: input.item.claimLabel,
      status: "not_found",
      fact: "",
      sourceUrl: "",
      sourceDomain: "",
      asOf: input.researchAsOf,
    };
  }
}

export async function fetchAndExtractVerifiedFact(input: {
  item: FactualVerificationPlanItem;
  organicTop: SerpOrganicTopEntry[];
  location: string;
  researchAsOf: string;
  siteId?: string;
  keyword: string;
}): Promise<VerifiedFact> {
  const official = pickOfficialOrganicResult(
    input.organicTop,
    input.item.preferDomains,
    input.location,
  );
  const pageUrl = official?.url?.trim() ?? "";
  let pageDomain = official?.domain?.trim() ?? "";
  if (!pageDomain && pageUrl) {
    try {
      pageDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      pageDomain = "";
    }
  }
  if (!pageUrl) {
    return verifyClaimViaOpenRouter({
      item: input.item,
      keyword: input.keyword,
      location: input.location,
      researchAsOf: input.researchAsOf,
    });
  }
  try {
    const pageText = await fetchUrlTextViaApi(pageUrl);
    return await extractVerifiedFactFromPageText({
      claimLabel: input.item.claimLabel,
      pageUrl,
      pageDomain,
      pageText,
      researchAsOf: input.researchAsOf,
      siteId: input.siteId,
    });
  } catch {
    return verifyClaimViaOpenRouter({
      item: input.item,
      keyword: input.keyword,
      location: input.location,
      researchAsOf: input.researchAsOf,
    });
  }
}

/** Economic claim labels eligible for capped secondary web-search verify. */
export function isEconomicVerificationClaim(claimLabel: string): boolean {
  const t = claimLabel.trim().toLowerCase();
  return (
    /cost|payback|rate|kwh|¢|\/kwh|\$\/w|savings|roi|export|usage|install band|electricity/.test(t) &&
    !/rebate|incentive|grant|program status|permit|setback|efficiency tier|sun hour|sunshine|daylight/.test(t)
  );
}

export async function runFactualVerificationPass(input: {
  keyword: string;
  title?: string;
  location: string;
  researchAsOf: string;
  pageExcerpt?: string;
  serpPeopleAlsoAsk?: string[];
  site?: WordPressSite | null;
  siteId?: string;
  onProgress?: (message: string) => void;
}): Promise<{
  factualVerificationQueries: string[];
  verifiedFacts: VerifiedFact[];
  verificationSerpRows: QueryFanoutSerpRow[];
}> {
  if (isDfsPaymentLatched()) {
    return { factualVerificationQueries: [], verifiedFacts: [], verificationSerpRows: [] };
  }
  const location = requireFanoutLocation(input.location);
  input.onProgress?.("Planning factual verification queries");
  const plannerPlan = await planFactualVerificationQueries({
    keyword: input.keyword,
    title: input.title,
    location,
    researchAsOf: input.researchAsOf,
    pageExcerpt: input.pageExcerpt,
    serpPeopleAlsoAsk: input.serpPeopleAlsoAsk,
    siteId: input.siteId ?? input.site?.id,
  });
  let pagePlan: FactualVerificationPlanItem[] = [];
  if (input.pageExcerpt?.trim()) {
    input.onProgress?.("Inventorying checkable claims from existing page");
    pagePlan = await extractCheckableClaimsFromPageExcerpt({
      keyword: input.keyword,
      location,
      researchAsOf: input.researchAsOf,
      pageExcerpt: input.pageExcerpt,
      siteId: input.siteId ?? input.site?.id,
    });
  }
  const plan = mergeVerificationPlanItems(pagePlan, plannerPlan);
  if (!plan.length) {
    return { factualVerificationQueries: [], verifiedFacts: [], verificationSerpRows: [] };
  }
  const factualVerificationQueries = plan.map((row) =>
    attachLocationToQfoQuery(row.verificationQuery, location),
  );
  const verifyLimit = pLimit(TOPIC_RESEARCH_VERIFICATION_SERP_CONCURRENCY);
  const verifyResults = await Promise.all(
    plan.map((item, planIndex) =>
      verifyLimit(async () => {
        const query = factualVerificationQueries[planIndex]!;
        input.onProgress?.(`Verifying: ${item.claimLabel.slice(0, 48)}`);
        let organicTop: SerpOrganicTopEntry[] = [];
        let serpRow: QueryFanoutSerpRow;
        if (isDfsPaymentLatched()) {
          serpRow = { query, organicTop: [], paa: [], organicTitles: [] };
        } else {
          try {
            const { serpDumpJson } = await fetchSerpOrganicForQuery({
              keyword: query,
              location,
              site: input.site,
            });
            serpRow = serpRowFromDump(query, serpDumpJson);
            organicTop = serpRow.organicTop;
          } catch {
            serpRow = { query, organicTop: [], paa: [], organicTitles: [] };
          }
        }
        const fact = await fetchAndExtractVerifiedFact({
          item,
          organicTop,
          location,
          researchAsOf: input.researchAsOf,
          siteId: input.siteId ?? input.site?.id,
          keyword: input.keyword,
        });
        return { planIndex, serpRow, fact };
      }),
    ),
  );
  verifyResults.sort((a, b) => a.planIndex - b.planIndex);
  const verifiedFacts: VerifiedFact[] = verifyResults.map((row) => row.fact);
  const verificationSerpRows: QueryFanoutSerpRow[] = verifyResults.map((row) => row.serpRow);

  let secondaryCount = 0;
  for (let i = 0; i < verifiedFacts.length; i++) {
    if (secondaryCount >= TOPIC_RESEARCH_SECONDARY_VERIFY_MAX) break;
    const fact = verifiedFacts[i]!;
    if (fact.status !== "not_found") continue;
    if (!isEconomicVerificationClaim(fact.claimLabel)) continue;
    const item = plan[i];
    if (!item) continue;
    input.onProgress?.(`Secondary verify: ${item.claimLabel.slice(0, 40)}`);
    const retry = await verifyClaimViaOpenRouter({
      item,
      keyword: input.keyword,
      location,
      researchAsOf: input.researchAsOf,
    });
    if (retry.status !== "not_found" && retry.fact.trim()) {
      verifiedFacts[i] = retry;
    }
    secondaryCount += 1;
  }

  return { factualVerificationQueries, verifiedFacts, verificationSerpRows };
}
