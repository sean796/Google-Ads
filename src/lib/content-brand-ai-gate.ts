/**
 * AI brand / blocked-topic gate (OpenRouter).
 * Narrow rejects only: own trading name (fuzzy) + permanent blocked topics (e.g. Bali Blinds).
 */

import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { GLOBAL_BLOCKED_TOPIC_PHRASES } from "@/lib/content-topic-blocklist";
import { parseModelJson } from "@/lib/model-json";

/** Human labels for permanent topic bans (AI decides fuzzy matches). */
export const AI_BLOCKED_TOPIC_LABELS: string[] = [
  ...new Set(
    GLOBAL_BLOCKED_TOPIC_PHRASES.map((p) =>
      p
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    ),
  ),
  "Bali Blinds",
];

const SYSTEM = `You are a narrow brand/topic gate for SEO focus keywords and titles.

Default: KEEP. Only REJECT when clearly wrong.

REJECT only when the candidate is primarily:
1. The site's own trading / company name alone (navigational brand search) — exact or fuzzy word-reorder with NO product or service words.
   REJECT: "blind magic", "magic blinds", "advance blinds & drapery" when that is the full company name with no product angle.
   KEEP: "advance blinds", "advanced window coverings", "blinds near me", "custom blinds edmonton" — these are product/service queries even if they share words with the company name.
2. A blockedTopics entry or clear variant (e.g. Bali Blinds → "bali blinds", "bali blind removal").

KEEP (do NOT reject) all of these:
- Any GSC query that includes a product, service, or local commercial intent word (blinds, shades, drapery, window coverings, repair, installation, near me, etc.)
- Product / service + place: "custom blinds edmonton", "blind repair edmonton", "blinds edmonton", "roman shades edmonton"
- Manufacturer / product-line brands the dealer sells (Hunter Douglas, Alta, PowerView, etc.)
- Anything that only shares a generic product word (blinds, shades, windows) with the company name
- When unsure: KEEP

Return ONLY JSON: {"reject":["..."]}
- List ONLY candidates that must be rejected (expect few or none).
- Each reject entry MUST be copied EXACTLY from the input candidates array.
- If none reject: {"reject":[]}`;

const BrandGateResponseSchema = z.object({ reject: z.array(z.string()) });

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns the subset of `candidates` that the model rejects as own-brand / blocked topic.
 * Empty input or missing credentials → no rejects.
 */
export async function aiRejectBrandOrBlockedTexts(args: {
  apiKey: string;
  model: string;
  companyName: string;
  candidates: string[];
  kind: "keyword" | "title";
  blockedTopics?: string[];
}): Promise<string[]> {
  const apiKey = args.apiKey.trim();
  const companyName = args.companyName.trim();
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of args.candidates) {
    const t = raw.trim();
    if (!t) continue;
    const key = normKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  if (!apiKey || !companyName || unique.length === 0) return [];

  const blockedTopics = (args.blockedTopics?.length ? args.blockedTopics : AI_BLOCKED_TOPIC_LABELS)
    .map((t) => t.trim())
    .filter(Boolean);

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: args.model,
    system: SYSTEM,
    user: JSON.stringify({
      kind: args.kind,
      siteName: companyName,
      blockedTopics,
      candidates: unique,
    }),
    maxTokens: Math.min(4096, Math.max(256, unique.length * 40)),
    temperature: 0,
    responseFormat: { type: "json_object" },
  });

  const parsed = parseModelJson(content, BrandGateResponseSchema, "brand gate");
  const rejectKeys = new Set<string>();
  for (const item of parsed.reject) {
    const key = normKey(item);
    if (key) rejectKeys.add(key);
  }
  return unique.filter((t) => rejectKeys.has(normKey(t)));
}

/** Keep only candidates the AI does not reject. */
export async function aiFilterAllowedBrandTexts(args: {
  apiKey: string;
  model: string;
  companyName: string;
  candidates: string[];
  kind: "keyword" | "title";
  blockedTopics?: string[];
}): Promise<string[]> {
  const trimmed = args.candidates.map((c) => c.trim()).filter(Boolean);
  if (trimmed.length === 0) return [];
  const rejected = await aiRejectBrandOrBlockedTexts(args);
  if (rejected.length === 0) return trimmed;
  const rejectKeys = new Set(rejected.map(normKey));
  return trimmed.filter((c) => !rejectKeys.has(normKey(c)));
}
