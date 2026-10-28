import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { aiFilterAllowedBrandTexts } from "@/lib/content-brand-ai-gate";
import { GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK } from "@/lib/content-topic-blocklist";
import { getResearchModel } from "@/lib/optimization-settings-storage";

const GSC_INVENTORY_EXCLUSION = `INVENTORY EXCLUSION (mandatory when SITE_INVENTORY_JSON is present):
- Read every post title, slug, and URL in SITE_INVENTORY_JSON.posts (and pages/sap if present).
- For each candidate GSC line, ask: would a new post on this keyword compete with an existing post?
- If yes (same topic/intent), SKIP that line entirely. Examples:
  - GSC "national seo" + inventory slug "national-seo-canada" or title "National SEO Strategy..." → SKIP
  - GSC "digital marketing for a blinds company" + existing blinds marketing posts → SKIP
- Pick net-new opportunities only from uncovered GSC lines.
- Distill chosen lines into short-tail keywords that do NOT overlap inventory intent.
- Return fewer keywords rather than cannibalizing existing posts.`;

const SYSTEM = `You are a blog keyword research agent.

You MUST read SITE_KW_JSON first. It contains GSC keyword lists for the target site.
Metrics were already used locally to sort the lists, then removed to save tokens.

When SITE_INVENTORY_JSON is present, read it before selecting any keyword.
${GSC_INVENTORY_EXCLUSION}

Read CONNECTED_SITE. Infer market jurisdiction only from that data (name, URL, NAP city/state). Never invent an unrelated market. Never assume a hardcoded country.

Goal: return exactly numberOfBlogs blog keywords when enough unique usable ones exist in the lists that do NOT cannibalize inventory.

${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}

Selection rules:
- Source first: each keyword MUST be derived from an entry in the lists that passes inventory exclusion. Only invent a new keyword when the lists cannot supply enough unique usable ones.
- Prefer earlier GSC entries (already sorted by opportunity).
- Keep only informational and transactional intent. Drop navigational and branded queries.
- **NEVER return the CONNECTED_SITE trading / company name** (fuzzy / word-reorder — e.g. "Blind Magic" ↔ "Magic Blinds"). Keep product/service keywords and dealer product lines (Hunter Douglas, Alta, etc.).
- Distill long-tail or question phrases into complete short-tail intent keywords. Do NOT truncate mechanically. Remove question wrappers like "how much does", "how much do", "what is", "where to", "can I", and keep the full product/service + intent core.
- Examples: "how much do solar panels cost in alberta" -> "solar panels cost"; "how much does it cost to install solar panels" -> "solar panel installation cost"; "how much is solar energy" -> "solar energy cost". Bad: "how much do solar energy", "how much do solar panels", "cost of solar panels edmonton".
- Two geo paths (understand meaning; do not pattern-match):
  1. Local / near-me / installer-in-city / service-proximity: trim city, neighborhood, "near me", and similar. Keep product/service + intent only. Short-tail: 2-3 words.
  2. Government / policy / incentives / grants / rebates / regulations / tax credits: ALWAYS include jurisdiction. Infer country (and federal vs provincial/state when the query clearly needs it) from CONNECTED_SITE only. Good: "federal solar incentives canada". Bad: "solar incentives" (missing jurisdiction). Allow 3-5 words when jurisdiction is required.
- Unique only: no duplicates and no two keywords that target the same search intent (no cannibalization). Merge near-duplicates into one.
- No keyword may overlap search intent with any SITE_INVENTORY_JSON post title or slug.
- If topic is provided, every keyword must fit that topic; otherwise trim or replace it.
- Return at most numberOfBlogs keywords. Never more. Never dump the product catalog. If numberOfBlogs is 2, return 2 strings and stop. Return [] when the JSON has no useful data.

JSON contract (mandatory, last): output one object only. Double-quoted keys. No markdown fences. No extra keys. Exact shape:
{"keywords":["..."]}`;

type AgentResponse = {
  keywords?: unknown;
};

export type PromptBulkKwConnectedSiteContext = {
  name: string;
  siteUrl: string;
  city?: string;
  state?: string;
};

