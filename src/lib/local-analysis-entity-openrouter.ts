/**
 * Sub-metro entity hints: **OpenRouter is the only source of entityHint strings.**
 * This file does not invent, trim, or post-process geography — only builds prompts, POSTs, and parses JSON.
 */

import { appendMasterInstructionsToSystemPrompt, ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import { postOpenRouterAppChatFetch, type OpenRouterAppChatFetchResponse } from "@/lib/openrouter-app-api";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";

// ---------------------------------------------------------------------------
// OpenRouter system prompt (authoritative). No parallel rules implemented in code.
// ---------------------------------------------------------------------------
const OPENROUTER_SUB_METRO_SYSTEM = `You assign local SEO geography labels (entityHint) for service-area pages.

**Output:** JSON only. Emit **one** top-level \`{...}\` object and **end the message** — do not add prose, markdown, or a second JSON value after the closing \`}\`. Shape: {"hints":[{"clusterId":"string","entityHint":"string"},...]}

**entityHint rules:**
- Use **sub-metro** places: neighbourhood, district, street corridor, named landmark, historic quarter, industrial pocket, or suburb. Phrase as a short comma-style local label suitable for SEO.
- **Grid CSV is the source of variety:** Read the **full** uploaded CSV (every row you can). Pin or rank columns are not a single "winner city" - extract **different** streets, corridors, neighbourhood names, and address-side areas from **different rows** and assign **different** anchors to **different** seeds. **Do not** collapse every seed to one **City, ST** line because that city appears often or is the storefront city.
- When there are **two or more seeds**, each seed must get a **different** entityHint string (no copy-paste). Tie each seed to a **different** sub-metro anchor from the CSV or from distinct \`###\` Wikipedia titles - not the same umbrella label repeated.
- **Do not** output only a whole-city **City, ST** line (e.g. "Marietta, GA") for every row when the CSV or Wikipedia block contains finer anchors (streets, districts, neighbourhoods, corridors).
- Prefer evidence from **address lines** (street + city) and **Wikipedia granular** \`###\` titles that name real places inside the grid footprint.
- **Forbidden:** province-only or state-only geography; invented place names; topic or industry article titles that mirror the service keyword.
- **Traceability:** Each entityHint must be **grounded in a line** from the uploaded CSV, grid scan, or a \`###\` Wikipedia title below - **do not** swap in a **regional hub** or core-metro city that is not evidenced there.

Return **one** object per seed clusterId. Every clusterId in the user message seeds array must appear exactly once with a non-empty entityHint. The server will not add, fix, or merge hints — you must return complete, valid JSON.`;

export type SubMetroEntitySeed = { clusterId: string; keyword: string };

export type ResolveSubMetroEntityHintsArgs = {
  apiKey: string;
  siteId?: string;
  seeds: SubMetroEntitySeed[];
  gridSummaryMarkdown: string;
  uploadedGridCsvFull: string;
  wikipediaGranularEntityPoolMarkdown: string;
};

function blockOrNone(label: string, body: string): string {
  return `--- ${label} ---\n${body.length > 0 ? body : "(none)"}`;
}

export function buildSubMetroEntityUserMessage(
  seeds: SubMetroEntitySeed[],
  gridSummaryMarkdown: string,
  uploadedGridCsvFull: string,
  wikipediaGranularEntityPoolMarkdown: string,
): string {
  const seedsJson = JSON.stringify(seeds);
  const n = seeds.length;
  const multiSeed =
    n >= 2
      ? `

**Required mapping:** There are **${n}** seeds - you must output **${n} different** entityHint strings. Scan the **Uploaded grid CSV** (and Wikipedia \`###\` titles) for **multiple** distinct sub-metro places (neighbourhoods, districts, street corridors, landmarks). Assign **one** anchor per clusterId so seeds do **not** all share the same city-only line. **Do not** answer with the same "City, ST" for every row when addresses or titles imply finer places.`
      : "";

  return `Return JSON only: {"hints":[{"clusterId":"string","entityHint":"string"},...]}${multiSeed}

${blockOrNone("Seeds (service keywords only; no geography)", seedsJson)}

${blockOrNone("Grid scan (full markdown)", gridSummaryMarkdown)}

${blockOrNone("Uploaded grid CSV (full file)", uploadedGridCsvFull)}

${blockOrNone("Wikipedia granular place candidates", wikipediaGranularEntityPoolMarkdown)}`;
}

/**
 * Extract {"hints": [...]} from model text. **Does not** alter entityHint strings — copies them as returned.
 * @internal Exported for tests.
 */
export function parseSubMetroEntityHintsJson(content: string): Map<string, string> {
  if (!content) return new Map();
  const sub = extractFirstBalancedJsonValue(content);
  if (!sub) return new Map();
  let o: unknown;
  try {
    o = JSON.parse(sub);
  } catch {
    return new Map();
  }
  const rec = o as { hints?: unknown };
  if (!rec || typeof rec !== "object" || !Array.isArray(rec.hints)) {
    return new Map();
  }
  const map = new Map<string, string>();
  for (const item of rec.hints) {
    if (!item || typeof item !== "object") continue;
    const row = item as { clusterId?: unknown; entityHint?: unknown };
    const clusterId = String(row.clusterId ?? "");
    const entityHint = String(row.entityHint ?? "");
    if (clusterId && entityHint) map.set(clusterId, entityHint);
  }
  return map;
}

function isCompleteForSeeds(seeds: SubMetroEntitySeed[], map: Map<string, string>): boolean {
  return seeds.every((s) => (map.get(s.clusterId) ?? "").length > 0);
}

/** Slightly higher than suggest so multiple seeds do not collapse to one identical city line. */
const SUB_METRO_ENTITY_TEMPERATURE = 0.32;

const MAX_SUB_METRO_COMPLETIONS = 4;

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function postOpenRouter(
  apiKey: string,
  siteId: string | undefined,
  messages: ChatMsg[],
): Promise<string> {
  let res: OpenRouterAppChatFetchResponse;
  try {
    res = await postOpenRouterAppChatFetch({
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: getResearchModel(siteId),
        messages,
        temperature: SUB_METRO_ENTITY_TEMPERATURE,
        max_tokens: 4096,
        stream: false,
      }),
    });
  } catch {
    return "";
  }
  if (!res.ok) {
    return "";
  }
  let j: { choices?: Array<{ message?: { content?: unknown } }> };
  try {
    j = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  } catch {
    return "";
  }
  const c = j.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

