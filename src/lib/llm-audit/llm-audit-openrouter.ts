import type { WordPressSite } from "@/components/integrations/types";
import pLimit from "p-limit";
import type { LlmAuditBrief, QueryFanout } from "@/lib/overview-seo-content-brief";
import {
  LLM_AUDIT_SYSTEM_MESSAGE,
  buildLlmAuditUserPromptFull,
  buildLlmAuditQfoUserPrompt,
} from "@/lib/llm-audit/llm-audit-prompts";
import { dedupeLlmAuditUrls, urlsFromLlmAuditText } from "@/lib/llm-audit/llm-audit-url-utils";
import {
  resolveFanoutLocationForResearch,
  resolveSiteLocationLabel,
} from "@/lib/llm-audit/resolve-site-location-label";
import {
  TOPIC_RESEARCH_FANOUT_CITY_REQUIRED,
  cityTokenFromLocation,
  extractIllustrativeExample,
  formatResearchAsOfLabel,
  planTopicResearchQueries,
  runFactualVerificationPass,
} from "@/lib/content-optimization/topic-research-fanout";
import { isDfsPaymentLatched } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import {
  appendUniversalContentRulesToSystemPrompt,
  injectBlacklistRagIntoMessages,
  scrubOverviewContentOutput,
} from "@/lib/content-word-blocklist";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { LLM_AUDIT_QFO_QUERY_CONCURRENCY } from "@/lib/overview/overview-research-batch-constants";

export const LLM_AUDIT_OPENROUTER_MODEL = "openai/gpt-4o-mini:online";

export const LLM_AUDIT_OPENROUTER_LABEL = "OpenRouter web audit";

/** Prevent Research All rows from hanging indefinitely on OpenRouter web search. */
export const LLM_AUDIT_OPENROUTER_TIMEOUT_MS = 120_000;

export type FetchLlmAuditOpenRouterInput = {
  keyword: string;
  siteUrl: string;
  site?: WordPressSite | null;
  location?: string;
  userPrompt?: string;
  platformLabel?: string;
};

export type FetchLlmAuditOpenRouterQfoInput = FetchLlmAuditOpenRouterInput & {
  companyName?: string;
  title?: string;
  pageUrl?: string;
  metaDescription?: string;
  pageExcerpt?: string;
  serpPeopleAlsoAsk?: string[];
};

export type LlmAuditOpenRouterQfoResult = {
  llmAudit: LlmAuditBrief;
  queryFanout?: QueryFanout;
};

