import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { parseJsonStrict } from "@/lib/json-repair-utility";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import { dedupeLlmAuditUrls } from "@/lib/llm-audit/llm-audit-url-utils";
import { cityTokenFromLocation } from "@/lib/content-optimization/topic-research-fanout";

export const LLM_AUDIT_AUTHORITY_CLASSIFY_TEMPERATURE = 0.2;

export const LLM_AUDIT_AUTHORITY_MAX_LINKS = 6;

/** Max URLs sent to the classifier per post (avoids batching dozens of OpenRouter calls). */
export const LLM_AUDIT_AUTHORITY_MAX_CLASSIFY_INPUT = 12;

/** Keep batches small so structured JSON stays valid (no downstream repair). */
export const LLM_AUDIT_AUTHORITY_CLASSIFY_BATCH_SIZE = 5;

export const LLM_AUDIT_AUTHORITY_CATEGORIES = [
  "government",
  "municipal",
  "weather",
  "news",
  "bbb",
  "education",
  "association",
  "smb_competitor",
  "client_site",
  "other_commercial",
] as const;

export type LlmAuditAuthorityCategory = (typeof LLM_AUDIT_AUTHORITY_CATEGORIES)[number];

export type LlmAuditAuthorityLink = {
  url: string;
  anchorText: string;
  category: LlmAuditAuthorityCategory;
  reason?: string;
};

export const LLM_AUDIT_AUTHORITY_CLASSIFY_SYSTEM = `You classify third-party URLs for outbound authority citations in local service content.

Use ONLY the URL string (hostname, TLD, path). Do not invent page content.

Categories:
- government, municipal, weather, news, bbb, education, association: authority sources suitable for citations
- smb_competitor: same-industry local business, installer, dealer, or competitor
- client_site: the connected client's own website or subdomain
- other_commercial: generic commercial sites that are not authority sources

Set include true ONLY for authority categories (government, municipal, weather, news, bbb, education, association).
Set include false for smb_competitor, client_site, and other_commercial.

Prefer include when the service city appears in the hostname or path.
Exclude URLs on the connected client domain.
Exclude same-industry SMB or competitor domains relative to the connected company.

anchorText: short natural anchor (2-6 words) derived from the URL hostname/path only. For municipal or government hosts, prefer the city or region name (e.g. Edmonton) — never the bare domain.

OUTPUT CONTRACT (mandatory):
- Return JSON only, matching the provided schema exactly.
- The links array must contain exactly one object per input URL, in the same order as listed.
- Copy each url field exactly from the input list (same string, no edits).
- No markdown fences, no prose, no comments, no trailing commas.`;

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["links"],
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "category", "include", "anchorText", "reason"],
        properties: {
          url: { type: "string" },
          category: { type: "string" },
          include: { type: "boolean" },
          anchorText: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function registrableHost(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function collectLiveLinksFromBrief(brief: SeoContentBriefV1 | null | undefined): string[] {
  if (!brief?.llmAudit?.platforms?.length) return [];
  const raw: string[] = [];
  for (const platform of brief.llmAudit.platforms) {
    if (platform.status !== "ok") continue;
    for (const url of platform.liveLinks ?? []) {
      if (url?.trim()) raw.push(url.trim());
    }
    for (const ann of platform.annotations ?? []) {
      if (ann.url?.trim()) raw.push(ann.url.trim());
    }
  }
  return dedupeLlmAuditUrls(raw);
}

export function filterOwnSiteLiveLinks(urls: string[], siteUrl: string | undefined): string[] {
  const siteHost = siteUrl ? registrableHost(siteUrl) : "";
  if (!siteHost) return urls;
  return urls.filter((url) => registrableHost(url) !== siteHost);
}

function normalizeClassifiedLink(raw: unknown): LlmAuditAuthorityLink | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.include !== true) return null;
  const url = String(rec.url ?? "").trim();
  const anchorText = String(rec.anchorText ?? "").trim();
  const category = String(rec.category ?? "").trim() as LlmAuditAuthorityCategory;
  if (!url || !anchorText) return null;
  if (!LLM_AUDIT_AUTHORITY_CATEGORIES.includes(category)) return null;
  if (category === "smb_competitor" || category === "client_site" || category === "other_commercial") {
    return null;
  }
  const reason = String(rec.reason ?? "").trim();
  return {
    url,
    anchorText,
    category,
    ...(reason ? { reason } : {}),
  };
}

export type LlmAuditClassifierJsonFailure = {
  rawText: string;
  error: string;
  repairSteps: string[];
};

