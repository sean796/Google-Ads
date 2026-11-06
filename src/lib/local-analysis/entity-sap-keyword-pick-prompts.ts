import {
  brandExclusionPhrasesFromNames,
} from "@/lib/bulk/bulk-gsc-site-queries";
import {
  gscQueryMatchesTradingName,
  stripTradingNameFromPhrase,
} from "@/lib/sap-brand-and-brevity";
import { GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK } from "@/lib/content-topic-blocklist";
import { isOffensiveGscQuery } from "@/lib/gsc-offensive-word-blocklist";
import { isLeakedInstructionEntityLabel } from "@/lib/local-analysis/entity-label-guards";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { stripAllPlaceTokensFromKeyword } from "@/lib/local-analysis/entity-sap-keyword-place-tokens";

const CLIENT_AWARE_SAP_SERVICE_RULES = `
- Pick **services the client actually offers** (from \`clientAudienceContextMarkdown\`, site inventory, and \`seedKeywords\` when present).
- Prefer transactional **client service lines** (e.g. tax preparation, bookkeeping, corporate accounting, bare trust reporting).
- Deprioritize generic informational queries (tax brackets, tax rates, income tax tables, provincial or federal reference lookups) unless they clearly map to a stated client service.
- Each base is a **2–3 word** service or product phrase only. Extract the service phrase from GSC; **never** return the full geographic GSC string as a base.
- Bad bases: "alberta tax brackets", "tax rates sherwood park", "blinds edmonton".
- Good bases: "tax preparation", "bookkeeping services", "bare trust reporting", "corporate accounting".`;

const GROUP_KEYWORDS_SYSTEM_BASE = `You assign focus keywords for **one entity ad group** of Local Analysis SAP landing pages.

Return **only** valid JSON: {"keywords":["..."]} with **exactly** \`count\` keywords.

Rules:
- Each keyword is the **full entity focus keyword** (service phrase + entity place). Every row in this ad group must have a **different keyword+entity pair** (case-insensitive). Duplicates across **other** ad groups are fine.
- Format: **2–3 word** service / product phrase only. Do **not** append city, neighbourhood, or province — code appends the AdGroup entity afterward.
${CLIENT_AWARE_SAP_SERVICE_RULES}
- Pick from **gscKeywords** (full site export). The same GSC phrase may appear in other ad groups with different entities. Within **this** group, each composed keyword+entity must differ from \`keywordsAlreadyUsedInGroup\`.
- When GSC runs out, invent distinct service angles from \`seedKeywords\` and site services (not the brand name).
- **NEVER** use the site's own trading name from \`siteName\` as the keyword (fuzzy / word-reorder matches).
- Never use vulgar, profane, or offensive language.
${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}
No markdown outside JSON.`;

const GROUP_KEYWORDS_INVENTORY_BLOCK = `
- **Existing SAP pages for this entity (mandatory):** Do not reuse any keyword, slug, or title angle already used for this place. Pick a different service or product line.
- Forbidden keywords (case-insensitive): any in \`blockedKeywords\`.
- Forbidden slugs: any in \`blockedSlugs\`.
- Forbidden titles: any in \`blockedTitles\`.
- See \`existingSapPagesForEntity\` for pages already live or scheduled for this entity.`;

const PICK_GSC_PRODUCT_BASES_SYSTEM_BASE = `You pick product/service keyword bases for Local Analysis SAP landing pages from a Google Search Console export.

Return **only** valid JSON: {"bases":["..."]} with **exactly** \`count\` strings.

Rules:
- Each base must come from **gscKeywords** (real GSC queries for this site).
${CLIENT_AWARE_SAP_SERVICE_RULES}
- Return **count** distinct bases when possible. Do not repeat the same base in the array.
- Do not use vulgar or offensive language.
${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}
No markdown outside JSON.`;

export type EntitySapKeywordPickPromptArgs = {
  mode: "pick" | "group";
  hasInventoryBlock?: boolean;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
};

export function buildEntitySapKeywordPickSystemPrompt(args: EntitySapKeywordPickPromptArgs): string {
  const base =
    args.mode === "pick" ? PICK_GSC_PRODUCT_BASES_SYSTEM_BASE : GROUP_KEYWORDS_SYSTEM_BASE;
  const inventory =
    args.mode === "group" && args.hasInventoryBlock ? GROUP_KEYWORDS_INVENTORY_BLOCK : "";
  const focus = args.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  const focusBlock = focus?.length ? `\n- **Entity type emphasis:** ${focus.join(", ")}` : "";
  const clientCtx = args.clientAudienceContextMarkdown?.trim();
  const clientBlock = clientCtx
    ? `\n--- Client & site context (pick services this client actually offers) ---\n${clientCtx}\n`
    : "";
  return `${base}${inventory}${focusBlock}${clientBlock}`;
}