/**
 * OpenRouter only: each completion either yields a **complete** hints map (every clusterId) or the client sends another in-thread repair. No local fallbacks.
 */
export async function resolveSubMetroEntityHintsOpenRouter(
  args: ResolveSubMetroEntityHintsArgs,
): Promise<Map<string, string>> {
  const {
    apiKey,
    siteId,
    seeds,
    gridSummaryMarkdown,
    uploadedGridCsvFull,
    wikipediaGranularEntityPoolMarkdown,
  } = args;
  if (seeds.length === 0) {
    return new Map();
  }

  await ensureMasterInstructionsInMemory(siteId);

  const user = buildSubMetroEntityUserMessage(
    seeds,
    gridSummaryMarkdown,
    uploadedGridCsvFull,
    wikipediaGranularEntityPoolMarkdown,
  );

  const systemContent = appendMasterInstructionsToSystemPrompt(OPENROUTER_SUB_METRO_SYSTEM, siteId ?? null);
  const basePair: ChatMsg[] = [
    { role: "system", content: systemContent },
    { role: "user", content: user },
  ];

  const missingIds = (m: Map<string, string>) =>
    seeds.filter((s) => (m.get(s.clusterId) ?? "").length === 0).map((s) => s.clusterId);

  const repairUser = (assistantRaw: string, pass: number) =>
    `Your previous message must be **only** valid JSON with shape {"hints":[{"clusterId":string,"entityHint":string},...]}. The following clusterIds are still missing a non-empty entityHint: ${JSON.stringify(
      missingIds(parseSubMetroEntityHintsJson(assistantRaw)),
    )}. All clusterIds from the first user message (Seeds JSON) must appear with non-empty, distinct sub-metro entityHint values grounded in the grid CSV, grid scan, or Wikipedia block. No markdown, no text outside JSON. Pass ${pass}/${MAX_SUB_METRO_COMPLETIONS}.`;

  let messages: ChatMsg[] = basePair;
  let lastContent = "";

  for (let i = 0; i < MAX_SUB_METRO_COMPLETIONS; i++) {
    lastContent = await postOpenRouter(apiKey, siteId, messages);
    const map = parseSubMetroEntityHintsJson(lastContent);
    if (isCompleteForSeeds(seeds, map)) {
      return map;
    }
    if (i < MAX_SUB_METRO_COMPLETIONS - 1) {
      messages = [
        ...basePair,
        { role: "assistant", content: lastContent ? lastContent.slice(0, 24_000) : "" },
        { role: "user", content: repairUser(lastContent, i + 2) },
      ];
    }
  }

  return parseSubMetroEntityHintsJson(lastContent);
}
