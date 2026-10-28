import type { WordPressSite } from "@/components/integrations/types";
import type { SeoContentBriefV1, LlmAuditBrief } from "@/lib/overview-seo-content-brief";
import {
  dataforseoLlmResponsesLive,
  isDataForSeoPaymentFailure,
  isDfsLlmPaymentSkip,
  isDfsLlmSkipped,
  isDfsPaymentLatched,
} from "@/lib/llm-audit/dataforseo-llm-responses-live";
import {
  LLM_AUDIT_COMPANY_AUTHORITY_SYSTEM,
  LLM_AUDIT_SYSTEM_MESSAGE,
  buildLlmAuditUserPromptFull,
} from "@/lib/llm-audit/llm-audit-prompts";
import {
  dedupeLlmAuditUrls,
  urlsFromLlmAuditText,
} from "@/lib/llm-audit/llm-audit-url-utils";
import {
  resolveSiteLocationLabel,
  webSearchCityFromLocation,
  webSearchCountryIsoFromLocation,
} from "@/lib/llm-audit/resolve-site-location-label";
import {
  fetchLlmAuditOpenRouter,
  LLM_AUDIT_OPENROUTER_MODEL,
  LLM_AUDIT_OPENROUTER_TIMEOUT_MS,
} from "@/lib/llm-audit/llm-audit-openrouter";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";

export type LlmAuditPlatform = "chat_gpt" | "gemini" | "perplexity";

export type LlmAuditPlatformResult = LlmAuditBrief["platforms"][number];

const PLATFORM_CONFIG: Array<{
  platform: LlmAuditPlatform;
  label: string;
  model_name: string;
  force_web_search: boolean;
  web_search_country_iso_code: boolean;
  web_search_city: boolean;
}> = [
  { platform: "chat_gpt", label: "ChatGPT", model_name: "gpt-4o-mini", force_web_search: false, web_search_country_iso_code: true, web_search_city: true },
  { platform: "gemini", label: "Gemini", model_name: "gemini-2.5-flash", force_web_search: false, web_search_country_iso_code: false, web_search_city: false },
  { platform: "perplexity", label: "Perplexity", model_name: "sonar", force_web_search: false, web_search_country_iso_code: false, web_search_city: false },
];

const PROMPT_MAX = 500;

/** DataForSEO LLM Responses Live max length for user_prompt, system_message, and message_chain messages. */
export const DATAFORSEO_LLM_PROMPT_MAX = PROMPT_MAX;

export function clipDataForSeoLlmPrompt(s: string, max = PROMPT_MAX): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function clipPrompt(s: string, max = PROMPT_MAX): string {
  return clipDataForSeoLlmPrompt(s, max);
}

export function buildLlmAuditUserPrompt(input: {
  platformLabel: string;
  keyword: string;
  location: string;
}): string {
  return clipPrompt(
    buildLlmAuditUserPromptFull({
      platformLabel: input.platformLabel,
      keyword: input.keyword,
      location: input.location,
    }),
  );
}

function chatGptPlatformConfig(): (typeof PLATFORM_CONFIG)[number] {
  const cfg = PLATFORM_CONFIG.find((c) => c.platform === "chat_gpt");
  if (!cfg) throw new Error("ChatGPT platform config missing");
  return cfg;
}

/** ChatGPT web-search prompt about this business. Stays under DataForSEO 500-char clip. */
export function buildChatGptCompanyAuthorityUserPrompt(input: {
  companyName: string;
  location: string;
  topic: string;
  namedProgram?: string;
  siteUrl?: string;
}): string {
  const company = input.companyName.trim();
  const location = input.location.trim() || "the service area";
  const topic = input.topic.trim();
  const siteUrl = input.siteUrl?.trim().replace(/\/+$/, "") ?? "";
  const siteBit = siteUrl ? ` Site ${siteUrl}.` : "";
  const program = input.namedProgram?.trim();
  const programBit = program ? ` Official program '${program}'.` : "";
  return clipPrompt(
    `${company} in ${location}.${siteBit} Topic '${topic}'.${programBit} Only this website. Ignore same-name firms elsewhere. Public facts for this topic. Address only if on this site. No invented numbers. Do not hunt sales, rebates, or promotions unless the topic is about those. One fact + https each.`,
  );
}