export type EntitySapKeywordPickUserPayloadArgs = {
  siteName: string;
  siteUrl: string;
  entity: string;
  count: number;
  seedKeywords: string[];
  gscKeywords: string[];
  gridLocations: string[];
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  keywordPlace?: string;
  keywordsAlreadyUsedInGroup?: string[];
  existingSapPagesForEntity?: Array<{ title: string; keyword: string; slug: string }>;
  blockedSlugs?: string[];
  blockedKeywords?: string[];
  blockedTitles?: string[];
};

export function buildEntitySapKeywordPickUserPayload(args: EntitySapKeywordPickUserPayloadArgs): string {
  const payload: Record<string, unknown> = {
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    entity: args.entity,
    count: args.count,
    gscKeywords: args.gscKeywords,
    seedKeywords: args.seedKeywords,
    gridLocations: args.gridLocations,
  };
  if (args.keywordPlace) payload.keywordPlace = args.keywordPlace;
  if (args.keywordsAlreadyUsedInGroup) {
    payload.keywordsAlreadyUsedInGroup = args.keywordsAlreadyUsedInGroup;
  }
  if (args.existingSapPagesForEntity) {
    payload.existingSapPagesForEntity = args.existingSapPagesForEntity;
  }
  if (args.blockedSlugs) payload.blockedSlugs = args.blockedSlugs;
  if (args.blockedKeywords) payload.blockedKeywords = args.blockedKeywords;
  if (args.blockedTitles) payload.blockedTitles = args.blockedTitles;
  const clientCtx = args.clientAudienceContextMarkdown?.trim();
  if (clientCtx) payload.clientAudienceContextMarkdown = clientCtx;
  const focus = args.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  if (focus?.length) payload.entityTypeFocus = focus;
  return JSON.stringify(payload);
}

/** Strip place tokens from AI/GSC bases; pad only with stripped service phrases. */
export function padGscProductBasesFromCandidates(args: {
  bases: string[];
  count: number;
  gscKeywords: string[];
  entity: string;
  gridLocations: readonly string[];
  siteName?: string;
}): string[] {
  const brandPhrases = args.siteName?.trim()
    ? brandExclusionPhrasesFromNames(args.siteName)
    : [];
  const company = args.siteName?.trim() ?? "";
  const places = [args.entity, ...args.gridLocations].filter((p) => p.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of args.bases) {
    let stripped = stripAllPlaceTokensFromKeyword(raw, places).trim();
    if (company) {
      stripped = stripTradingNameFromPhrase(stripped, company);
    }
    if (!stripped || isRejectedEntitySapKeywordSync(stripped, company)) continue;
    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stripped);
  }
  let cursor = 0;
  while (out.length < args.count && args.gscKeywords.length > 0 && cursor < args.gscKeywords.length) {
    const candidate = args.gscKeywords[cursor]!;
    cursor += 1;
    let stripped = stripAllPlaceTokensFromKeyword(candidate, places).trim();
    if (company) {
      stripped = stripTradingNameFromPhrase(stripped, company);
    }
    if (!stripped || isRejectedEntitySapKeywordSync(stripped, company)) continue;
    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stripped);
  }
  return out.slice(0, args.count);
}

export async function postOpenRouter(args: {
  apiKey: string;
  model: string;
  siteId: string | undefined;
  messages: { role: string; content: string }[];
  temperature: number;
  topP: number;
}): Promise<string> {
  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(args.apiKey),
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
      top_p: args.topP,
      response_format: { type: "json_object" },
      stream: false,
    }),
  });
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) return "";
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return "";
  return content;
}

export function isRejectedEntitySapKeywordSync(keyword: string, siteName?: string): boolean {
  const k = keyword.trim();
  if (!k) return true;
  if (isLeakedInstructionEntityLabel(k)) return true;
  if (isOffensiveGscQuery(k)) return true;
  const company = siteName?.trim() ?? "";
  if (company && gscQueryMatchesTradingName(k, company, brandExclusionPhrasesFromNames(company))) {
    return true;
  }
  return false;
}
