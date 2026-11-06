/**
 * When the model picks a Wikipedia *topic* article (mirrors the service keyword),
 * the "wiki location" column looks like a second keyword. Clear those hints.
 */

import { isOverlyBroadGridEntityHint } from "@/lib/grid-entity-hint-breadth";
import { isInternalGridPlaceBucketLabel } from "@/lib/local-dominator-csv";
import type { SapRoughClusterRow } from "@/lib/local-analysis-keyword-cluster";

/** Lowercase disambiguation tails like "Foo (window)" - never valid geography. */
const TOPIC_DISAMBIG_INNER = new Set([
  "window",
  "film",
  "sport",
  "sports",
  "band",
  "song",
  "album",
  "disambiguation",
  "vehicle",
  "computer",
  "game",
  "genus",
  "species",
]);

function normalizeWord(raw: string): string {
  const w = raw.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function wordTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 1);
}

function tokensMatchKeywordToken(kwTok: string, hintTok: string): boolean {
  if (kwTok === hintTok) return true;
  if (kwTok.length < 3 || hintTok.length < 3) return false;
  return kwTok.startsWith(hintTok) || hintTok.startsWith(kwTok);
}

function rejectIfOverlyBroad(h: string): string {
  if (isOverlyBroadGridEntityHint(h)) return "";
  return h;
}

/** Two-word service phrases that mimic place names (e.g. City + "Sports Medicine") — not geography. */
const SERVICE_PLACE_LIKE_BIGRAMS = new Set(
  [
    "sports medicine",
    "prenatal care",
    "occupational health",
    "pain relief",
    "back pain",
    "neck pain",
    "car accident",
    "motor vehicle",
    "injury treatment",
    "wellness services",
    "health wellness",
  ].map((s) => s.toLowerCase()),
);

/** True when the string reads like a clinic/service label, not a suburb or address line. */
export function rejectServiceFlavoredLocationString(h: string): boolean {
  const t = typeof h === "string" ? h.trim() : "";
  if (!t) return false;
  /** "Neighbourhood, City" / "Place, ST" — keep. */
  const commaIdx = t.indexOf(",");
  if (commaIdx > 0 && commaIdx < t.length - 1) {
    const after = t.slice(commaIdx + 1).trim();
    if (after.length >= 2) return false;
  }
  /** "Calgary South" / "NE Calgary" style — keep short compass / quadrant labels. */
  if (/^(north|south|east|west|northeast|northwest|southeast|southwest|ne|nw|se|sw)\b/i.test(t)) {
    return false;
  }
  if (/\b(North|South|East|West|NE|NW|SE|SW)\s*$/i.test(t)) return false;

  const lower = t.toLowerCase().replace(/\s+/g, " ");
  for (const phrase of SERVICE_PLACE_LIKE_BIGRAMS) {
    if (lower.includes(phrase)) return true;
  }
  if (/\b(clinic|hospital|medical center|medical centre)\b/i.test(t)) return true;
  /** "… Sports Medicine" / "… Family Medicine" without comma — treat as org-style, not a district. */
  if (/\s(medicine|chiropractic)\s*$/i.test(t)) return true;
  return false;
}

/**
 * After keyword duplicate stripping: drop service-flavoured fake "places", then rejectIfOverlyBroad.
 */
export function finalizeEntityHintForKeywordTarget(keyword: string, entityHint: string | undefined): string {
  const step1 = sanitizeEntityHintForKeywordTarget(keyword, entityHint);
  if (!step1) return "";
  if (isInternalGridPlaceBucketLabel(step1)) return "";
  if (rejectServiceFlavoredLocationString(step1)) return "";
  return step1;
}

/**
 * Returns a trimmed entity hint, or "" when the hint duplicates the keyword theme
 * (topic article title vs service keyword) and should not occupy the geography column.
 */
export function sanitizeEntityHintForKeywordTarget(keyword: string, entityHint: string | undefined): string {
  const h = typeof entityHint === "string" ? entityHint.trim() : "";
  if (!h) return "";
  const kw = keyword.trim();
  if (!kw) return rejectIfOverlyBroad(h);

  const kNorm = kw.toLowerCase().replace(/\s+/g, " ").trim();
  const hNorm = h.toLowerCase().replace(/\s+/g, " ").trim();
  if (hNorm === kNorm) return "";

  const paren = h.match(/\(\s*([a-z][a-z-]*)\s*\)\s*$/);
  if (paren && TOPIC_DISAMBIG_INNER.has(paren[1]!.toLowerCase())) return "";

  if (kNorm.includes(hNorm) && hNorm.length >= 4) return "";

  const kwT = wordTokens(kw);
  const ht = wordTokens(h);
  if (ht.length === 0) return rejectIfOverlyBroad(h);

  let covered = 0;
  for (const w of ht) {
    let ok = false;
    for (const k of kwT) {
      if (tokensMatchKeywordToken(k, w)) {
        ok = true;
        break;
      }
    }
    if (ok) covered++;
  }
  if (covered === ht.length) return "";

  return rejectIfOverlyBroad(h);
}