export function buildChatGptCompanyAuthorityTask(input: {
  companyName: string;
  location: string;
  topic: string;
  namedProgram?: string;
  siteUrl?: string;
}): Record<string, unknown> {
  const cfg = chatGptPlatformConfig();
  const location = input.location.trim();
  const task: Record<string, unknown> = {
    model_name: cfg.model_name,
    user_prompt: buildChatGptCompanyAuthorityUserPrompt(input),
    system_message: clipPrompt(LLM_AUDIT_COMPANY_AUTHORITY_SYSTEM),
    web_search: true,
  };
  const iso = webSearchCountryIsoFromLocation(location);
  const city = webSearchCityFromLocation(location);
  if (cfg.web_search_country_iso_code && iso) task.web_search_country_iso_code = iso;
  if (cfg.web_search_city && city) task.web_search_city = city;
  return task;
}

async function fetchChatGptCompanyAuthorityViaOpenRouter(input: {
  companyName: string;
  location: string;
  topic: string;
  namedProgram?: string;
  siteUrl?: string;
}): Promise<LlmAuditPlatformResult> {
  const cfg = chatGptPlatformConfig();
  const base: LlmAuditPlatformResult = {
    platform: "chat_gpt",
    label: cfg.label,
    model_name: LLM_AUDIT_OPENROUTER_MODEL,
    status: "error",
  };
  try {
    const apiKey = await resolveOpenRouterApiKeyForHarness();
    const user = buildChatGptCompanyAuthorityUserPrompt(input);
    const { content } = await postOpenRouterAppChat({
      apiKey,
      model: LLM_AUDIT_OPENROUTER_MODEL,
      system: LLM_AUDIT_COMPANY_AUTHORITY_SYSTEM,
      user,
      maxTokens: 2048,
      temperature: 0.5,
      signal: AbortSignal.timeout(LLM_AUDIT_OPENROUTER_TIMEOUT_MS),
    });
    const responseText = content.trim();
    if (!responseText) {
      return { ...base, error: "OpenRouter returned empty content" };
    }
    const liveLinks = dedupeLlmAuditUrls(urlsFromLlmAuditText(responseText));
    return {
      ...base,
      status: "ok",
      webSearchUsed: liveLinks.length > 0 || Boolean(responseText),
      responseText,
      liveLinks: liveLinks.length ? liveLinks : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, error: message };
  }
}

export async function fetchChatGptCompanyAuthority(input: {
  companyName: string;
  location: string;
  topic: string;
  namedProgram?: string;
  siteUrl?: string;
  callLlm?: typeof dataforseoLlmResponsesLive;
}): Promise<LlmAuditPlatformResult> {
  const cfg = chatGptPlatformConfig();
  const callLlm = input.callLlm ?? dataforseoLlmResponsesLive;
  const task = buildChatGptCompanyAuthorityTask(input);
  let dfsJson: unknown;
  try {
    dfsJson = await callLlm({
      platform: "chat_gpt",
      ...task,
    } as Parameters<typeof dataforseoLlmResponsesLive>[0]);
  } catch {
    return fetchChatGptCompanyAuthorityViaOpenRouter(input);
  }
  if (isDfsLlmSkipped(dfsJson) || isDataForSeoPaymentFailure({ json: dfsJson })) {
    return fetchChatGptCompanyAuthorityViaOpenRouter(input);
  }
  const result = extractLlmAuditPlatformResult("chat_gpt", cfg.label, cfg.model_name, dfsJson);
  if (result.status !== "ok" || !result.responseText?.trim()) {
    return fetchChatGptCompanyAuthorityViaOpenRouter(input);
  }
  return result;
}

/** Shared anti-repetition rules for checklist / blueprint / harness prompts. */
export const LLM_AUDIT_ANTI_REPETITION_RULES = `- **Never create new H2 sections or checklist items for audit facts.** Weave at most one assigned fact into the current section only.
- Assign each audit fact to exactly ONE section of the article; never repeat the same nickname, landmark, or habit in another section.
- At most one audit fact per section unless the section block explicitly assigns more.
- Voice: practical local explaining tradeoffs, not marketing filler. Forbidden padding: "community spirit", "distinct character", "enhance your living space", "proud to serve", "unique needs of homes in the area".
- Use exact local names when assigned (e.g. The Avenue, the Cove, Alty). Do not invent stats or businesses.
- Prefer weaving audit facts as decision, tradeoff, or process detail inside the assigned section. Do not add H2s.`;

