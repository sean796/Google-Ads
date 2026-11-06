/**
 * Deterministic merge of DataForSEO SERP + GSC + Semrush into one JSON "content brief"
 * for ACF `seo_research` (no AI). Strips SERP noise (xpath, rectangles, etc.);
 * keeps organics, PAA, related searches, refinements, and links/keywords from tools.
 */

const DESC_MAX = 800;
const PAA_ANSWER_MAX = 600;

function clip(s: unknown, max: number): string | undefined {
  if (s == null || typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

/** Collect sitelinks from organic `links` array if present */
function organicSitelinks(links: unknown): Array<{ title?: string; url?: string }> {
  if (!Array.isArray(links)) return [];
  const out: Array<{ title?: string; url?: string }> = [];
  for (const l of links) {
    if (!l || typeof l !== "object") continue;
    const o = l as Record<string, unknown>;
    const title = str(o.title) || str(o.text);
    const url = str(o.url) || str(o.link);
    if (title || url) out.push({ title, url });
  }
  return out;
}

export type PeopleAlsoAskBriefEntry = {
  question: string;
  seed_question?: string;
  answers: Array<{
    url?: string;
    domain?: string;
    title?: string;
    description?: string;
  }>;
};

export type LlmAuditPlatformBrief = {
  platform: "chat_gpt" | "gemini" | "perplexity";
  label: string;
  model_name: string;
  status: "ok" | "error";
  webSearchUsed?: boolean;
  responseText?: string;
  annotations?: Array<{ title?: string; url?: string }>;
  liveLinks?: string[];
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  error?: string;
};

export type LlmAuditBrief = {
  siteUrl: string;
  location: string;
  focusKeyword?: string;
  queryFanout?: QueryFanout;
  platforms: LlmAuditPlatformBrief[];
};

export type VerifiedFact = {
  claimLabel: string;
  status: "confirmed" | "contradicted" | "not_found";
  fact: string;
  sourceUrl: string;
  sourceDomain: string;
  asOf: string;
};

export type IllustrativeExample = {
  leadIn: string;
  quoteBody: string;
  asOf: string;
  illustrativeH2Title?: string;
  personaName?: string;
  householdProfile?: string;
  situationHook?: string;
  /** Brief question for the illustrative intro or blockquote (OpenRouter extract). Never used as a heading. */
  scenarioQuestion?: string;
  /** One named persona narrative for blockquote (OpenRouter extract). */
  scenarioNarrative?: string;
  recommendationTitle?: string;
  recommendationParagraph?: string;
};

export type SerpOrganicTopEntry = {
  domain?: string;
  url?: string;
  title?: string;
  description?: string;
};

export type QueryFanoutSerpRow = {
  query: string;
  organicTop: SerpOrganicTopEntry[];
  paa: string[];
  /** Legacy rows may only have titles */
  organicTitles?: string[];
};

export type QueryFanout = {
  queries: string[];
  namedPrograms: string[];
  plannerModel?: string;
  plannedAt?: string;
  /** e.g. "August 2026" — when fanout research was planned */
  researchAsOf?: string;
  /** SERP query for a real-world local example used in [ILLUSTRATIVE] sections */
  illustrativeExampleQuery?: string;
  /** Extracted A-vs-B hypothetical for [ILLUSTRATIVE] blockquote + Overview Real-World Example bullet */
  illustrativeExample?: IllustrativeExample;
  /** SERP query for current rebate/program open-closed status */
  programStatusQuery?: string;
  /** Up to 3 dynamic official-source verification queries */
  factualVerificationQueries?: string[];
  /** Extracted facts bound to official source URLs */
  verifiedFacts?: VerifiedFact[];
  serpByQuery?: QueryFanoutSerpRow[];
  chatGptByQuery?: Array<{ query: string; responseText: string }>;
};

export type FirstPartyClaim = { text: string; source: string };

export type SeoContentBriefV1 = {
  version: 1;
  generatedAt: string;
  focusKeyword: string;
  pageUrl: string;
  dataforseo: {
    seedKeyword: string | null;
    organic: Array<{
      rank_absolute?: number;
      rank_group?: number;
      domain?: string;
      url?: string;
      title?: string;
      description?: string;
      sitelinks?: Array<{ title?: string; url?: string }>;
    }>;
    peopleAlsoAsk: PeopleAlsoAskBriefEntry[];
    peopleAlsoSearchPhrases: string[];
    relatedSearches: string[];
    refinementChips: Array<{ title?: string; url?: string }>;
    popularProducts: Array<{
      title?: string;
      seller?: string;
      description?: string;
      displayed_price?: string;
    }>;
    featuredSnippet?: {
      type?: string;
      title?: string;
      url?: string;
      domain?: string;
      description?: string;
    };
  };
  gsc: {
    pageUrl: string;
    queries: string[];
  };
  semrush: {
    urlOrganicKeywords: string[];
    phraseRelatedKeywords: string[];
    urlOrganicUrls: string[];
    phraseRelatedUrls: string[];
    phraseOrganicUrls: string[];
    externalSemrushUrls: string[];
  };
  llmAudit?: LlmAuditBrief;
  queryFanout?: QueryFanout;
  firstPartyClaims?: FirstPartyClaim[];
};

function parsePaaItem(el: Record<string, unknown>): PeopleAlsoAskBriefEntry | null {
  const question = str(el.title);
  if (!question) return null;
  const seed_question = str(el.seed_question);
  const answers: PeopleAlsoAskBriefEntry["answers"] = [];
  const expanded = el.expanded_element;
  if (Array.isArray(expanded)) {
    for (const ex of expanded) {
      if (!ex || typeof ex !== "object") continue;
      const x = ex as Record<string, unknown>;
      if (x.type === "people_also_ask_expanded_element") {
        answers.push({
          url: str(x.url),
          domain: str(x.domain),
          title: str(x.title),
          description: clip(x.description, PAA_ANSWER_MAX),
        });
      }
    }
  }
  return { question, seed_question, answers };
}

/**
 * Extract compact SERP brief from full DataForSEO SERP dump JSON (root object).
 */
export function extractDataForSeoSerpBrief(serpRoot: unknown): SeoContentBriefV1["dataforseo"] {
  const empty: SeoContentBriefV1["dataforseo"] = {
    seedKeyword: null,
    organic: [],
    peopleAlsoAsk: [],
    peopleAlsoSearchPhrases: [],
    relatedSearches: [],
    refinementChips: [],
    popularProducts: [],
  };

  if (!serpRoot || typeof serpRoot !== "object") return empty;

  const task = (serpRoot as Record<string, unknown>).tasks;
  const task0 = Array.isArray(task) ? (task[0] as Record<string, unknown> | undefined) : undefined;
  if (!task0) return empty;

  const seedKeyword = str(task0.data && typeof task0.data === "object" ? (task0.data as { keyword?: unknown }).keyword : null);
  const results = task0.result;
  const firstResult = Array.isArray(results) ? (results[0] as Record<string, unknown> | undefined) : undefined;
  if (!firstResult) {
    return { ...empty, seedKeyword: seedKeyword ?? null };
  }

  const items: unknown[] = Array.isArray(firstResult.items) ? firstResult.items : [];

  const organic: SeoContentBriefV1["dataforseo"]["organic"] = [];
  const peopleAlsoAsk: PeopleAlsoAskBriefEntry[] = [];
  const peopleAlsoSearchPhrases: string[] = [];
  const relatedSearches: string[] = [];
  const refinementChips: Array<{ title?: string; url?: string }> = [];
  const popularProducts: SeoContentBriefV1["dataforseo"]["popularProducts"] = [];
  let featuredSnippet: SeoContentBriefV1["dataforseo"]["featuredSnippet"] | undefined;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const t = str(it.type);

    if (t === "organic" || t === "organic_result") {
      const sitelinks = organicSitelinks(it.links);
      organic.push({
        rank_absolute: typeof it.rank_absolute === "number" ? it.rank_absolute : undefined,
        rank_group: typeof it.rank_group === "number" ? it.rank_group : undefined,
        domain: str(it.domain),
        url: str(it.url),
        title: str(it.title),
        description: clip(it.description, DESC_MAX),
        sitelinks: sitelinks.length ? sitelinks : undefined,
      });
      if (it.is_featured_snippet === true && !featuredSnippet) {
        featuredSnippet = {
          type: "organic_featured",
          title: str(it.title),
          url: str(it.url),
          domain: str(it.domain),
          description: clip(it.description, DESC_MAX),
        };
      }
      continue;
    }

    if (t === "featured_snippet" || t === "answer_box") {
      featuredSnippet = {
        type: t,
        title: str(it.title) || str(it.featured_title),
        url: str(it.url),
        domain: str(it.domain),
        description: clip(it.description ?? it.snippet, DESC_MAX),
      };
      continue;
    }

    if (t === "people_also_ask") {
      const sub = it.items;
      if (Array.isArray(sub)) {
        for (const el of sub) {
          if (!el || typeof el !== "object") continue;
          const p = parsePaaItem(el as Record<string, unknown>);
          if (p) peopleAlsoAsk.push(p);
        }
      }
      continue;
    }

    if (t === "people_also_search") {
      const sub = it.items;
      if (Array.isArray(sub)) {
        for (const x of sub) {
          if (typeof x === "string" && x.trim()) peopleAlsoSearchPhrases.push(x.trim());
        }
      }
      continue;
    }

    if (t === "related_searches") {
      const sub = it.items;
      if (Array.isArray(sub)) {
        for (const x of sub) {
          if (typeof x === "string" && x.trim()) relatedSearches.push(x.trim());
        }
      }
      continue;
    }

    if (t === "refinement_chips") {
      const sub = it.items;
      if (Array.isArray(sub)) {
        for (const el of sub) {
          if (!el || typeof el !== "object") continue;
          const e = el as Record<string, unknown>;
          if (str(e.type)?.includes("refinement_chips")) {
            refinementChips.push({
              title: str(e.title),
              url: str(e.url),
            });
          }
        }
      }
      continue;
    }

    if (t === "popular_products") {
      const sub = it.items;
      if (Array.isArray(sub)) {
        for (const el of sub) {
          if (!el || typeof el !== "object") continue;
          const e = el as Record<string, unknown>;
          if (e.type === "popular_products_element") {
            const price = e.price && typeof e.price === "object" ? (e.price as { displayed_price?: unknown }).displayed_price : undefined;
            popularProducts.push({
              title: str(e.title),
              seller: str(e.seller),
              description: clip(e.description, 400),
              displayed_price: str(price),
            });
          }
        }
      }
    }
  }

  return {
    seedKeyword: seedKeyword ?? str(firstResult.keyword) ?? null,
    organic,
    peopleAlsoAsk,
    peopleAlsoSearchPhrases,
    relatedSearches,
    refinementChips,
    popularProducts,
    featuredSnippet,
  };
}

/** Dedupe strings preserving order */
export function dedupeStrings(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Parse GSC quick-wins context JSON string; returns queries from `rows` or top-level `queries`.
 */
export function parseGscBriefFromContext(contextStr: string): { pageUrl: string; queries: string[] } {
  const empty = { pageUrl: "", queries: [] as string[] };
  const t = (contextStr || "").trim();
  if (!t) return empty;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const pageUrl = str(j.gsc_keywords_for_url) || "";
    if (Array.isArray(j.queries)) {
      const q = j.queries.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
      return { pageUrl, queries: dedupeStrings(q) };
    }
    const rows = j.rows;
    if (Array.isArray(rows)) {
      const q: string[] = [];
      for (const r of rows) {
        if (r && typeof r === "object") {
          const query = (r as { query?: unknown }).query;
          if (typeof query === "string" && query.trim()) q.push(query.trim());
        }
      }
      return { pageUrl, queries: dedupeStrings(q) };
    }
    return { pageUrl, queries: [] };
  } catch {
    return empty;
  }
}

export function extractSemrushBrief(overviewDoc: unknown): SeoContentBriefV1["semrush"] {
  const empty: SeoContentBriefV1["semrush"] = {
    urlOrganicKeywords: [],
    phraseRelatedKeywords: [],
    urlOrganicUrls: [],
    phraseRelatedUrls: [],
    phraseOrganicUrls: [],
    externalSemrushUrls: [],
  };
  if (!overviewDoc || typeof overviewDoc !== "object") return empty;
  const doc = overviewDoc as Record<string, unknown>;
  const sem = doc.semrush && typeof doc.semrush === "object" ? (doc.semrush as Record<string, unknown>) : doc;

  const asStrArr = (k: string): string[] => {
    const v = sem[k];
    if (!Array.isArray(v)) return [];
    return dedupeStrings(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean));
  };

  let external = asStrArr("externalSemrushUrls");
  if (!external.length && Array.isArray(doc.externalSemrushUrls)) {
    external = dedupeStrings(
      (doc.externalSemrushUrls as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()),
    );
  }

  return {
    urlOrganicKeywords: asStrArr("urlOrganicKeywords"),
    phraseRelatedKeywords: asStrArr("phraseRelatedKeywords"),
    urlOrganicUrls: asStrArr("urlOrganicUrls"),
    phraseRelatedUrls: asStrArr("phraseRelatedUrls"),
    phraseOrganicUrls: asStrArr("phraseOrganicUrls"),
    externalSemrushUrls: external,
  };
}

export function buildMergedSeoContentBrief(input: {
  serpDumpJson: unknown;
  pageUrl: string;
  focusKeyword: string;
  gscPageUrl: string;
  gscQueries: string[];
  semrushOverviewJson: unknown | null;
  llmAudit?: LlmAuditBrief | null;
  queryFanout?: QueryFanout | null;
}): SeoContentBriefV1 {
  const dataforseo = extractDataForSeoSerpBrief(input.serpDumpJson);
  const semrush = input.semrushOverviewJson
    ? extractSemrushBrief(input.semrushOverviewJson)
    : extractSemrushBrief(null);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    focusKeyword: input.focusKeyword.trim(),
    pageUrl: input.pageUrl.trim(),
    dataforseo,
    gsc: {
      pageUrl: input.gscPageUrl.trim(),
      queries: dedupeStrings(input.gscQueries),
    },
    semrush,
    ...(input.llmAudit ? { llmAudit: input.llmAudit } : {}),
    ...(input.queryFanout ? { queryFanout: input.queryFanout } : {}),
  };
}
