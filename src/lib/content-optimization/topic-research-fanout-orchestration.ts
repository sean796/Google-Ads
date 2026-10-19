import type { WordPressSite } from "@/components/integrations/types";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import { fetchChatGptCompanyAuthority } from "@/lib/llm-audit/llm-audit-dataforseo";
import { fetchSerpOrganicForQuery } from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import { isDfsPaymentLatched } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type {
  FirstPartyClaim,
  QueryFanout,
  SeoContentBriefV1,
} from "@/lib/overview-seo-content-brief";
import { resolveSiteLocationLabel } from "@/lib/llm-audit/resolve-site-location-label";
import {
  TOPIC_RESEARCH_FANOUT_MIN_QUERIES,
  TOPIC_RESEARCH_PLAN_SYSTEM,
  TOPIC_RESEARCH_PLAN_TEMPERATURE,
  PLAN_SCHEMA,
  CLAIMS_SCHEMA,
  CLAIMS_SYSTEM,
  uniqueTrimmed,
  requireFanoutLocation,
  topicResearchFanoutMaxTokens,
  TOPIC_RESEARCH_FANOUT_MAX_QUERIES,
  type TopicResearchPlan,
} from "@/lib/content-optimization/topic-research-fanout-shared";
import {
  attachLocationToQfoQuery,
  attachLocationToQfoQueries,
  buildTopicResearchPlanUser,
  filterBoilerplateResearchQueries,
  formatResearchAsOfLabel,
  cityTokenFromLocation,
} from "@/lib/content-optimization/topic-research-fanout-queries";
import { extractIllustrativeExample } from "@/lib/content-optimization/topic-research-fanout-illustrative";
import {
  runFactualVerificationPass,
  serpRowFromDump,
} from "@/lib/content-optimization/topic-research-fanout-verification";

export function normalizeTopicResearchPlan(raw: unknown): TopicResearchPlan {
  if (!raw || typeof raw !== "object") {
    throw new Error("Topic planner returned invalid JSON");
  }
  const rec = raw as Record<string, unknown>;
  const researchQueries = uniqueTrimmed(rec.researchQueries, TOPIC_RESEARCH_FANOUT_MAX_QUERIES);
  if (researchQueries.length === 0) {
    throw new Error("Topic planner returned no research queries");
  }
  return {
    researchQueries,
    namedPrograms: uniqueTrimmed(rec.namedPrograms),
  };
}

export function normalizeFirstPartyClaims(raw: unknown): FirstPartyClaim[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("First-party claim extractor returned invalid JSON");
  }
  const claimsRaw = (raw as { claims?: unknown }).claims;
  if (!Array.isArray(claimsRaw)) {
    throw new Error("First-party claim extractor returned no claims array");
  }
  const out: FirstPartyClaim[] = [];
  for (const item of claimsRaw) {
    if (!item || typeof item !== "object") continue;
    const text = String((item as { text?: unknown }).text ?? "").trim();
    const source = String((item as { source?: unknown }).source ?? "").trim();
    if (!text || !source) continue;
    out.push({ text, source });
  }
  return out;
}

export function collectFirstPartyClaimSourceText(input: {
  chatGptTexts: string[];
  swotText?: string;
  companyContext?: string;
  siteUrl?: string;
  location?: string;
}): string {
  const parts: string[] = [];
  const siteUrl = input.siteUrl?.trim() ?? "";
  const location = input.location?.trim() ?? "";
  if (siteUrl || location) {
    parts.push(`CONNECTED_SITE:\nurl: ${siteUrl}\nlocation: ${location}`);
  }
  for (const t of input.chatGptTexts) {
    if (t.trim()) parts.push(`CHATGPT:\n${t.trim()}`);
  }
  if (input.swotText?.trim()) parts.push(`SWOT:\n${input.swotText.trim()}`);
  if (input.companyContext?.trim()) parts.push(`GBP_MASTER:\n${input.companyContext.trim()}`);
  return parts.join("\n\n").trim();
}

