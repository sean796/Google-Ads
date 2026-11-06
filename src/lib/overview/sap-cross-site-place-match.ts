import type { SapPlaceMatchResult } from "@/lib/overview/sap-cross-site-image-search-types";

export type { SapPlaceMatchResult } from "@/lib/overview/sap-cross-site-image-search-types";

export function normalizePlaceKey(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  let out = "";
  let space = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      space = true;
      continue;
    }
    if (space && out.length > 0) out += " ";
    space = false;
    out += ch;
  }
  return out;
}

/** Slug segments → place key (`stadium-station-edmonton` → `stadium station edmonton`). */
export function placeKeyFromSlug(slug: string): string {
  return normalizePlaceKey(String(slug ?? "").split("-").join(" "));
}

/** Path of a page URL → place key (`.../edmonton-city-centre/` → `edmonton city centre`). */
export function placeKeyFromPageUrl(pageUrl: string): string {
  const raw = String(pageUrl ?? "").trim();
  if (!raw) return "";
  let path = raw;
  const scheme = raw.indexOf("://");
  if (scheme >= 0) {
    const afterHost = raw.slice(scheme + 3);
    const slash = afterHost.indexOf("/");
    path = slash >= 0 ? afterHost.slice(slash + 1) : "";
  }
  let end = path.length;
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i]!;
    if (ch === "?" || ch === "#") {
      end = i;
      break;
    }
  }
  path = path.slice(0, end);
  let spaced = "";
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i]!;
    if (ch === "/" || ch === "-" || ch === "_") spaced += " ";
    else spaced += ch;
  }
  return normalizePlaceKey(spaced);
}

function placeEntityTokens(entityKey: string): string[] {
  const out: string[] = [];
  const parts = entityKey.split(" ");
  for (const p of parts) {
    const t = p.trim();
    if (t) out.push(t);
  }
  return out;
}

function haystackHasToken(haystack: string, token: string): boolean {
  if (!token) return true;
  if (haystack.includes(token)) return true;
  if (token === "centre" && haystack.includes("center")) return true;
  if (token === "center" && haystack.includes("centre")) return true;
  return false;
}

function haystackHasAllPlaceTokens(haystack: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  for (const t of tokens) {
    if (!haystackHasToken(haystack, t)) return false;
  }
  return true;
}


/**
 * Match place entity against SAP page title, slug, keyword, or pageUrl.
 * Prefer exact equality; then full-string contain; then token fuzzy (all place tokens).
 */
export function sapPageMatchesPlaceEntity(params: {
  placeEntity: string;
  title?: string;
  slug?: string;
  keyword?: string;
  pageUrl?: string;
}): SapPlaceMatchResult {
  const entity = normalizePlaceKey(params.placeEntity);
  if (!entity) return { match: false, score: 0 };

  const titleKey = normalizePlaceKey(params.title ?? "");
  const slugKey = placeKeyFromSlug(params.slug ?? "");
  const keywordKey = normalizePlaceKey(params.keyword ?? "");
  const urlKey = placeKeyFromPageUrl(params.pageUrl ?? "");
  const tokens = placeEntityTokens(entity);

  if (slugKey === entity || titleKey === entity || urlKey === entity) {
    return { match: true, score: 3 };
  }
  if (
    (titleKey && titleKey.includes(entity)) ||
    (slugKey && slugKey.includes(entity)) ||
    (urlKey && urlKey.includes(entity)) ||
    (keywordKey && (keywordKey === entity || keywordKey.includes(entity)))
  ) {
    return { match: true, score: 2 };
  }

  const haystack = normalizePlaceKey(
    [titleKey, slugKey, keywordKey, urlKey].filter(Boolean).join(" "),
  );
  if (haystackHasAllPlaceTokens(haystack, tokens)) {
    return { match: true, score: 1 };
  }
  return { match: false, score: 0 };
}