function annotationsFromOpenRouterRaw(raw: unknown): Array<{ title?: string; url?: string }> {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  const choice = Array.isArray(root.choices)
    ? (root.choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const message = choice?.message;
  if (!message || typeof message !== "object") return [];
  const msg = message as Record<string, unknown>;
  const out: Array<{ title?: string; url?: string }> = [];
  const rawAnnotations = msg.annotations;
  if (Array.isArray(rawAnnotations)) {
    for (const ann of rawAnnotations) {
      if (!ann || typeof ann !== "object") continue;
      const a = ann as Record<string, unknown>;
      const url = typeof a.url === "string" ? a.url.trim() : "";
      if (!url) continue;
      const title = typeof a.title === "string" ? a.title.trim() : undefined;
      out.push({ title, url });
    }
  }
  return out;
}

export async function fetchLlmAuditOpenRouter(
  input: FetchLlmAuditOpenRouterInput,
): Promise<LlmAuditBrief> {
  const keyword = input.keyword.trim();
  const siteUrl = input.siteUrl.trim();
  const location = (input.location ?? resolveSiteLocationLabel(input.site, keyword)).trim();
  const platformLabel = input.platformLabel?.trim() || LLM_AUDIT_OPENROUTER_LABEL;

  const basePlatform = {
    platform: "chat_gpt" as const,
    label: platformLabel,
    model_name: LLM_AUDIT_OPENROUTER_MODEL,
    status: "error" as const,
  };

  try {
    const apiKey = await resolveOpenRouterApiKeyForHarness();
    const system = appendUniversalContentRulesToSystemPrompt(LLM_AUDIT_SYSTEM_MESSAGE);
    const userRaw =
      input.userPrompt?.trim() ||
      buildLlmAuditUserPromptFull({ keyword, location, platformLabel });
    const user =
      injectBlacklistRagIntoMessages([
        { role: "system", content: system },
        { role: "user", content: userRaw },
      ])[1]?.content ?? userRaw;

    const { content, raw } = await postOpenRouterAppChat({
      apiKey,
      model: LLM_AUDIT_OPENROUTER_MODEL,
      system,
      user,
      maxTokens: 2048,
      temperature: 0.5,
      signal: AbortSignal.timeout(LLM_AUDIT_OPENROUTER_TIMEOUT_MS),
    });

    const responseText = scrubOverviewContentOutput(content.trim());
    const annotations = annotationsFromOpenRouterRaw(raw);
    const annotationUrls = annotations.map((a) => a.url).filter(Boolean) as string[];
    const liveLinks = dedupeLlmAuditUrls([...annotationUrls, ...urlsFromLlmAuditText(responseText)]);
    const webSearchUsed = annotations.length > 0 || liveLinks.length > 0 || Boolean(responseText);

    if (!responseText) {
      return {
        siteUrl,
        location,
        platforms: [
          {
            ...basePlatform,
            error: "OpenRouter returned empty content",
          },
        ],
      };
    }

    return {
      siteUrl,
      location,
      platforms: [
        {
          ...basePlatform,
          status: "ok",
          webSearchUsed,
          responseText,
          annotations: annotations.length ? annotations : undefined,
          liveLinks: liveLinks.length ? liveLinks : undefined,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      siteUrl,
      location,
      platforms: [
        {
          ...basePlatform,
          error: message,
        },
      ],
    };
  }
}

function qfoLlmAuditErrorPlatform(error: string): LlmAuditBrief["platforms"][number] {
  return {
    platform: "chat_gpt",
    label: LLM_AUDIT_OPENROUTER_LABEL,
    model_name: LLM_AUDIT_OPENROUTER_MODEL,
    status: "error",
    error,
  };
}

/** Localized QFO: plan city buyer questions, then OpenRouter web audit per question (no raw keyword seed). */
export async function fetchLlmAuditOpenRouterWithQfo(
  input: FetchLlmAuditOpenRouterQfoInput,
): Promise<LlmAuditOpenRouterQfoResult> {
  const keyword = input.keyword.trim();
  const siteUrl = input.siteUrl.trim();
  const location = (
    input.location ?? resolveFanoutLocationForResearch(input.site, keyword)
  ).trim();
  const companyName = input.companyName?.trim() || input.site?.name?.trim() || "";

  if (!companyName) {
    return {
      llmAudit: {
        siteUrl,
        location,
        focusKeyword: keyword,
        platforms: [qfoLlmAuditErrorPlatform("LLM audit QFO requires a connected company name")],
      },
    };
  }

  if (!location || !cityTokenFromLocation(location)) {
    return {
      llmAudit: {
        siteUrl,
        location,
        focusKeyword: keyword,
        platforms: [qfoLlmAuditErrorPlatform(TOPIC_RESEARCH_FANOUT_CITY_REQUIRED)],
      },
    };
  }

  const plan = await planTopicResearchQueries({
    keyword,
    title: input.title,
    companyName,
    location,
    siteId: input.site?.id,
    pageUrl: input.pageUrl?.trim() || siteUrl,
    metaDescription: input.metaDescription,
    pageExcerpt: input.pageExcerpt,
    serpPeopleAlsoAsk: input.serpPeopleAlsoAsk,
  });
  const researchQueries = plan.researchQueries;
  const namedPrograms = plan.namedPrograms;

  const platforms: LlmAuditBrief["platforms"] = [];
  const chatGptByQuery: NonNullable<QueryFanout["chatGptByQuery"]> = [];

  const qfoLimit = pLimit(LLM_AUDIT_QFO_QUERY_CONCURRENCY);
  const qfoResults = await Promise.all(
    researchQueries.map((query, queryIndex) =>
      qfoLimit(async () => {
        const audit = await fetchLlmAuditOpenRouter({
          keyword: query,
          siteUrl,
          site: input.site,
          location,
          platformLabel: query,
          userPrompt: buildLlmAuditQfoUserPrompt({
            researchQuery: query,
            focusKeyword: keyword,
            location,
          }),
        });
        return { queryIndex, query, audit };
      }),
    ),
  );
  qfoResults.sort((a, b) => a.queryIndex - b.queryIndex);
  for (const { query, audit } of qfoResults) {
    const platform = audit.platforms[0];
    if (!platform) continue;
    platforms.push(platform);
    if (platform.status === "ok" && platform.responseText?.trim()) {
      chatGptByQuery.push({ query, responseText: platform.responseText.trim() });
    }
  }

  const researchAsOf = plan.researchAsOf ?? formatResearchAsOfLabel(new Date());
  let factualVerificationQueries: string[] | undefined;
  let verifiedFacts: QueryFanout["verifiedFacts"];
  let verificationSerpRows: NonNullable<QueryFanout["serpByQuery"]> = [];
  if (cityTokenFromLocation(location) && !isDfsPaymentLatched()) {
    const verification = await runFactualVerificationPass({
      keyword,
      title: input.title,
      location,
      researchAsOf,
      pageExcerpt: input.pageExcerpt,
      serpPeopleAlsoAsk: input.serpPeopleAlsoAsk,
      site: input.site,
      siteId: input.site?.id,
    });
    if (verification.factualVerificationQueries.length) {
      factualVerificationQueries = verification.factualVerificationQueries;
      verifiedFacts = verification.verifiedFacts;
      verificationSerpRows = verification.verificationSerpRows;
    }
  }

  const queryFanout: QueryFanout = {
    queries: researchQueries,
    namedPrograms,
    plannerModel: plan.plannerModel,
    plannedAt: plan.plannedAt,
    researchAsOf,
    illustrativeExampleQuery: plan.illustrativeExampleQuery,
    programStatusQuery: plan.programStatusQuery,
    factualVerificationQueries,
    verifiedFacts,
    serpByQuery: verificationSerpRows.length ? verificationSerpRows : undefined,
    chatGptByQuery,
  };

  let queryFanoutWithIllustrative = queryFanout;
  if (plan.illustrativeExampleQuery?.trim()) {
    const illustrativeExample = await extractIllustrativeExample({
      keyword,
      location,
      researchAsOf,
      illustrativeExampleQuery: plan.illustrativeExampleQuery,
      companyName,
      serpByQuery: queryFanout.serpByQuery,
      chatGptByQuery,
      pageTitle: input.title,
      pageExcerpt: input.pageExcerpt,
      siteId: input.site?.id,
      site: input.site,
    });
    queryFanoutWithIllustrative = { ...queryFanout, illustrativeExample };
  }

  return {
    llmAudit: {
      siteUrl,
      location,
      focusKeyword: keyword,
      queryFanout: queryFanoutWithIllustrative,
      platforms,
    },
    queryFanout: queryFanoutWithIllustrative,
  };
}