export async function planTopicResearchQueries(input: {
  keyword: string;
  title?: string;
  companyName: string;
  location?: string;
  siteId?: string;
  pageUrl?: string;
  metaDescription?: string;
  swotText?: string;
  pageExcerpt?: string;
  serpPeopleAlsoAsk?: string[];
}): Promise<TopicResearchPlan> {
  const location = requireFanoutLocation(input.location ?? "");
  const researchAsOf = formatResearchAsOfLabel(new Date());
  const plannerModel = getResearchModel(input.siteId);
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: plannerModel,
    system: TOPIC_RESEARCH_PLAN_SYSTEM,
    user: buildTopicResearchPlanUser({ ...input, location, researchAsOf }),
    maxTokens: topicResearchFanoutMaxTokens(plannerModel),
    temperature: TOPIC_RESEARCH_PLAN_TEMPERATURE,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "topic_research_plan", strict: false, schema: PLAN_SCHEMA },
    },
  });
  const parsed = parseJsonStrict<unknown>(content);
  const plan = normalizeTopicResearchPlan(parsed);
  const localizedQueries = attachLocationToQfoQueries(plan.researchQueries, location);
  const researchQueries = filterBoilerplateResearchQueries(localizedQueries, {
    keyword: input.keyword,
    companyName: input.companyName,
    location,
  });
  if (researchQueries.length < TOPIC_RESEARCH_FANOUT_MIN_QUERIES) {
    throw new Error("Topic planner returned fewer than 3 topic research queries");
  }
  return {
    ...plan,
    researchQueries,
    researchAsOf,
    illustrativeExampleQuery: researchQueries[0],
    plannerModel,
    plannedAt: new Date().toISOString(),
  };
}

export async function extractFirstPartyClaims(input: {
  chatGptTexts: string[];
  swotText?: string;
  companyContext?: string;
  siteUrl?: string;
  location?: string;
}): Promise<FirstPartyClaim[]> {
  const sourceText = collectFirstPartyClaimSourceText(input);
  if (!sourceText) return [];
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const claimsModel = getResearchModel();
  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: claimsModel,
    system: CLAIMS_SYSTEM,
    user: sourceText,
    maxTokens: topicResearchFanoutMaxTokens(claimsModel),
    temperature: 0,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "first_party_claims", strict: false, schema: CLAIMS_SCHEMA },
    },
  });
  const parsed = parseJsonStrict<unknown>(content);
  return normalizeFirstPartyClaims(parsed);
}

export function mergeFanoutIntoBrief(
  brief: SeoContentBriefV1,
  fanout: QueryFanout,
  claims: FirstPartyClaim[],
): SeoContentBriefV1 {
  const paaSeen = new Set(brief.dataforseo.peopleAlsoAsk.map((p) => p.question.toLowerCase()));
  const relatedSeen = new Set(brief.dataforseo.relatedSearches.map((s) => s.toLowerCase()));
  const peopleAlsoAsk = [...brief.dataforseo.peopleAlsoAsk];
  const relatedSearches = [...brief.dataforseo.relatedSearches];
  for (const row of fanout.serpByQuery ?? []) {
    for (const q of row.paa) {
      const t = q.trim();
      if (!t || paaSeen.has(t.toLowerCase())) continue;
      paaSeen.add(t.toLowerCase());
      peopleAlsoAsk.push({ question: t, answers: [] });
    }
    const titleSources =
      row.organicTop?.map((o) => o.title).filter((t): t is string => Boolean(t)) ??
      row.organicTitles ??
      [];
    for (const title of titleSources) {
      const t = title.trim();
      if (!t || relatedSeen.has(t.toLowerCase())) continue;
      relatedSeen.add(t.toLowerCase());
      relatedSearches.push(t);
    }
  }
  return {
    ...brief,
    dataforseo: { ...brief.dataforseo, peopleAlsoAsk, relatedSearches },
    queryFanout: fanout,
    firstPartyClaims: claims,
  };
}

function companyContextFromSite(site?: WordPressSite | null): string {
  if (!site) return "";
  const nap = site.napInfo;
  return [site.name, site.siteUrl, nap?.name, nap?.address, nap?.phone].filter(Boolean).join(" | ");
}