export function normalizeClassifiedAuthorityLinks(raw: unknown, inputUrls: string[]): LlmAuditAuthorityLink[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("LLM audit authority classifier returned invalid JSON");
  }
  const linksRaw = (raw as { links?: unknown }).links;
  if (!Array.isArray(linksRaw)) {
    throw new Error("LLM audit authority classifier returned no links array");
  }
  const allowed = new Set(inputUrls.map((u) => u.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: LlmAuditAuthorityLink[] = [];
  for (const item of linksRaw) {
    const link = normalizeClassifiedLink(item);
    if (!link) continue;
    const key = link.url.trim().toLowerCase();
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(link);
    if (out.length >= LLM_AUDIT_AUTHORITY_MAX_LINKS) break;
  }
  return out;
}

function reportClassifierJsonFailure(
  onFailure: ((detail: LlmAuditClassifierJsonFailure) => void) | undefined,
  detail: LlmAuditClassifierJsonFailure,
): void {
  onFailure?.(detail);
}

function safeNormalizeClassifiedAuthorityLinks(
  raw: unknown,
  inputUrls: string[],
  onFailure?: (detail: LlmAuditClassifierJsonFailure) => void,
): LlmAuditAuthorityLink[] {
  try {
    return normalizeClassifiedAuthorityLinks(raw, inputUrls);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    reportClassifierJsonFailure(onFailure, {
      rawText: typeof raw === "string" ? raw : JSON.stringify(raw ?? null),
      error,
      repairSteps: [],
    });
    return [];
  }
}

function parseClassifierJson(
  content: string,
  onFailure?: (detail: LlmAuditClassifierJsonFailure) => void,
): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) {
    onFailure?.({ rawText: "", error: "empty content", repairSteps: [] });
    return null;
  }
  try {
    return parseJsonStrict(trimmed);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (onFailure) {
      onFailure({ rawText: trimmed, error, repairSteps: [] });
      return null;
    }
    throw new Error(`LLM audit authority classifier returned invalid JSON (${error})`);
  }
}

async function classifyLlmAuditAuthorityLinkBatchOpenRouter(input: {
  urls: string[];
  siteUrl?: string;
  companyName?: string;
  location?: string;
  siteId?: string;
  onClassifierJsonFailure?: (detail: LlmAuditClassifierJsonFailure) => void;
}): Promise<LlmAuditAuthorityLink[]> {
  const urls = [...new Set(input.urls.map((u) => u.trim()).filter(Boolean))];
  if (urls.length === 0) return [];

  const city = cityTokenFromLocation(input.location ?? "");
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const model = getResearchModel(input.siteId);
  const { content, parsed: structuredParsed } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: LLM_AUDIT_AUTHORITY_CLASSIFY_SYSTEM,
    user: [
      `Connected company: ${(input.companyName ?? "").trim() || "(unknown)"}`,
      `Connected site: ${(input.siteUrl ?? "").trim() || "(unknown)"}`,
      city ? `Service city: ${city}` : "",
      input.location?.trim() ? `Location label: ${input.location.trim()}` : "",
      "",
      `Classify exactly ${urls.length} URL(s). Return links with exactly ${urls.length} objects in this order.`,
      "Each links[].url must match the input string exactly.",
      "",
      ...urls.map((url, i) => `${i + 1}. ${url}`),
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: getCompetitorReportMaxOutputTokens(model),
    temperature: LLM_AUDIT_AUTHORITY_CLASSIFY_TEMPERATURE,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "llm_audit_authority_links", strict: true, schema: CLASSIFY_SCHEMA },
    },
  });

  if (structuredParsed != null && typeof structuredParsed === "object") {
    return safeNormalizeClassifiedAuthorityLinks(
      structuredParsed,
      urls,
      input.onClassifierJsonFailure,
    );
  }
  const parsed = parseClassifierJson(content, input.onClassifierJsonFailure);
  if (parsed == null) return [];
  return safeNormalizeClassifiedAuthorityLinks(parsed, urls, input.onClassifierJsonFailure);
}

export async function classifyLlmAuditAuthorityLinksOpenRouter(input: {
  urls: string[];
  siteUrl?: string;
  companyName?: string;
  location?: string;
  siteId?: string;
  onClassifierJsonFailure?: (detail: LlmAuditClassifierJsonFailure) => void;
}): Promise<LlmAuditAuthorityLink[]> {
  const urls = [...new Set(input.urls.map((u) => u.trim()).filter(Boolean))];
  if (urls.length === 0) return [];

  const merged: LlmAuditAuthorityLink[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < urls.length; i += LLM_AUDIT_AUTHORITY_CLASSIFY_BATCH_SIZE) {
    const batch = urls.slice(i, i + LLM_AUDIT_AUTHORITY_CLASSIFY_BATCH_SIZE);
    const classified = await classifyLlmAuditAuthorityLinkBatchOpenRouter({
      ...input,
      urls: batch,
      onClassifierJsonFailure: input.onClassifierJsonFailure,
    });
    for (const link of classified) {
      const key = link.url.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(link);
      if (merged.length >= LLM_AUDIT_AUTHORITY_MAX_LINKS) {
        return merged;
      }
    }
  }

  return merged;
}

export async function resolveLlmAuditAuthorityLinksForChecklist(input: {
  brief: SeoContentBriefV1 | null | undefined;
  siteUrl?: string;
  companyName?: string;
  location?: string;
  siteId?: string;
  onClassifierJsonFailure?: (detail: LlmAuditClassifierJsonFailure) => void;
}): Promise<LlmAuditAuthorityLink[]> {
  const collected = collectLiveLinksFromBrief(input.brief);
  const filtered = filterOwnSiteLiveLinks(collected, input.siteUrl).slice(
    0,
    LLM_AUDIT_AUTHORITY_MAX_CLASSIFY_INPUT,
  );
  if (filtered.length === 0) return [];

  return classifyLlmAuditAuthorityLinksOpenRouter({
    urls: filtered,
    siteUrl: input.siteUrl,
    companyName: input.companyName,
    location: input.location,
    siteId: input.siteId,
    onClassifierJsonFailure: input.onClassifierJsonFailure,
  });
}
