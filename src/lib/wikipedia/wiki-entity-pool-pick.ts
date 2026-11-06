import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { matchTitleInList } from "@/lib/wikipedia/entity-hint-openrouter";
import { appendMasterInstructionsToSystemPrompt } from "@/lib/master-instructions-storage";
import { isLocalGridWikiConsoleTraceActive, localGridWikiConsoleLog } from "@/lib/local-grid-studio/local-grid-wiki-console-trace";
import {
  isRejectedSapGridEntityLabel,
  isRejectedSapGridWikiTitle,
} from "@/lib/local-analysis/sap-grid-entity-reject";
import {
  isWikiTitleScopedToParentCity,
  type WikiGeoEntry,
} from "./wiki-entity-pool-geo";

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const SYS_PICK_POOL = `You choose Wikipedia article titles for local service-area entity pages under ONE parent city ad group.

Read the **Grid scan** block in the user message FIRST. That block defines the geographic footprint (centroid, bounding box, pin addresses, country/region).

Then read the numbered Wikipedia title list. Every title in the list is already inside **Parent city**. Pick exactly the requested count from that list ONLY.

ALLOWED (you may pick):
- Neighbourhoods, districts, communities, suburbs, hamlets within the parent city
- Parks, squares, waterfronts, plazas in the parent city
- Buildings, malls, civic centres, exhibition halls, landmarks, historic sites in the parent city

FORBIDDEN (never pick, even if listed):
- A different city, town, or region (e.g. Winkler, Morden, Winnipeg when parent city is Altona)
- Places in a different country (homonym cities abroad)
- Murders, deaths, crimes, trials, disasters, accidents, shootings, news events
- Biographies of people, companies, conferences, religious organizations, sports teams
- Law enforcement and emergency HQs (police department, sheriff, jail, prison, fire department as an org)
- Government offices (city hall, courthouse, embassy, military base) unless the client is public-sector
- Abstract topics (multiculturalism, ideologies) and person surnames used as the place name
- "List of …" index pages
- Anything that is not a physical place or building in the parent city

Prefer neighbourhoods, suburbs, and residential communities where the client's customers live. Malls and parks are OK; police stations and courthouses are not.

**Client-aware preference (when Client & site context is in the user message):**
- Act as a **senior local SEO specialist**: re-rank among allowed titles to match **who** the client serves and **where** those people work, shop, or commute.
- For **professional / B2B services** (accounting, tax, legal, advisory): prefer business districts, historic districts, commercial corridors, and business parks over residential neighbourhoods; **do not pick** individual schools, school districts, or school board articles unless client context is education-focused.
- When **entity type focus** includes business or industrial types, prioritize matching district and corridor titles from the list.
- Grid evidence near a school is footprint context only; do not pick the school article as the entity for non-education clients.

Reply ONLY valid JSON: {"titles":["Exact Title From List", ...]}
Copy each title exactly as shown in the numbered list. Never invent a title not in the list.`;

