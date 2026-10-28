import {
  TOPIC_RESEARCH_FANOUT_MAX_QUERIES,
  uniqueTrimmed,
  requireFanoutLocation,
} from "@/lib/content-optimization/topic-research-fanout-shared";

export function cityTokenFromLocation(location: string): string {
  return location.trim().split(",")[0]?.trim() ?? "";
}

/** Month + year label for fresh SERP research, e.g. "August 2026". */
export function formatResearchAsOfLabel(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function buildIllustrativeExampleResearchQuery(input: {
  topic: string;
  location: string;
  asOfLabel: string;
}): string {
  const topic = input.topic.trim();
  const location = input.location.trim();
  const asOf = input.asOfLabel.trim();
  return `What is a realistic real-world example of ${topic} in ${location} as of ${asOf}?`;
}

export function buildProgramStatusResearchQuery(input: {
  topic: string;
  location: string;
  asOfLabel: string;
}): string {
  const topic = input.topic.trim();
  const location = input.location.trim();
  const asOf = input.asOfLabel.trim();
  return `Are ${topic} rebates or incentive programs in ${location} still open to new applications as of ${asOf}?`;
}

export function attachLocationToQfoQuery(query: string, location: string): string {
  const q = query.trim();
  const loc = location.trim();
  const city = cityTokenFromLocation(loc);
  if (!city || !q) return q;
  if (q.toLowerCase().includes(city.toLowerCase())) return q;
  return `${q} ${city}`;
}

export function attachLocationToQfoQueries(queries: string[], location: string): string[] {
  return uniqueTrimmed(queries.map((query) => attachLocationToQfoQuery(query, location)));
}

function normalizePlannerCompareText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTopicResearchPlanUser(input: {
  keyword: string;
  title?: string;
  companyName: string;
  location: string;
  researchAsOf: string;
  pageUrl?: string;
  metaDescription?: string;
  swotText?: string;
  pageExcerpt?: string;
  serpPeopleAlsoAsk?: string[];
}): string {
  const lines = [
    `Keyword: ${input.keyword.trim()}`,
    `Title: ${(input.title ?? "").trim() || input.keyword.trim()}`,
    `Company: ${input.companyName.trim()}`,
    `Location: ${input.location}`,
    `Research as of: ${input.researchAsOf}`,
  ];
  if (input.pageUrl?.trim()) lines.push(`Page URL: ${input.pageUrl.trim()}`);
  if (input.metaDescription?.trim()) {
    lines.push(`Meta description: ${input.metaDescription.trim()}`);
  }
  if (input.pageExcerpt?.trim()) {
    lines.push(`Page excerpt:\n${input.pageExcerpt.trim()}`);
  }
  if (input.serpPeopleAlsoAsk?.length) {
    lines.push(
      "SERP people-also-ask (intent hints only; do not copy verbatim):",
      ...input.serpPeopleAlsoAsk.map((question) => `- ${question.trim()}`),
    );
  }
  if (input.swotText?.trim()) lines.push(`SWOT / research:\n${input.swotText.trim()}`);
  lines.push(
    "",
    "Return 3-5 unique localized buyer questions for web research. Every question must be about THIS Keyword and Title (compare, quality, features, climate fit). Vary intents from the topic only. No template keyword strings. Forbidden: where can I see/get/buy/find samples or a showroom; can {Company} help me. Do not add rebate, incentive, grant, promotion, or sale questions unless Keyword or Title is about those.",
  );
  return lines.filter(Boolean).join("\n");
}

const BOILERPLATE_QUERY_SUFFIXES = new Set([
  "financing",
  "rates",
  "rate",
  "process",
  "installation",
  "install",
  "programs",
  "program",
  "cost",
  "costs",
  "price",
  "prices",
  "efficiency",
]);

export function isBoilerplateResearchQuery(
  query: string,
  input: { keyword: string; companyName: string; location: string },
): boolean {
  const q = normalizePlannerCompareText(query);
  const kw = normalizePlannerCompareText(input.keyword);
  const city = normalizePlannerCompareText(cityTokenFromLocation(input.location));
  const company = normalizePlannerCompareText(input.companyName);
  if (!q || !city) return false;

  if (kw && (q === `${kw} ${city}` || q === `${city} ${kw}`)) return true;

  if (kw && q.startsWith(`${kw} ${city} `)) {
    const suffix = q.slice(`${kw} ${city} `.length);
    if (!suffix || BOILERPLATE_QUERY_SUFFIXES.has(suffix)) return true;
  }

  if (company && q.includes(company) && q.includes(city)) {
    const words = q.split(" ");
    if (words.length <= 6 && /financing|rates|official facts/.test(q)) return true;
  }

  return false;
}

export function filterBoilerplateResearchQueries(
  queries: string[],
  input: { keyword: string; companyName: string; location: string },
): string[] {
  return queries.filter((query) => !isBoilerplateResearchQuery(query, input));
}

function isIllustrativeResearchQuery(query: string): boolean {
  const q = normalizePlannerCompareText(query);
  return (
    (q.includes("realistic") || q.includes("real world") || q.includes("realworld")) &&
    (q.includes("example") || q.includes("typical") || q.includes("homeowner"))
  );
}

export function ensureIllustrativeResearchQuery(
  queries: string[],
  input: { keyword: string; title?: string; location: string; asOfLabel: string },
): { queries: string[]; illustrativeExampleQuery: string } {
  const topic = (input.title ?? input.keyword).trim() || input.keyword.trim();
  const illustrative = attachLocationToQfoQuery(
    buildIllustrativeExampleResearchQuery({
      topic,
      location: input.location,
      asOfLabel: input.asOfLabel,
    }),
    input.location,
  );
  const hasIllustrative = queries.some(isIllustrativeResearchQuery);
  const merged = hasIllustrative ? [...queries] : [illustrative, ...queries];
  const capped = uniqueTrimmed(merged, TOPIC_RESEARCH_FANOUT_MAX_QUERIES);
  const illustrativeExampleQuery =
    capped.find(isIllustrativeResearchQuery) ?? illustrative;
  return { queries: capped, illustrativeExampleQuery };
}

function isProgramStatusResearchQuery(query: string): boolean {
  const q = normalizePlannerCompareText(query);
  return (
    (q.includes("rebate") || q.includes("incentive") || q.includes("program")) &&
    (q.includes("open") || q.includes("closed") || q.includes("still") || q.includes("application"))
  );
}

export function ensureProgramStatusResearchQuery(
  queries: string[],
  input: { keyword: string; title?: string; location: string; asOfLabel: string },
): { queries: string[]; programStatusQuery: string } {
  const topic = (input.title ?? input.keyword).trim() || input.keyword.trim();
  const programStatus = attachLocationToQfoQuery(
    buildProgramStatusResearchQuery({
      topic,
      location: input.location,
      asOfLabel: input.asOfLabel,
    }),
    input.location,
  );
  const hasProgramStatus = queries.some(isProgramStatusResearchQuery);
  let merged: string[];
  if (hasProgramStatus) {
    merged = [...queries];
  } else {
    const insertAt = queries.some(isIllustrativeResearchQuery) ? 1 : 0;
    merged = [...queries.slice(0, insertAt), programStatus, ...queries.slice(insertAt)];
  }
  const capped = uniqueTrimmed(merged, TOPIC_RESEARCH_FANOUT_MAX_QUERIES);
  const programStatusQuery = capped.find(isProgramStatusResearchQuery) ?? programStatus;
  return { queries: capped, programStatusQuery };
}
