import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type {
  CompetitorResearchSemrushResponse,
  GscCompetitorDateRange,
  GscSiteQueryRow,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import { sortKeywordsByTrafficThenVolume } from "@/lib/competitor-research/competitor-keyword-sort";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";


function parseTiersJson(content: string): TieredCompetitorsResult {
  try {
    const o = JSON.parse(content) as unknown;
    if (o && typeof o === "object" && Array.isArray((o as TieredCompetitorsResult).tiers)) {
      return o as TieredCompetitorsResult;
    }
  } catch {
    /* slice */
  }
  const a = content.indexOf("{");
  const b = content.lastIndexOf("}");
  if (a >= 0 && b > a) {
    const o = JSON.parse(content.slice(a, b + 1)) as unknown;
    if (o && typeof o === "object" && Array.isArray((o as TieredCompetitorsResult).tiers)) {
      return o as TieredCompetitorsResult;
    }
  }
  throw new Error("Research model did not return valid JSON with a tiers array.");
}

/**
 * Uses the research model only - semantic tiers and rationales (no regex competitor rules).
 */
export async function runCompetitorTierAgent(
  semrush: CompetitorResearchSemrushResponse,
  options?: {
    siteId?: string;
    siteName?: string;
    /** Active site URL - hostname/TLD is context only, not a geographic market. */
    seedSiteUrl?: string;
    semrushDatabase?: string;
    apiKey?: string;
    /** Top GSC queries for this site (same run as Analyze); omitted if GSC failed. */
    gscSiteQueries?: GscSiteQueryRow[];
    gscDateRange?: GscCompetitorDateRange | null;
  },
): Promise<TieredCompetitorsResult> {
  const apiKey = options?.apiKey ?? loadApiKey();
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("Add an OpenRouter API key in app settings to analyze competitors.");
  }

  const gscTop =
    options?.gscSiteQueries?.length && options.gscSiteQueries.length > 0
      ? [...options.gscSiteQueries]
          .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
          .slice(0, 80)
          .map((q) => ({
            query: q.query,
            clicks: q.clicks,
            impressions: q.impressions,
            position: q.position,
          }))
      : [];

  const seedTopKeywords =
    semrush.seedTopKeywords?.length && semrush.seedTopKeywords.length > 0
      ? sortKeywordsByTrafficThenVolume([...semrush.seedTopKeywords]).slice(0, 45)
      : [];

  const userPayload = {
    seedDomain: semrush.seedDomain,
    semrushDatabase: semrush.database ?? options?.semrushDatabase ?? "us",
    seedSiteUrl: options?.seedSiteUrl ?? null,
    siteName: options?.siteName ?? null,
    semrushRows: semrush.rows,
    enrichmentByDomain: semrush.enrichmentByDomain ?? {},
    /** Seed domain’s top organic phrases - cross-check sub-niche vs gscTopQueries. */
    seedTopKeywords,
    errors: semrush.errors ?? [],
    gscDateRange: options?.gscDateRange ?? null,
    gscTopQueries: gscTop,
  };

  const isDfs = semrush.dataSource === "dfs" || semrush.database === "dfs";

  const overlapIntro = isDfs
    ? `DataForSEO Labs listed these domains because they share organic keyword overlap with the seed domain for the selected market (semrushDatabase is typically "dfs"; location is inferred from the seed site). Among what remains, **not every row is an equally strong direct competitor** (some may be partial overlap, directories, or adjacent retailers).`
    : `Semrush listed these domains because they share organic keyword overlap with the seed domain in the **regional database** given as semrushDatabase (e.g. us, uk). Among what remains, **not every row is an equally strong direct competitor** (some may be partial overlap, directories, or adjacent retailers).`;

  const seedKwSource = isDfs
    ? `cross-check **seedTopKeywords** (top phrases the seed domain ranks for in DataForSEO Labs ranked keywords)`
    : `cross-check **seedTopKeywords** (top phrases the seed domain ranks for in Semrush)`;

  const gscOverlapNote = isDfs
    ? `**Penalize** topical mismatch even when overlap counts look high.`
    : `**Penalize** topical mismatch even when Semrush overlap counts look high.`;

  const geoNote = isDfs
    ? `Competitors appear because DataForSEO Labs found keyword overlap for the **selected location/language** (semrushDatabase). The seed site's hostname/TLD (seedSiteUrl) is **fact for context only**, not proof of market.`
    : `Competitors appear only because they overlap in the **selected Semrush database** (semrushDatabase). The seed site's hostname/TLD (seedSiteUrl) is **fact for context only**, not proof of market.`;

  const rationaleMetrics = isDfs
    ? `For each competitor, \`rationale\` must be **one short sentence** that cites **row metrics** when possible: commonKeywords, organicTraffic, organicKeywords, trafficCost, competitionLevel - or top keyword phrases from enrichmentByDomain when present. **Do not** cite authorityScore, referringDomains, or backlinksTotal (not available for this data source). When GSC is present, briefly tie relevance (or mismatch) to **sub-niche themes** from gscTopQueries (and seedTopKeywords when useful). No geographic storytelling unless the user payload explicitly includes geographic metadata (it usually will not).`
    : `For each competitor, \`rationale\` must be **one short sentence** that cites **Semrush metrics** from the row when possible: commonKeywords, organicTraffic (Or), organicKeywords (Oc), competitionLevel (Cr), trafficCost (Ot), and when present authorityScore, referringDomains, backlinksTotal - or top keyword phrases from enrichmentByDomain when present. When GSC is present, briefly tie relevance (or mismatch) to **sub-niche themes** from gscTopQueries (and seedTopKeywords when useful). No geographic storytelling unless the user payload explicitly includes geographic metadata (it usually will not).`;

  const summaryFoot = isDfs
    ? `still grounded in overlap metrics (keyword overlap, traffic, keyword counts) - not generic fluff.`
    : `still grounded in Semrush numbers (overlap, traffic, keywords) - not generic fluff.`;

  const system = `You are an SEO strategist. The **semrushRows** you receive are **already filtered**: mega-platforms (YouTube, Facebook, Reddit, Amazon, Wikipedia, major search/social, etc.) have been **removed**. Every remaining domain is a **candidate** for niche or direct business competition - classify them into tiers accordingly.

${overlapIntro}

**Sub-niche first (when gscTopQueries and/or seedTopKeywords exist):** Before tiering, infer the seed site’s **search sub-niche(s)** from **gscTopQueries** (weight impressions and clicks) and ${seedKwSource}. Look for **intent and audience**, not a single broad category: commercial vs hobbyist, wholesale vs consumer retail, equipment/vendor vs editorial or lifestyle media, industrial or modular vs generic mass-market product, B2B vs DTC, rental vs reviews - **whatever the data actually suggests**. **Do not** collapse everything into one umbrella label if GSC shows a **tighter** pattern.

**Umbrella-term trap:** High **commonKeywords** or shared product vocabulary does **not** prove same **sub-niche**. If **gscTopQueries** and **seedTopKeywords** point to one angle (e.g. specialized structures, distribution, named product lines, commercial projects) and a competitor’s **enrichmentByDomain** themes point to a clearly **different** angle (e.g. broad consumer hobby, general travel/lifestyle, unrelated editorial), that competitor must **not** be tier **high** - use **medium** or **low** and explain the theme gap in \`rationale\`. Reserve **high** for domains that plausibly chase the **same** buyer intent and topic cluster implied by GSC + seed keywords.

**Google Search Console (when gscTopQueries is non-empty):** Treat **gscTopQueries** as the **primary signal** for real-world search demand over **gscDateRange**. **Score** must reflect **alignment with that sub-niche**, not raw overlap alone. ${gscOverlapNote} If **gscTopQueries** is empty, infer sub-niche from **seedTopKeywords** and **enrichment** only.

**Geography / market (critical):** Do **not** infer country, city, or “market” from competitor **TLDs** (.co.uk, .nl, .de, etc.). ${geoNote}

**Rationale (critical):** ${rationaleMetrics}

Return **only** a JSON object with this exact shape:
{"summary":"one or two sentences","tiers":[{"tier":"high"|"medium"|"low","label":"short human label","competitors":[{"domain":"string","score":0-100,"rationale":"one sentence citing numbers or keywords"}]}]}

**summary:** Write it like a **deck subtitle** - crisp, client-ready, ${summaryFoot}

Rules:
- Assign every input domain from semrushRows to exactly one tier (high = same **sub-niche** as GSC+seed imply; medium = partial / adjacent overlap; low = weak or ambiguous overlap).
- Put **true same-sub-niche competitors** in **tier "high"** and use label **Direct competitors** (or similar). Sites that only share **broad** category overlap with the seed belong in **medium** or **low**, not **high**. Social platforms and obvious non-competitors must not be in **high**.
- Use **score** 0-100 for **sub-niche and demand alignment** with the seed site (GSC-first when gscTopQueries is non-empty), not for “biggest site” or raw overlap alone.
- Order competitors within each tier by descending score.
- Include all domains from semrushRows (same count); do not invent domains.
- summary: synthesize the competitive set using **GSC/seed sub-niche themes (when present), keyword overlap, and fit**, not region guesses.`;

  const res = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model: getResearchModel(options?.siteId),
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      temperature: 0.25,
      max_tokens: 8192,
      stream: false,
    }),
  });
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) {
    const detail = j.error?.message || JSON.stringify(j);
    throw new Error(`OpenRouter error (${res.status}): ${detail}`);
  }
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`OpenRouter error (${res.status}): no content`);
  }
  return parseTiersJson(content);
}