/**
 * After sanitization clears a topic-only hint, pick a geographic title from the Wikipedia `###` pool.
 * Rotates by `seedIndex` so multiple seeds do not all get the same line when possible.
 */
export function backfillEntityHintFromWikipediaPool(
  keyword: string,
  wikiTitles: string[],
  seedIndex: number,
): string | undefined {
  if (!wikiTitles.length) return undefined;
  const kw = keyword.trim();
  for (let j = 0; j < wikiTitles.length; j++) {
    const t = wikiTitles[(seedIndex + j) % wikiTitles.length]!.trim();
    if (!t) continue;
    const s = finalizeEntityHintForKeywordTarget(kw, t);
    if (s.length > 0) return s;
  }
  const fallback = wikiTitles[seedIndex % wikiTitles.length]!.trim();
  const sanitized = finalizeEntityHintForKeywordTarget(kw, fallback);
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * When Wikipedia pool is missing or empty, pick a **City, ST** (or similar) label from grid-derived place hints.
 * Rotates by `seedIndex` so multiple seeds spread across distinct cities when the CSV contains them.
 */
export function backfillEntityHintFromGridPlaceHints(
  keyword: string,
  placeHints: string[],
  seedIndex: number,
): string | undefined {
  if (!placeHints.length) return undefined;
  const kw = keyword.trim();
  for (let j = 0; j < placeHints.length; j++) {
    const t = placeHints[(seedIndex + j) % placeHints.length]!.trim();
    if (!t) continue;
    const s = finalizeEntityHintForKeywordTarget(kw, t);
    if (s.length > 0) return s;
  }
  const fallback = placeHints[seedIndex % placeHints.length]!.trim();
  const sanitized = finalizeEntityHintForKeywordTarget(kw, fallback);
  return sanitized.length > 0 ? sanitized : undefined;
}

function normalizeSeedEntityHint(h: string | undefined): string {
  return typeof h === "string" ? h.toLowerCase().replace(/\s+/g, " ").trim() : "";
}

function uniqueHintOrder(hints: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of hints) {
    const t = g.trim();
    const n = normalizeSeedEntityHint(t);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(t);
  }
  return out;
}

/**
 * When multiple seed clusters share the same normalized entityHint, rotate duplicates through
 * distinct **City, ST** labels from the grid CSV (then optional Wikipedia pool) so keyword rows
 * do not list the same origin twice when the grid offers other places.
 */
export function rotateDuplicateSeedEntityHintsFromGrid(
  rows: SapRoughClusterRow[],
  gridHintsForBackfill: string[],
  wikiPoolFallback?: string[],
): SapRoughClusterRow[] {
  const gridOrder = uniqueHintOrder(gridHintsForBackfill);
  const wikiOrder = wikiPoolFallback ? uniqueHintOrder(wikiPoolFallback) : [];
  if (gridOrder.length < 2 && wikiOrder.length < 2) return rows;

  const seeds = rows.filter((r) => r.clusterRole === "seed");
  if (seeds.length < 2) return rows;

  const newHints = new Map<string, string>();
  const runningUsed = new Set<string>();

  const pickReplacement = (excludeNorm: string): string | undefined => {
    for (const g of gridOrder) {
      const gn = normalizeSeedEntityHint(g);
      if (gn && gn !== excludeNorm && !runningUsed.has(gn)) {
        runningUsed.add(gn);
        return g;
      }
    }
    for (const w of wikiOrder) {
      const wn = normalizeSeedEntityHint(w);
      if (wn && wn !== excludeNorm && !runningUsed.has(wn)) {
        runningUsed.add(wn);
        return w;
      }
    }
    return undefined;
  };

  for (const s of seeds) {
    const n = normalizeSeedEntityHint(s.entityHint);
    if (!n) continue;
    if (!runningUsed.has(n)) {
      runningUsed.add(n);
      continue;
    }
    const replacement = pickReplacement(n);
    if (replacement) {
      newHints.set(s.clusterId, replacement);
    }
  }

  if (newHints.size === 0) return rows;
  return rows.map((r) => {
    if (r.clusterRole !== "seed") return r;
    const nh = newHints.get(r.clusterId);
    return nh ? { ...r, entityHint: nh } : r;
  });
}