export function buildLlmAuditTask(
  cfg: (typeof PLATFORM_CONFIG)[number],
  input: { keyword: string; location: string },
): Record<string, unknown> {
  const task: Record<string, unknown> = {
    model_name: cfg.model_name,
    user_prompt: buildLlmAuditUserPrompt({
      platformLabel: cfg.label,
      keyword: input.keyword,
      location: input.location,
    }),
    system_message: clipPrompt(LLM_AUDIT_SYSTEM_MESSAGE),
    web_search: true,
  };
  if (cfg.force_web_search) {
    task.force_web_search = true;
  }
  const iso = webSearchCountryIsoFromLocation(input.location);
  const city = webSearchCityFromLocation(input.location);
  if (cfg.web_search_country_iso_code && iso) task.web_search_country_iso_code = iso;
  if (cfg.web_search_city && city) task.web_search_city = city;
  return task;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

export function extractLlmAuditPlatformResult(
  platform: LlmAuditPlatform,
  label: string,
  model_name: string,
  dfsJson: unknown,
): LlmAuditPlatformResult {
  const base: LlmAuditPlatformResult = {
    platform,
    label,
    model_name,
    status: "error",
  };

  if (!dfsJson || typeof dfsJson !== "object") {
    return { ...base, error: "Empty response" };
  }

  const root = dfsJson as Record<string, unknown>;
  if (typeof root.error === "string" && root.error.trim() && !Array.isArray(root.tasks)) {
    return { ...base, error: root.error.trim() };
  }
  const task = Array.isArray(root.tasks) ? (root.tasks[0] as Record<string, unknown> | undefined) : undefined;
  if (!task) {
    return { ...base, error: str(root.status_message) || "No task in response" };
  }

  const taskCode = typeof task.status_code === "number" ? task.status_code : 0;
  if (taskCode !== 20000) {
    return { ...base, error: str(task.status_message) || `Task status ${taskCode}` };
  }

  const result0 = Array.isArray(task.result)
    ? (task.result[0] as Record<string, unknown> | undefined)
    : undefined;
  if (!result0) {
    return { ...base, error: "No result in task" };
  }

  const textParts: string[] = [];
  const annotations: Array<{ title?: string; url?: string }> = [];
  const items = Array.isArray(result0.items) ? result0.items : [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.type === "message" && Array.isArray(item.sections)) {
      for (const sec of item.sections) {
        if (!sec || typeof sec !== "object") continue;
        const s = sec as Record<string, unknown>;
        if (s.type === "text" && typeof s.text === "string" && s.text.trim()) {
          textParts.push(s.text.trim());
        }
      }
    }
    if (Array.isArray(item.annotations)) {
      for (const ann of item.annotations) {
        if (!ann || typeof ann !== "object") continue;
        const a = ann as Record<string, unknown>;
        const url = str(a.url);
        if (url) annotations.push({ title: str(a.title), url });
      }
    }
  }

  const responseText = textParts.join("\n\n").trim();
  const annotationUrls = annotations.map((a) => a.url).filter(Boolean) as string[];
  const liveLinks = dedupeLlmAuditUrls([...annotationUrls, ...urlsFromLlmAuditText(responseText)]);
  const webSearchUsed =
    result0.web_search === true || annotations.length > 0 || liveLinks.length > 0;

  return {
    platform,
    label,
    model_name: str(result0.model_name) || model_name,
    status: responseText ? "ok" : "error",
    webSearchUsed,
    responseText: responseText || undefined,
    annotations: annotations.length ? annotations : undefined,
    liveLinks: liveLinks.length ? liveLinks : undefined,
    input_tokens: typeof result0.input_tokens === "number" ? result0.input_tokens : undefined,
    output_tokens: typeof result0.output_tokens === "number" ? result0.output_tokens : undefined,
    cost: typeof task.cost === "number" ? task.cost : undefined,
    error: responseText ? undefined : "No message text in response",
  };
}

export type FetchLlmAuditInput = {
  keyword: string;
  siteUrl: string;
  site?: WordPressSite | null;
  location?: string;
  onProgress?: (message: string) => void;
};

