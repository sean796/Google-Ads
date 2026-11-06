import {
  deriveKeyTakeawaysFromSummary,
  filterHighlightsTakeaways,
  isNonExistentSectionOmissionStatement,
  stripNonExistentOmissionClauses,
  deckNarrativeText,
  expandClientReportNarrativeParagraphs,
  plainDeckText,
  sanitizeDeckOpportunity,
  sanitizeDeckOpportunityComparisonRows,
  sanitizeExecutiveSummaryText,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import { isLocalGridNarrativePlaceholder } from "@/lib/organic-dashboard/local-grid-report-narrative";
import type {
  OrganicDeckOpportunity,
  OrganicReportingHighlights,
} from "./organic-reporting-highlights-types";

function sanitizeOpportunityList(raw: unknown): OrganicDeckOpportunity[] {
  if (!Array.isArray(raw)) return [];
  const out: OrganicDeckOpportunity[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rank = typeof r.rank === "number" ? r.rank : Number(r.rank);
    if (!Number.isFinite(rank)) continue;
    if (typeof r.label !== "string" || typeof r.why !== "string") continue;
    const comparisonRows = sanitizeDeckOpportunityComparisonRows(r.comparisonRows);
    if (comparisonRows.length === 0 && typeof r.metrics !== "string") continue;
    let evidence: string[] | undefined;
    if (Array.isArray(r.evidence)) {
      evidence = r.evidence.filter((e) => typeof e === "string" && e.trim()).map(String);
    }
    out.push(
      sanitizeDeckOpportunity({
        rank,
        label: r.label,
        why: r.why,
        comparisonRows,
        metrics: typeof r.metrics === "string" ? r.metrics : "",
        action: typeof r.action === "string" ? r.action : "",
        evidence,
      }),
    );
  }
  return out;
}

/** Ensures deck render always has headline + bullets (e.g. payloads saved before keyTakeaways existed). */
export function normalizeOrganicReportingHighlights(raw: unknown): OrganicReportingHighlights | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.executiveSummary)) return null;
  const cleanSummary = sanitizeExecutiveSummaryText(String(o.executiveSummary));
  const topOpportunities = sanitizeOpportunityList(o.topOpportunities);
  const fromApi = Array.isArray(o.keyTakeaways)
    ? filterHighlightsTakeaways(
        o.keyTakeaways.filter((t) => isNonEmptyString(t)).map((t) => plainDeckText(String(t))),
      )
    : [];
  const performanceNarrative = sanitizeNarrativeParagraphs(o.performanceNarrative, 4);
  const keywordNarrative = sanitizeNarrativeParagraphs(o.keywordNarrative, 4);
  const googleAdsNarrative = sanitizeNarrativeParagraphs(o.googleAdsNarrative, 2);
  const localGridNarrative = sanitizeNarrativeParagraphs(o.localGridNarrative, 2).filter(
    (p) => !isLocalGridNarrativePlaceholder(p),
  );

  if (fromApi.length >= 2) {
    return {
      executiveSummary: cleanSummary,
      keyTakeaways: fromApi.slice(0, 4),
      performanceNarrative,
      keywordNarrative,
      googleAdsNarrative,
      localGridNarrative,
      topOpportunities,
    };
  }
  const derived = deriveKeyTakeawaysFromSummary(cleanSummary);
  const takeaways =
    fromApi.length === 1 ? [fromApi[0]!, ...derived.takeaways].slice(0, 4) : derived.takeaways;
  while (takeaways.length < 2) {
    takeaways.push("See performance summary and highlights below for detail.");
  }
  return {
    executiveSummary: derived.headline,
    keyTakeaways: takeaways.slice(0, 4).map(plainDeckText),
    performanceNarrative,
    keywordNarrative,
    googleAdsNarrative,
    localGridNarrative,
    topOpportunities,
  };
}