export async function pickWikiEntriesFromPool(args: {
  pool: WikiGeoEntry[];
  count: number;
  parentCity: string;
  sampleAddresses: string[];
  gridLocations: string[];
  gridSummaryMarkdown: string;
  excludeTitles: readonly string[];
  apiKey: string;
  siteId?: string;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
}): Promise<WikiGeoEntry[]> {
  const count = Math.max(1, Math.floor(args.count));
  const exclude = new Set(args.excludeTitles.map((t) => t.trim().toLowerCase()).filter(Boolean));

  const byTitle = new Map(args.pool.map((e) => [e.wikipediaTitle.toLowerCase(), e]));
  const excludeLabels = new Set(
    args.excludeTitles.map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  const available = args.pool.filter((e) => {
    if (exclude.has(e.wikipediaTitle.toLowerCase())) return false;
    const labelKey = normalizeEntityHintCommaLabel(e.entityLabel).trim().toLowerCase();
    if (labelKey && excludeLabels.has(labelKey)) return false;
    if (isRejectedSapGridWikiTitle(e.wikipediaTitle)) return false;
    if (isRejectedSapGridEntityLabel(e.entityLabel)) return false;
    return isWikiTitleScopedToParentCity(e.wikipediaTitle, args.parentCity);
  });
  if (available.length === 0) return [];

  const n = Math.min(count, available.length);
  const candidates = available.map((e) => e.wikipediaTitle);
  if (isLocalGridWikiConsoleTraceActive()) {
    localGridWikiConsoleLog("OpenRouter pickWikiEntriesFromPool →", {
      parentCity: args.parentCity,
      pickCount: n,
      poolAvailable: available.length,
      excludeCount: exclude.size,
    });
  }
  const list = candidates.slice(0, 80).map((t, i) => `${i + 1}. ${t}`).join("\n");
  const gridBlock = args.gridSummaryMarkdown.trim();
  const clientCtx = args.clientAudienceContextMarkdown?.trim();
  const entityTypeFocus = args.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  const clientBlock =
    clientCtx || entityTypeFocus?.length
      ? `\n--- Client & site context (preference for which places to prioritize) ---\n${
          clientCtx ?? ""
        }${
          entityTypeFocus?.length
            ? `\n- **Entity type emphasis:** ${entityTypeFocus.join(", ")}`
            : ""
        }\n`
      : "";
  const user = `--- Grid scan (read this first) ---
${gridBlock}
${clientBlock}
--- Pick request ---
Parent city: ${args.parentCity}
Count: ${n}
Sample addresses in this city ad group: ${args.sampleAddresses.slice(0, 8).join(" | ")}
Place names in this city ad group: ${args.gridLocations.slice(0, 12).join(", ")}

Every pick must be a physical place inside **${args.parentCity}** only. Do not pick other cities from the wider grid scan.

Read the grid scan above, then pick exactly ${n} distinct ALLOWED physical-place titles from this Wikipedia list (copy exactly):

${list}

Return JSON only: {"titles":["...", ...]} with length ${n}.`;

  const { streamChatCompletion } = await import("@/lib/api");
  const systemPrompt = appendMasterInstructionsToSystemPrompt(SYS_PICK_POOL, args.siteId ?? null);
  let out = "";
  await streamChatCompletion({
    apiKey: args.apiKey,
    model: getResearchModel(args.siteId),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: user },
    ],
    temperature: 0.15,
    maxTokens: 800,
    topP: 0.9,
    onContentChunk: (c) => {
      out += c;
    },
  });

  let titles: string[] = [];
  try {
    const parsed = JSON.parse(stripJsonFence(out)) as { titles?: unknown };
    if (Array.isArray(parsed.titles)) {
      titles = parsed.titles
        .filter((t): t is string => typeof t === "string" && t.trim() !== "")
        .map((t) => t.trim());
    }
  } catch {
    const m = stripJsonFence(out).match(/"titles"\s*:\s*\[([\s\S]*?)\]/);
    if (m?.[1]) {
      titles = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]!.trim()).filter(Boolean);
    }
  }

  const picked: WikiGeoEntry[] = [];
  const seen = new Set<string>();
  for (const raw of titles) {
    if (picked.length >= count) break;
    const matched =
      matchTitleInList(JSON.stringify({ chosen: raw }), candidates) ??
      candidates.find((c) => c.toLowerCase() === raw.toLowerCase());
    if (!matched) continue;
    const key = matched.toLowerCase();
    if (seen.has(key) || exclude.has(key)) continue;
    const entry = byTitle.get(key);
    if (!entry) continue;
    seen.add(key);
    picked.push(entry);
  }

  const result = picked.slice(0, count);
  if (isLocalGridWikiConsoleTraceActive()) {
    localGridWikiConsoleLog("OpenRouter pickWikiEntriesFromPool ←", {
      requested: count,
      parsedTitleCount: titles.length,
      picked: result.length,
      titles: result.map((e) => e.wikipediaTitle),
    });
  }

  return result;
}