export async function runTopicResearchFanout(input: {
  brief: SeoContentBriefV1;
  keyword: string;
  title?: string;
  companyName: string;
  location?: string;
  site?: WordPressSite | null;
  swotText?: string;
  pageExcerpt?: string;
  onProgress?: (message: string) => void;
  /** When true, ignore stored queryFanout and re-plan topic research + illustrative extract. */
  forceRefresh?: boolean;
}): Promise<SeoContentBriefV1> {
  const location = requireFanoutLocation(
    input.location ?? resolveSiteLocationLabel(input.site, input.keyword),
  );
  const siteUrl = input.site?.siteUrl?.trim() ?? "";
  let fanout = input.forceRefresh ? undefined : input.brief.queryFanout;
  if (!fanout?.queries?.length) {
    input.onProgress?.("Planning topic questions");
    const plan = await planTopicResearchQueries({
      keyword: input.keyword,
      title: input.title,
      companyName: input.companyName,
      location,
      siteId: input.site?.id,
      pageUrl: input.brief.pageUrl,
      swotText: input.swotText,
      pageExcerpt: input.pageExcerpt,
    });
    input.onProgress?.("Fan-out SERP");
    const serpByQuery = isDfsPaymentLatched()
      ? plan.researchQueries.map((query) => ({ query, organicTop: [], organicTitles: [], paa: [] }))
      : await Promise.all(
          plan.researchQueries.map(async (query) => {
            if (isDfsPaymentLatched()) {
              return { query, organicTop: [], organicTitles: [], paa: [] };
            }
            try {
              const { serpDumpJson } = await fetchSerpOrganicForQuery({
                keyword: query,
                location,
                site: input.site,
              });
              return serpRowFromDump(query, serpDumpJson);
            } catch {
              return { query, organicTop: [], organicTitles: [], paa: [] };
            }
          }),
        );
    input.onProgress?.("ChatGPT company facts");
    const authorityTopics = [
      ...plan.namedPrograms.map((program) => ({
        query: attachLocationToQfoQuery(program, location),
        topic: input.keyword,
        namedProgram: program,
      })),
      {
        query: attachLocationToQfoQuery(`${input.companyName} official facts`, location),
        topic: input.keyword,
        namedProgram: undefined as string | undefined,
      },
    ];
    const seenAuthority = new Set<string>();
    const uniqueAuthority = authorityTopics.filter((row) => {
      const key = row.query.toLowerCase();
      if (seenAuthority.has(key)) return false;
      seenAuthority.add(key);
      return true;
    });
    const chatGptByQuery = await Promise.all(
      uniqueAuthority.map(async ({ query, topic, namedProgram }) => {
        const result = await fetchChatGptCompanyAuthority({
          companyName: input.companyName,
          location,
          topic,
          namedProgram,
          siteUrl,
        }).catch(() => null);
        return { query, responseText: result?.responseText ?? "" };
      }),
    );
    fanout = {
      queries: plan.researchQueries,
      namedPrograms: plan.namedPrograms,
      plannerModel: plan.plannerModel,
      plannedAt: plan.plannedAt,
      researchAsOf: plan.researchAsOf,
      illustrativeExampleQuery: plan.illustrativeExampleQuery,
      programStatusQuery: plan.programStatusQuery,
      serpByQuery,
      chatGptByQuery,
    };
    if (plan.illustrativeExampleQuery?.trim()) {
      input.onProgress?.("Illustrative example extract");
      const illustrativeExample = await extractIllustrativeExample({
        keyword: input.keyword,
        location,
        researchAsOf: plan.researchAsOf ?? formatResearchAsOfLabel(new Date()),
        illustrativeExampleQuery: plan.illustrativeExampleQuery,
        companyName: input.companyName,
        serpByQuery,
        chatGptByQuery,
        pageTitle: input.title,
        pageExcerpt: input.pageExcerpt,
        siteId: input.site?.id,
        site: input.site,
      }).catch(() => undefined);
      if (illustrativeExample) {
        fanout = { ...fanout, illustrativeExample };
      }
    }
  }

  const researchAsOf =
    fanout.researchAsOf ?? formatResearchAsOfLabel(new Date());
  if (!fanout.verifiedFacts && cityTokenFromLocation(location) && !isDfsPaymentLatched()) {
    input.onProgress?.("Factual verification");
    const verification = await runFactualVerificationPass({
      keyword: input.keyword,
      title: input.title,
      location,
      researchAsOf,
      pageExcerpt: input.pageExcerpt,
      site: input.site,
      siteId: input.site?.id,
      onProgress: input.onProgress,
    });
    if (verification.factualVerificationQueries.length) {
      fanout = {
        ...fanout,
        researchAsOf,
        factualVerificationQueries: verification.factualVerificationQueries,
        verifiedFacts: verification.verifiedFacts,
        serpByQuery: [...(fanout.serpByQuery ?? []), ...verification.verificationSerpRows],
      };
    }
  }

  const addedVerifiedFacts =
    Boolean(fanout.verifiedFacts?.length) &&
    !Boolean(input.brief.queryFanout?.verifiedFacts?.length);
  const needsMerge =
    fanout !== input.brief.queryFanout || !input.brief.firstPartyClaims || addedVerifiedFacts;
  if (!needsMerge) {
    return input.brief;
  }

  const claims = await extractFirstPartyClaims({
    chatGptTexts: (fanout.chatGptByQuery ?? []).map((r) => r.responseText),
    swotText: input.swotText,
    companyContext: companyContextFromSite(input.site),
    siteUrl,
    location,
  });
  return mergeFanoutIntoBrief(input.brief, fanout, claims);
}
