import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";
import { deckNarrativeText } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import { normalizeClientReportText } from "@/lib/organic-dashboard/organic-client-report-copy";

const LOCAL_GRID_NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["localGridNarrative"],
  properties: {
    localGridNarrative: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string" },
    },
  },
} as const;

/** Rejects JSON-schema filler the model sometimes echoes (e.g. String1, string). */
export function isLocalGridNarrativePlaceholder(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(string|text|paragraph|content|placeholder|example)(\d+)?$/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 6 && !/\b(tarp|map|rank|grid|pin|local|pack|visibility|keyword|top)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function resolveLocalGridNarrativeForReport(
  aiParagraphs: string[],
  snapshot: LocalGridReportingSnapshot,
  siteName: string,
): string[] {
  const fromAi = aiParagraphs
    .map((p) => normalizeClientReportText(deckNarrativeText(p)))
    .filter((p) => p.trim() && !isLocalGridNarrativePlaceholder(p))
    .slice(0, 2);
  if (fromAi.length > 0) return fromAi;
  return [normalizeClientReportText(buildLocalGridResultsNarrativeParagraph(snapshot, siteName))];
}

function localGridSystemPrompt(): string {
  return [
    'Neo Digital owner-friendly local report. JSON only: {"localGridNarrative":["paragraph"]}.',
    "Never output the word string, String1, or other schema placeholders as narrative text.",
    "Write in plain, everyday business English for a busy CEO or business owner (such as the owner of Blind Magic). Use siteName for the client brand.",
    "Never write calendar dates or years, and do not use technical acronyms like TARP.",
    "Required: one short, easy-to-read paragraph explaining where the business shows up in the top 3 on Google Maps for the tracked search term and where outlying neighborhoods have room to grow to bring in more local customers. Bold the search term once using **keyword**.",
    "Do not invent cities or ranks not in the data, and avoid dumping raw stats that are already shown in the scorecard table.",
  ].join("\n\n");
}

function localGridUserPayload(
  siteName: string,
  siteUrl: string,
  localGrid: LocalGridReportingSnapshot,
): string {
  return JSON.stringify(
    {
      siteName,
      siteUrl,
      localGrid,
    },
    null,
    2,
  );
}

/** Client report copy from aggregated grid stats (same numbers as Local Grid Data Report). */
export function buildLocalGridResultsNarrativeParagraph(
  snapshot: LocalGridReportingSnapshot,
  siteName: string,
): string {
  const { summary, keyword } = snapshot;
  const brand = siteName.trim() || "The business";
  const kw = keyword.trim() || "the tracked local search term";

  if (summary.highPct >= 25) {
    return `${brand} has a strong neighborhood presence on Google Maps when local shoppers search for **${kw}**, appearing in the top 3 map results across ${summary.highPct}% of the area while averaging spot #${summary.avgRank.toFixed(1)} where found. Expanding that visibility into the remaining outlying neighborhoods is the clearest next step to bring in even more local calls and quote requests.`;
  }

  return `When local shoppers search for **${kw}** on Google Maps, ${brand} currently shows up strongest right around the core business location (${summary.highPct}% in the top 3 results) and tapers off in outer neighborhoods. Moving those surrounding neighborhood points onto the first page of Google Maps will help capture more local homeowners looking for service.`;
}

export async function fetchLocalGridReportNarrativeViaOpenRouter(
  siteName: string,
  siteUrl: string,
  localGrid: LocalGridReportingSnapshot,
  siteId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const model = resolveModelForAgentCategory("report", siteId);
  const { parsed } = await postOpenRouterAppChat({
    model,
    system: localGridSystemPrompt(),
    user: `Site and Local Grid scan (JSON). Write localGridNarrative from these stats only.\n\n${localGridUserPayload(siteName, siteUrl, localGrid)}`,
    temperature: 0.15,
    maxTokens: 1200,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "local_grid_report_narrative",
        strict: true,
        schema: LOCAL_GRID_NARRATIVE_SCHEMA,
      },
    },
    reasoning: { effort: "low" },
    signal,
  });

  const raw = parsed?.localGridNarrative;
  if (!Array.isArray(raw)) {
    throw new Error("Local grid narrative response was invalid.");
  }
  const paragraphs = raw
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => normalizeClientReportText(deckNarrativeText(p)))
    .filter((p) => !isLocalGridNarrativePlaceholder(p))
    .slice(0, 2);
  if (paragraphs.length === 0) {
    throw new Error("Local grid narrative was empty.");
  }
  return paragraphs;
}
