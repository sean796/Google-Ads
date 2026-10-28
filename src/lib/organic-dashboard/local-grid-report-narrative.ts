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
    'Neo Digital local SEO client report. JSON only: {"localGridNarrative":["paragraph"]}.',
    "Never output the word string, String1, or other schema placeholders as narrative text.",
    "American English, full sentences. Use siteName for the client brand.",
    "Never write calendar dates or years.",
    "Required: one or two short paragraphs using only the localGrid stats (keyword, TARP, avg rank, high/med/low/out counts and percentages).",
    "Explain where map visibility is strong vs weak and what that means for local leads. Bold the keyword once using **keyword**.",
    "Do not invent cities or ranks not in the data.",
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
  const kw = keyword.trim() || "the tracked local keyword";
  const tarp = summary.tarp.toFixed(1);
  const avgRank =
    summary.rankedPoints > 0 ? summary.avgRank.toFixed(1) : "20+";
  const top3 = `${summary.highPct}% (${summary.highCount}/${summary.totalPoints} pins)`;
  const outside = `${summary.outPct}% (${summary.outCount}/${summary.totalPoints} pins)`;

  if (summary.highPct >= 25) {
    return `${brand} shows solid map pack presence for **${kw}**: TARP ${tarp} with ${top3} in positions 1–3, while ranked pins average ${avgRank}. ${outside} still sit outside the top 20, mostly in outlying grid cells, so pushing those areas into the top 10 is the next step for more local discovery clicks.`;
  }

  return `For **${kw}**, ${brand} averages ${tarp} TARP across the scan with only ${top3} in the top 3 and ${outside} outside the top 20 (avg rank ${avgRank} on ranked pins). Visibility clusters near the center of the grid and weakens toward the edges, which caps map pack traffic until more pins break into page-one local results.`;
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
