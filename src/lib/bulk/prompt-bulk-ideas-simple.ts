import type { CSVRow } from "@/lib/bulk-auto-generate";
import type { BulkSitemapScopeTag } from "@/lib/bulk/bulk-sitemap-mode";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import type { PromptBulkKwConnectedSiteContext } from "@/lib/bulk/prompt-bulk-kw-research-agent";
import { appendUniversalContentRulesToSystemPrompt } from "@/lib/content-word-blocklist";
import { GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK } from "@/lib/content-topic-blocklist";
import { BENCHMARK_SITE_INVENTORY_CANNIBALIZATION } from "@/lib/vertical-benchmark/vertical-benchmark-inventory-cannibal";

const PROMPT_IDEAS_GSC_IN_USER = 500;

const POSTS_SCOPE_IDEAS_HINT = `When contentScope includes "posts":
- keyword must be geography-free (no city, province, state, region, or country names). Put location in title if needed.
- Each idea in the batch must target a different search intent (no overlapping angles).`;

const INVENTORY_EXCLUSION = `SITE_INVENTORY_JSON (mandatory read before any idea):
- Structure: pages.posts[], posts.posts[], sap.posts[] — each entry has slug, title, link.
- **URL slugs are owned keywords.** Hyphenated slugs (e.g. national-seo, digital-marketing, seo-vs-magazine-ads) are live topics. Do not propose keywords or titles that target the same search intent, head terms, or comparison axis as any slug or title.
- Read every slug, title, and link path. Map slug segments to phrases (national-seo → "national seo"). If inventory already covers an topic, pivot to a **distinct** intent (different subtopic, audience, or format) with zero overlap — not a rewrite, subtitle swap, or synonym.
- GSC_TOP_500 is inspiration only. Skip any GSC line whose intent is already owned by inventory. Never copy inventory titles or slug topics into new ideas.
- Prefer net-new gaps that fit the user topic and do not compete with any published URL.
- Output the full requested count in one response. Every row must be distinct from inventory and from every other row in your batch.`;

function buildPromptBulkIdeasSystemPrompt(): string {
  const base = `You draft blog post ideas for human approval. No SERP fetch. Output keyword and title per idea (meta descriptions are written separately).

Rules:
- Return exactly the requested count.
- keyword: short SEO focus phrase (2–5 words), intent-only. Not the full headline. Never include guide, listicle, buying guide, or how-to wrapper words in keyword (those belong in title only).
- title: complete headline, Title Case, readable and specific.
- When a topic is given, every idea must fit that topic without re-covering inventory topics.
- When a slot already has a keyword, keep that keyword and write a title for it.
- When CONNECTED_SITE is present, SITE_INVENTORY_JSON in the user message is mandatory input. Read the entire object before writing ideas.
- GSC_TOP_500 in the user message is optional context; inventory exclusion always wins over GSC.
- Read CONNECTED_SITE for context only. NEVER use, mention, or include the business name, company name, or brand name in any blog title or keyword. Blog titles must be strictly editorial, educational, topical, or informational for general readers searching Google (e.g. 'How to Choose the Right Living Room Window Blinds', NOT 'Transform Your Home with [Brand]'). Never write self-promotional brand headlines or reviews of the business.
- Do not explain your work. Do not use chain-of-thought. The assistant message must be the JSON object only.

${INVENTORY_EXCLUSION}

${BENCHMARK_SITE_INVENTORY_CANNIBALIZATION}

${POSTS_SCOPE_IDEAS_HINT}

${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}

JSON contract (mandatory, last): output one object only. Double-quoted keys. No markdown fences. No extra keys. Exact shape:
{"ideas":[{"keyword":"...","title":"..."}]}`;

  return appendUniversalContentRulesToSystemPrompt(base);
}

