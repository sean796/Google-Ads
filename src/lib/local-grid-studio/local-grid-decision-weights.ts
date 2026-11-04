import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { firstCityStateLabelFromAddress } from "@/lib/local-dominator-csv";
import { repairSapPageAllocationWeighted } from "@/lib/local-analysis-suggest-keyword-targets";
import { LOCAL_ANALYSIS_SAP_MAX } from "@/lib/local-analysis-target-constants";
import { rankGridPinsByPriority } from "./local-grid-pin-priority";
import type { LocalGridEvaluatedPin } from "./local-grid-types";

export type PlannedGridPlace = { place: string; weight: number; pages: number };

export type PlanWeightedGridPlacesArgs = {
  pins: readonly LocalGridEvaluatedPin[];
  keyword: string;
  businessName: string;
  clientAudienceContextMarkdown?: string;
  totalRows: number;
  apiKey: string;
  siteId?: string;
  onProgress?: (status: string) => void;
};

/** Customer-relevance questions put to the decision model for every grid city (importance 1 to 10). */
function customerQuestions(keyword: string, businessName: string): Array<{ id: string; text: string; importance: number }> {
  return [
    { id: "q1", importance: 10, text: `Do homeowners who buy "${keyword}" live in this city?` },
    { id: "q2", importance: 8, text: `Do residents of this city commonly search "${keyword} near me"?` },
    { id: "q3", importance: 8, text: `Does this city have the housing types that need "${keyword}"?` },
    { id: "q4", importance: 7, text: `Is this city inside the area ${businessName} realistically serves?` },
    { id: "q5", importance: 6, text: `Can households in this city afford "${keyword}"?` },
    { id: "q6", importance: 6, text: `Is this city mostly residential rather than commercial or institutional?` },
  ];
}

const SCORE_SYSTEM = `You are a high-speed local SEO decision model (checker). You DO NOT write prose.
Score every city for every question about this client's customers, 0 to 10 (10 = strongly yes).
Respond with raw JSON only, no markdown fences: {"scores":{"<exact city string>":{"q1":number,"q2":number,...},...}}`;

/** The City, ST most of this pin's listed addresses sit in, or null when none carry one. */
function cityOfPin(pin: LocalGridEvaluatedPin): string | null {
  const counts = new Map<string, number>();
  for (const item of pin.items) {
    const city = firstCityStateLabelFromAddress(item.address);
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? top[0] : null;
}

/** Summed pin priority per grid city: more and weaker pins in a city means more opportunity there. */
function cityPinPriorities(pins: readonly LocalGridEvaluatedPin[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const { pin, priority } of rankGridPinsByPriority(pins)) {
    const city = cityOfPin(pin);
    if (city) out.set(city, (out.get(city) ?? 0) + priority);
  }
  if (out.size === 0) throw new Error("Grid pins have no City, ST in their addresses.");
  return out;
}

function score(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;
}

/** One decision-model call: every question answered for every city. Returns importance-weighted 0 to 10 relevance per city. */
async function relevanceByCity(args: PlanWeightedGridPlacesArgs, cities: string[]): Promise<Map<string, number>> {
  const questions = customerQuestions(args.keyword, args.businessName);
  const result = await callAgentCategoryOpenRouterChat({
    category: "decision",
    siteId: args.siteId,
    apiKey: args.apiKey,
    system: SCORE_SYSTEM,
    user: JSON.stringify({
      businessName: args.businessName,
      focusKeyword: args.keyword,
      clientContext: args.clientAudienceContextMarkdown?.trim() ?? "",
      questions: questions.map(({ id, text }) => ({ id, text })),
      cities,
    }),
    temperature: 0.1,
    maxTokens: 4000,
    useMasterInstructions: true,
  });
  const jsonText = extractFirstBalancedJsonValue(result.content);
  if (!jsonText) {
    throw new Error(
      `Decision model did not return JSON (finish: ${result.finishReason ?? "unknown"}). Got: ${result.content.slice(0, 200) || "empty response"}`,
    );
  }
  const scores = (JSON.parse(jsonText) as { scores?: Record<string, Record<string, unknown>> }).scores ?? {};
  const totalImportance = questions.reduce((sum, q) => sum + q.importance, 0);
  return new Map(
    cities.map((city) => {
      const weighted = questions.reduce((sum, q) => sum + q.importance * score(scores[city]?.[q.id]), 0);
      return [city, weighted / totalImportance];
    }),
  );
}

/**
 * The cities already in the grid addresses. Pin priority (weak rank first, then unranked pins by
 * closeness) says where the opportunity is; the decision model scores each city against the
 * customer questions. Weight = pin priority x (1 + relevance), so every city keeps a positive
 * weight. The top cities by weight get the rows, split in proportion to weight.
 */
export async function planWeightedGridPlaces(args: PlanWeightedGridPlacesArgs): Promise<PlannedGridPlace[]> {
  if (!args.apiKey.trim()) throw new Error("OpenRouter API key is required to plan grid places.");
  if (args.totalRows < 1) throw new Error("Row count must be at least 1.");

  const priorityByCity = cityPinPriorities(args.pins);
  const cities = [...priorityByCity.keys()];

  args.onProgress?.(`Scoring ${cities.length} grid cities against customer questions`);
  const relevance = await relevanceByCity(args, cities);

  const weighted = cities
    .map((place) => ({ place, weight: priorityByCity.get(place)! * (1 + relevance.get(place)!) }))
    .sort((a, b) => b.weight - a.weight || a.place.localeCompare(b.place))
    .slice(0, args.totalRows);

  const allocated = repairSapPageAllocationWeighted(
    weighted.map((c) => ({ keyword: c.place, sapPages: 1, entityHint: c.place })),
    weighted.map((c) => c.weight),
    args.totalRows,
    1,
    LOCAL_ANALYSIS_SAP_MAX,
  );
  const weightByPlace = new Map(weighted.map((c) => [c.place, c.weight]));
  return allocated.map((row) => ({
    place: row.entityHint ?? row.keyword,
    weight: weightByPlace.get(row.entityHint ?? row.keyword) ?? 1,
    pages: row.sapPages,
  }));
}
