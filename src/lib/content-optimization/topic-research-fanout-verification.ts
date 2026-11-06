import { z } from "zod";
import type { WordPressSite } from "@/components/integrations/types";
import pLimit from "p-limit";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { fetchSerpOrganicForQuery } from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import { isDfsPaymentLatched } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { QueryFanoutSerpRow, SerpOrganicTopEntry, VerifiedFact } from "@/lib/overview-seo-content-brief";
import { buildLlmAuditOfficialVerificationPrompt } from "@/lib/llm-audit/llm-audit-prompts";
import { fetchUrlTextViaApi } from "@/lib/proxy-fetch-text";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { TOPIC_RESEARCH_VERIFICATION_SERP_CONCURRENCY } from "@/lib/overview/overview-research-batch-constants";
import {
  TOPIC_RESEARCH_SECONDARY_VERIFY_MAX,
  type FactualVerificationPlanItem,
  requireFanoutLocation,
  topicResearchFanoutMaxTokens,
} from "@/lib/content-optimization/topic-research-fanout-shared";
import {
  attachLocationToQfoQuery,
} from "@/lib/content-optimization/topic-research-fanout-queries";
import {
  isOfficialDomain,
  officialDomainsForLocation,
  organicTopFromSerpDump,
  pickOfficialOrganicResult,
  serpRowFromDump,
} from "@/lib/content-optimization/topic-research-fanout-verification-domains";
import {
  buildMandatoryVerificationItems,
  extractCheckableClaimsFromPageExcerpt,
  mergeVerificationPlanItems,
  normalizeFactualVerificationPlan,
  normalizePageClaimInventory,
  planFactualVerificationQueries,
} from "@/lib/content-optimization/topic-research-fanout-verification-plan";

export {
  buildMandatoryVerificationItems,
  extractCheckableClaimsFromPageExcerpt,
  isOfficialDomain,
  mergeVerificationPlanItems,
  normalizeFactualVerificationPlan,
  normalizePageClaimInventory,
  officialDomainsForLocation,
  organicTopFromSerpDump,
  pickOfficialOrganicResult,
  planFactualVerificationQueries,
  serpRowFromDump,
};

const VerifiedFactModelSchema = z.object({
  status: z.enum(["confirmed", "contradicted", "not_found"]).nullish(),
  fact: z.string().nullish(),
  sourceUrl: z.string().nullish(),
  sourceDomain: z.string().nullish(),
});

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
  const parsed = parseModelJson(content, VerifiedFactModelSchema, "verified fact");
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
    if (!pageText || !pageText.trim()) {
      return verifyClaimViaOpenRouter({
        item: input.item,
        keyword: input.keyword,
        location: input.location,
        researchAsOf: input.researchAsOf,
      });
    }
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