export function buildPromptBulkIdeasResponseFormat(count: number): {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
} {
  const n = Math.max(1, Math.min(50, Math.floor(count) || 1));
  return {
    type: "json_schema",
    json_schema: {
      name: "prompt_bulk_blog_ideas",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ideas"],
        properties: {
          ideas: {
            type: "array",
            minItems: n,
            maxItems: n,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["keyword", "title"],
              properties: {
                keyword: { type: "string", minLength: 1 },
                title: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
  };
}

type IdeasPayload = {
  ideas?: Array<{
    keyword?: unknown;
    title?: unknown;
  }>;
};

function cleanField(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function payloadFromResponse(
  parsed: Record<string, unknown> | undefined,
  content: string,
  finishReason?: string,
): IdeasPayload {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as IdeasPayload;
  }
  const trimmed = content.trim();
  if (!trimmed) {
    if (import.meta.env.DEV) {
      console.error("[prompt-bulk-ideas]", { finishReason, content });
    }
    throw new Error("Ideas agent returned empty content.");
  }
  try {
    return JSON.parse(trimmed) as IdeasPayload;
  } catch {
    if (import.meta.env.DEV) {
      console.error("[prompt-bulk-ideas]", { finishReason, content });
    }
    throw new Error("Ideas agent returned invalid JSON.");
  }
}

export function buildPromptBulkIdeasUserPayload(args: {
  count: number;
  topicLine: string;
  slots: Array<{ keyword: string; modifier: string }>;
  connectedSite?: PromptBulkKwConnectedSiteContext | null;
  siteInventoryJson?: string;
  gscKeywords?: string[];
  contentScope?: BulkSitemapScopeTag[];
}): string {
  const userPayload: Record<string, unknown> = {
    count: args.count,
    topic: args.topicLine,
    slots: args.slots,
  };
  if (args.connectedSite) {
    userPayload.CONNECTED_SITE = args.connectedSite;
  }
  if (args.contentScope?.length) {
    userPayload.contentScope = args.contentScope;
  }
  if (args.siteInventoryJson?.trim()) {
    userPayload.SITE_INVENTORY_JSON = JSON.parse(args.siteInventoryJson) as unknown;
  }
  if (args.gscKeywords?.length) {
    userPayload.GSC_TOP_500 = args.gscKeywords.slice(0, PROMPT_IDEAS_GSC_IN_USER);
  }
  return JSON.stringify(userPayload);
}

export function stripBrandFromBlogTitle(title: string, brandName?: string): string {
  if (!title || !brandName?.trim()) return title;
  const brand = brandName.trim();
  const variations = new Set<string>();
  variations.add(brand);
  variations.add(brand.replace(/&/g, "and"));
  variations.add(brand.replace(/and/g, "&"));

  const strippedSuffix = brand
    .replace(/\s*(&|and)?\s*(design|interiors|window coverings|blinds|drapery|painting|tent rentals|shoppers|inc|llc|ltd|co|corp)\b/gi, "")
    .trim();
  if (strippedSuffix.length >= 2) {
    variations.add(strippedSuffix);
  }

  let cleaned = title;
  for (const v of variations) {
    if (v.length < 2) continue;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\s+(?:with|from|by|at)\\s+${escaped}\\b`, "gi"), "");
    cleaned = cleaned.replace(new RegExp(`\\bIs\\s+${escaped}\\s+Right\\s+For\\s+You\\??`, "gi"), "");
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b\\s*[:-]?\\s*`, "gi"), "");
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/[:\-–—]\s*$/, "").trim();
  return cleaned.length > 5 ? cleaned : title;
}

export async function generateSimplePromptIdeas(args: {
  apiKey: string;
  model: string;
  count: number;
  topic?: string;
  modifier?: string;
  slotKeywords?: string[];
  slotModifiers?: string[];
  temperature?: number;
  maxTokens?: number;
  connectedSite?: PromptBulkKwConnectedSiteContext | null;
  siteInventoryJson?: string;
  gscKeywords?: string[];
  contentScope?: BulkSitemapScopeTag[];
}): Promise<CSVRow[]> {
  const count = Math.max(1, Math.min(50, Math.floor(args.count) || 1));
  const apiKey = args.apiKey.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required.");
  }

  const slots = Array.from({ length: count }, (_, i) => ({
    keyword: args.slotKeywords?.[i]?.trim() || "",
    modifier: args.slotModifiers?.[i]?.trim() || "",
  }));

  const topicLine = [args.topic?.trim(), args.modifier?.trim()].filter(Boolean).join(". ");
  const model = args.model?.trim() || "google/gemini-2.5-flash";

  const user = buildPromptBulkIdeasUserPayload({
    count,
    topicLine,
    slots,
    connectedSite: args.connectedSite,
    siteInventoryJson: args.siteInventoryJson,
    gscKeywords: args.gscKeywords,
    contentScope: args.contentScope,
  });

  const { content, parsed, finishReason } = await postOpenRouterAppChat({
    apiKey,
    model,
    system: buildPromptBulkIdeasSystemPrompt(),
    user,
    temperature: args.temperature ?? 0.35,
    maxTokens: args.maxTokens ?? Math.max(2048, count * 512),
    responseFormat: buildPromptBulkIdeasResponseFormat(count),
  });

  const payload = payloadFromResponse(parsed, content, finishReason);
  const rawIdeas = Array.isArray(payload.ideas) ? payload.ideas : [];
  if (rawIdeas.length !== count) {
    throw new Error(`Ideas agent returned ${rawIdeas.length}/${count} rows.`);
  }

  const rows: CSVRow[] = [];
  for (let i = 0; i < count; i++) {
    const item = rawIdeas[i] ?? {};
    const slotKw = slots[i]?.keyword ?? "";
    let keyword = slotKw || cleanField(item.keyword);
    let title = cleanField(item.title);
    if (args.connectedSite?.name) {
      title = stripBrandFromBlogTitle(title, args.connectedSite.name);
      keyword = stripBrandFromBlogTitle(keyword, args.connectedSite.name);
    }
    if (!keyword || !title) {
      throw new Error(`Ideas row ${i + 1} is missing keyword or title.`);
    }
    const row: CSVRow = { keyword, title };
    const mod = slots[i]?.modifier;
    if (mod) row.modifier = mod;
    rows.push(row);
  }

  return rows;
}