function sanitizeNarrativeParagraphs(raw: unknown, maxItems: number): string[] {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((p) =>
      isNonEmptyString(p)
        ? stripNonExistentOmissionClauses(deckNarrativeText(String(p)))
        : "",
    )
    .filter((p) => isNonEmptyString(p) && !isNonExistentSectionOmissionStatement(p));
  return expandClientReportNarrativeParagraphs(cleaned, maxItems);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parseOrganicReportingHighlightsPayload(raw: string): OrganicReportingHighlights {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const fence = raw.match(/\{[\s\S]*\}/);
    if (!fence) throw new Error("Highlights response was not valid JSON.");
    parsed = JSON.parse(fence[0]!);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Highlights JSON must be an object.");
  }
  const o = parsed as Record<string, unknown>;
  if (!isNonEmptyString(o.executiveSummary)) {
    throw new Error("Highlights missing executiveSummary.");
  }
  if (o.executiveSummary.length > 400) {
    throw new Error("executiveSummary exceeds allowed length.");
  }
  const takeawaysRaw = o.keyTakeaways;
  if (!Array.isArray(takeawaysRaw) || takeawaysRaw.length < 2 || takeawaysRaw.length > 4) {
    throw new Error("keyTakeaways must be an array of 2–4 strings.");
  }
  const keyTakeaways = filterHighlightsTakeaways(
    takeawaysRaw.filter((t) => isNonEmptyString(t)).map((t) => plainDeckText(String(t))),
  );
  if (keyTakeaways.length < 2) {
    const derived = deriveKeyTakeawaysFromSummary(plainDeckText(o.executiveSummary)).takeaways;
    for (const d of derived) {
      if (keyTakeaways.length < 2 && !keyTakeaways.includes(d)) {
        keyTakeaways.push(d);
      }
    }
  }
  if (keyTakeaways.length < 2) {
    throw new Error("keyTakeaways must include at least 2 non-empty strings.");
  }
  const narrativeRaw = o.performanceNarrative;
  if (!Array.isArray(narrativeRaw) || narrativeRaw.length < 1 || narrativeRaw.length > 3) {
    throw new Error("performanceNarrative must be an array of 1–3 strings.");
  }
  const performanceNarrative = narrativeRaw
    .filter((p) => isNonEmptyString(p))
    .map((p) => deckNarrativeText(String(p)));
  if (performanceNarrative.length < 1) {
    throw new Error("performanceNarrative must include at least 1 non-empty paragraph.");
  }
  const keywordRaw = o.keywordNarrative;
  if (!Array.isArray(keywordRaw) || keywordRaw.length < 1 || keywordRaw.length > 2) {
    throw new Error("keywordNarrative must be an array of 1–2 strings.");
  }
  const keywordNarrative = keywordRaw
    .filter((p) => isNonEmptyString(p))
    .map((p) => deckNarrativeText(String(p)));
  if (keywordNarrative.length < 1) {
    throw new Error("keywordNarrative must include at least 1 non-empty paragraph.");
  }
  const googleAdsRaw = o.googleAdsNarrative;
  let googleAdsNarrative: string[] = [];
  if (googleAdsRaw != null) {
    if (!Array.isArray(googleAdsRaw) || googleAdsRaw.length > 2) {
      throw new Error("googleAdsNarrative must be an array of 0–2 strings.");
    }
    googleAdsNarrative = googleAdsRaw
      .filter((p) => isNonEmptyString(p))
      .map((p) => deckNarrativeText(String(p)))
      .slice(0, 2);
  }
  const localGridRaw = o.localGridNarrative;
  let localGridNarrative: string[] = [];
  if (localGridRaw != null) {
    if (!Array.isArray(localGridRaw) || localGridRaw.length > 2) {
      throw new Error("localGridNarrative must be an array of 0–2 strings.");
    }
    localGridNarrative = localGridRaw
      .filter((p) => isNonEmptyString(p))
      .map((p) => deckNarrativeText(String(p)))
      .slice(0, 2);
  }
  const top = o.topOpportunities;
  if (!Array.isArray(top)) throw new Error("topOpportunities must be an array.");
  if (top.length < 3 || top.length > 4) {
    throw new Error("topOpportunities must contain 3 or 4 items.");
  }

  const topOpportunities: OrganicDeckOpportunity[] = [];
  for (let i = 0; i < top.length; i++) {
    const row = top[i];
    if (!row || typeof row !== "object") throw new Error(`topOpportunities[${i}] invalid.`);
    const r = row as Record<string, unknown>;
    const rank = typeof r.rank === "number" ? r.rank : Number(r.rank);
    if (!Number.isFinite(rank)) throw new Error(`topOpportunities[${i}].rank invalid.`);
    if (!isNonEmptyString(r.label) || !isNonEmptyString(r.why)) {
      throw new Error(`topOpportunities[${i}] missing label or why.`);
    }
    const comparisonRows = sanitizeDeckOpportunityComparisonRows(r.comparisonRows);
    if (comparisonRows.length < 1) {
      throw new Error(`topOpportunities[${i}] missing comparisonRows.`);
    }
    let evidence: string[] | undefined;
    if (r.evidence != null) {
      if (!Array.isArray(r.evidence)) throw new Error(`topOpportunities[${i}].evidence must be an array.`);
      evidence = r.evidence.filter((e) => isNonEmptyString(e)).map((e) => plainDeckText(String(e)));
    }
    topOpportunities.push(
      sanitizeDeckOpportunity({
        rank,
        label: r.label,
        why: r.why,
        comparisonRows,
        metrics: typeof r.metrics === "string" ? r.metrics : "",
        action: typeof r.action === "string" ? r.action : "",
        evidence,
      }),
    );
  }

  return {
    executiveSummary: plainDeckText(o.executiveSummary),
    keyTakeaways,
    performanceNarrative: performanceNarrative.slice(0, 4),
    keywordNarrative: keywordNarrative.slice(0, 4),
    googleAdsNarrative,
    localGridNarrative,
    topOpportunities,
  };
}