function cleanKeyword(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

export function buildLowHangingKeywordsResponseFormat(limit: number): {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
} {
  const maxItems = Math.max(1, Math.min(50, Math.floor(limit) || 1));
  return {
    type: "json_schema",
    json_schema: {
      name: "prompt_bulk_low_hanging_keywords",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["keywords"],
        properties: {
          keywords: {
            type: "array",
            maxItems,
            items: { type: "string" },
          },
        },
      },
    },
  };
}

function parseKeywords(raw: string, limit: number): string[] {
  let parsed: AgentResponse;
  try {
    parsed = JSON.parse(raw) as AgentResponse;
  } catch {
    throw new Error(
      `Keyword research agent returned invalid JSON (expected {"keywords":["..."]}). Got: ${raw.slice(0, 240)}`,
    );
  }
  if (!Array.isArray(parsed.keywords)) {
    throw new Error("Keyword research agent returned JSON without a keywords array");
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed.keywords) {
    const keyword = cleanKeyword(item);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildPromptBulkKwConnectedSiteContext(site: {
  name?: string;
  siteUrl?: string;
  locations?: Array<{ city?: string; state?: string; isDefault?: boolean }>;
  napInfo?: { locations?: Array<{ city?: string; state?: string; isDefault?: boolean }> };
}): PromptBulkKwConnectedSiteContext | null {
  const name = typeof site.name === "string" ? site.name.trim() : "";
  const siteUrl = typeof site.siteUrl === "string" ? site.siteUrl.trim() : "";
  if (!name && !siteUrl) return null;

  const locs = [
    ...(Array.isArray(site.locations) ? site.locations : []),
    ...(Array.isArray(site.napInfo?.locations) ? site.napInfo.locations : []),
  ];
  const preferred = locs.find((l) => l?.isDefault) ?? locs[0];
  const city = typeof preferred?.city === "string" ? preferred.city.trim() : "";
  const state = typeof preferred?.state === "string" ? preferred.state.trim() : "";

  return {
    name: name || siteUrl,
    siteUrl: siteUrl || name,
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  };
}

export async function selectPromptBulkLowHangingKeywords(args: {
  apiKey: string;
  siteId?: string;
  keywordsJsonText: string;
  numberOfBlogs: number;
  topic?: string;
  modifier?: string;
  inventoryUrlCount?: number | null;
  siteInventoryJson?: string;
  connectedSite?: PromptBulkKwConnectedSiteContext | null;
}): Promise<string[]> {
  const model = getResearchModel(args.siteId);
  const apiKey = args.apiKey.trim();
  const limit = Math.max(1, Math.min(50, Math.floor(args.numberOfBlogs) || 1));
  const jsonText = args.keywordsJsonText.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for keyword research.");
  }
  if (!jsonText) {
    throw new Error("Site keyword JSON is required for keyword research.");
  }

  const inventoryJson = args.siteInventoryJson?.trim();
  const userPayload: Record<string, unknown> = {
    numberOfBlogs: limit,
    topic: args.topic?.trim() || "",
    modifier: args.modifier?.trim() || "",
    inventoryUrlCount: args.inventoryUrlCount ?? null,
    CONNECTED_SITE: args.connectedSite ?? null,
    SITE_KW_JSON: JSON.parse(jsonText) as unknown,
  };
  if (inventoryJson) {
    userPayload.SITE_INVENTORY_JSON = JSON.parse(inventoryJson) as unknown;
  }

  const user = JSON.stringify(userPayload);

  const response = await postOpenRouterAppChat({
    apiKey,
    model,
    system: SYSTEM,
    user,
    maxTokens: Math.max(4096, limit * 256),
    temperature: 0.25,
    responseFormat: buildLowHangingKeywordsResponseFormat(limit),
  });

  const rawText =
    response.content.trim() ||
    (response.parsed ? JSON.stringify(response.parsed) : "");
  if (!rawText) {
    const finish = response.finishReason ?? response.nativeFinishReason ?? "unknown";
    throw new Error(`Keyword research agent returned no JSON (finish_reason=${finish}).`);
  }

  const parsed = parseKeywords(rawText, limit);
  const companyName = args.connectedSite?.name?.trim() || "";
  if (!companyName) return parsed;
  const allowed = await aiFilterAllowedBrandTexts({
    apiKey,
    model: getResearchModel(args.siteId),
    companyName,
    candidates: parsed,
    kind: "keyword",
  });
  return allowed.slice(0, limit);
}