export async function fetchLlmAuditParallel(
  input: FetchLlmAuditInput,
): Promise<LlmAuditBrief> {
  const keyword = input.keyword.trim();
  const siteUrl = input.siteUrl.trim();
  const location = (input.location ?? resolveSiteLocationLabel(input.site, keyword)).trim();

  if (isDfsPaymentLatched()) {
    input.onProgress?.("DataForSEO LLM unavailable; OpenRouter web audit…");
    const orBrief = await fetchLlmAuditOpenRouter({
      keyword,
      siteUrl,
      site: input.site,
      location,
    });
    return {
      siteUrl,
      location,
      focusKeyword: keyword,
      platforms: orBrief.platforms,
      queryFanout: orBrief.queryFanout,
    };
  }

  input.onProgress?.("Live audit: ChatGPT, Gemini, Perplexity…");
  const platformResults = await Promise.all(
    PLATFORM_CONFIG.map(async (cfg) => {
      if (isDfsPaymentLatched()) {
        return {
          platform: cfg.platform,
          label: cfg.label,
          model_name: cfg.model_name,
          status: "error" as const,
        };
      }
      try {
        const task = buildLlmAuditTask(cfg, { keyword, location });
        const dfsJson = await dataforseoLlmResponsesLive({
          platform: cfg.platform,
          model_name: cfg.model_name,
          user_prompt: String(task.user_prompt ?? ""),
          system_message: String(task.system_message ?? ""),
          web_search: true,
          force_web_search: task.force_web_search === true ? true : undefined,
          web_search_country_iso_code:
            typeof task.web_search_country_iso_code === "string"
              ? task.web_search_country_iso_code
              : undefined,
          web_search_city: typeof task.web_search_city === "string" ? task.web_search_city : undefined,
        });
        if (isDfsLlmSkipped(dfsJson) || isDataForSeoPaymentFailure({ json: dfsJson })) {
          return {
            platform: cfg.platform,
            label: cfg.label,
            model_name: cfg.model_name,
            status: "error" as const,
          };
        }
        const result = extractLlmAuditPlatformResult(cfg.platform, cfg.label, cfg.model_name, dfsJson);
        if (result.status === "ok") {
          input.onProgress?.(`Live audit: ${cfg.label} ok`);
          return result;
        }
        return {
          platform: cfg.platform,
          label: cfg.label,
          model_name: cfg.model_name,
          status: "error" as const,
        };
      } catch {
        return {
          platform: cfg.platform,
          label: cfg.label,
          model_name: cfg.model_name,
          status: "error" as const,
        };
      }
    }),
  );
  const platforms = platformResults;

  const dfsOkCount = platforms.filter((p) => p.status === "ok").length;
  if (dfsOkCount === 0) {
    input.onProgress?.("DataForSEO LLM unavailable; OpenRouter web audit…");
    const orBrief = await fetchLlmAuditOpenRouter({
      keyword,
      siteUrl,
      site: input.site,
      location,
    });
    return {
      siteUrl,
      location,
      focusKeyword: keyword,
      platforms: orBrief.platforms,
      queryFanout: orBrief.queryFanout,
    };
  }

  return { siteUrl, location, focusKeyword: keyword, platforms };
}

/** Guidance text only — strips verification URLs for content generation. */
export function llmAuditGuidanceFromBrief(brief: SeoContentBriefV1 | null): string {
  const platforms = brief?.llmAudit?.platforms ?? [];
  if (!platforms.length) return "";
  const blocks: string[] = [];
  for (const p of platforms) {
    if (p.platform === "claude") continue;
    if (p.status !== "ok" || !p.responseText?.trim()) continue;
    blocks.push(`## ${p.label}\n${p.responseText.trim()}`);
  }
  return blocks.join("\n\n");
}

function splitLlmAuditResponseIntoFacts(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const bulletSplit = trimmed
    .split(/\.\s*-\s*|\n\s*-\s+/)
    .map((chunk) => chunk.replace(/^[\s\-•\\]+/, "").replace(/\.$/, "").trim())
    .filter((chunk) => chunk.length >= 20);
  if (bulletSplit.length > 1) return bulletSplit;
  return trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s.length >= 25);
}

/** Deterministic checklist lines from platform audit bullets (no OpenRouter summarize). */
export function llmAuditChecklistItemsFromBrief(brief: SeoContentBriefV1 | null): string[] {
  const platforms = brief?.llmAudit?.platforms ?? [];
  const items: string[] = [];
  const seen = new Set<string>();
  for (const p of platforms) {
    if (p.platform === "claude") continue;
    if (p.status !== "ok" || !p.responseText?.trim()) continue;
    for (const fact of splitLlmAuditResponseIntoFacts(p.responseText)) {
      const key = fact.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(fact);
      if (items.length >= 7) return items;
    }
  }
  return items;
}

/** Mandatory harness/checklist block — resident facts must appear in section copy. */
export function formatLlmAuditHarnessPromptBlock(guidance: string): string {
  const body = guidance.trim();
  if (!body) return "";
  return `
--- LLM AUDIT REFERENCE (section-scoped — use sparingly) ---
Shared research pool from multi-platform local audit. Use facts ONLY when assigned in your SECTION TO WRITE block (agent description / Key points). If no audit fact is assigned to this section, use zero audit facts here.

${body}

Rules:
${LLM_AUDIT_ANTI_REPETITION_RULES}
--- END LLM AUDIT REFERENCE ---
`;
}
