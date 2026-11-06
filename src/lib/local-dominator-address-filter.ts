import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import { loadApiKey } from "@/lib/api";
import { normalizeStreetLocationKey, researchAddressKeys } from "@/lib/location-address-dedupe";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

const KEY_BATCH = 80;
/** Chunk size for AI “same storefront?” fallback (strict key match often misses wording variants). */
const AI_GUESS_CHUNK = 85;


function parseMatchIndicesFromContent(content: string): number[] | null {
  const t = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) return parsed.filter((n) => typeof n === "number");
    if (parsed && Array.isArray(parsed.matchIndices))
      return parsed.matchIndices.filter((n: unknown) => typeof n === "number");
    if (parsed && Array.isArray(parsed.matches))
      return parsed.matches.filter((n: unknown) => typeof n === "number");
  } catch {
    const m = t.match(/\[[\d,\s]+\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]) as unknown[];
        return arr.filter((n) => typeof n === "number") as number[];
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * When strict dedupe keys disagree (e.g. target keyed alone vs grid batched), ask the research model
 * which numbered addresses are the same physical storefront as the target - allows St/Street, SE/Southeast, etc.
 */
async function guessSameStorefrontIndicesInChunk(
  target: string,
  chunk: string[],
  siteId: string | undefined,
  apiKey: string
): Promise<number[]> {
  if (chunk.length === 0) return [];
  const numbered = chunk.map((a, i) => `${i + 1}. ${a}`).join("\n");
  try {
    const res = await postOpenRouterAppChatFetch({
      method: "POST",
      body: JSON.stringify({
        model: getResearchModel(siteId),
        messages: [
          {
            role: "system",
            content:
              "You match physical business storefront addresses. Same building may differ in wording (Street vs St, Southeast vs SE, punctuation). Reply with exactly one JSON object and nothing else: {\"matchIndices\":[...]} where matchIndices are 1-based line numbers from the numbered list in the user message that refer to the SAME physical storefront as the target address. Include plausible matches when wording differs. Exclude clearly different street numbers or distant locations. If none match, use {\"matchIndices\":[]}.",
          },
          {
            role: "user",
            content: `Target storefront (user's business):\n${target}\n\nNumbered addresses from a local SEO grid CSV (same list may use different formatting than the target):\n\n${numbered}\n\nWhich line numbers are the same storefront as the target?`,
          },
        ],
        temperature: 0.15,
        max_tokens: 4096,
        stream: false,
      }),
    });
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content;
    if (typeof content !== "string") return [];
    const idx = parseMatchIndicesFromContent(content);
    if (!idx) return [];
    return idx.filter((n) => Number.isInteger(n) && n >= 1 && n <= chunk.length);
  } catch {
    return [];
  }
}

async function guessMatchingAddressesWithAi(
  target: string,
  uniqueAddresses: string[],
  siteId: string | undefined,
  apiKey: string
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let offset = 0; offset < uniqueAddresses.length; offset += AI_GUESS_CHUNK) {
    const slice = uniqueAddresses.slice(offset, offset + AI_GUESS_CHUNK);
    const indices = await guessSameStorefrontIndicesInChunk(target, slice, siteId, apiKey);
    for (const i of indices) {
      out.add(slice[i - 1].trim());
    }
  }
  return out;
}

/**
 * Strip Local Dominator "Address" cell suffix: ` · (602) 820-2145` after middle dot (export format only).
 */
export function stripLdCsvAddressPhoneSuffix(raw: string): string {
  const s = raw.trim();
  const dot = s.indexOf(" · ");
  if (dot >= 0) return s.slice(0, dot).trim();
  return s;
}

async function keysForUniqueLines(
  unique: string[],
  siteId?: string,
  apiKey?: string
): Promise<string[]> {
  const keys: string[] = [];
  for (let i = 0; i < unique.length; i += KEY_BATCH) {
    const slice = unique.slice(i, i + KEY_BATCH);
    keys.push(...(await researchAddressKeys(slice, siteId, apiKey)));
  }
  return keys;
}

/**
 * Keep CSV rows whose Address column is the same physical storefront as `target`, using the same
 * OpenRouter research-model keys as Find location (`researchAddressKeys` / `normalizeStreetLocationKey`).
 */
export async function filterRowsByTargetAddress(
  rows: LocalDominatorRow[],
  target: string,
  options?: { siteId?: string; apiKey?: string }
): Promise<LocalDominatorRow[]> {
  const strip = stripLdCsvAddressPhoneSuffix;
  const t = strip(target).trim();
  if (!t) return [];
  const targetKey = await normalizeStreetLocationKey(t, options?.siteId, options?.apiKey);
  if (!targetKey) return [];
  const unique = [...new Set(rows.map((r) => strip(r.address).trim()))].filter(Boolean);
  const keys = await keysForUniqueLines(unique, options?.siteId, options?.apiKey);
  const keyForAddr = (addr: string) => keys[unique.indexOf(addr)];
  let matched = rows.filter((r) => keyForAddr(strip(r.address).trim()) === targetKey);

  const apiKeyResolved = (options?.apiKey ?? loadApiKey()).trim();
  if (matched.length === 0 && unique.length > 0 && apiKeyResolved) {
    const guessed = await guessMatchingAddressesWithAi(t, unique, options?.siteId, apiKeyResolved);
    matched = rows.filter((r) => guessed.has(strip(r.address).trim()));
  }

  return matched;
}
