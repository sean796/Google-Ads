import type { WordPressSite } from "@/components/integrations/types";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { activeChildSitemapUrls } from "@/lib/wordpress-property-sitemaps";

export type SitemapSystemRole = "pages" | "posts" | "entity" | "competitor";

export type SitemapChildTagEntry = {
  roles: SitemapSystemRole[];
  custom: string[];
};

export type SitemapScopeOption = {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
};

const GENERIC_WP_COLLECTIONS = new Set(["posts", "post", "pages", "page"]);
const SINGLETON_ROLES: SitemapSystemRole[] = ["pages", "posts", "entity", "competitor"];

export function normalizeCustomSitemapTagLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function customScopeIdFromLabel(label: string): string {
  const slug = normalizeCustomSitemapTagLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `custom:${slug || "tag"}`;
}

export function parseCustomScopeLabel(scopeId: string): string | null {
  if (!scopeId.startsWith("custom:")) return null;
  return scopeId.slice("custom:".length);
}

export function isBuiltinBulkScopeId(id: string): id is "pages" | "posts" | "entities" {
  return id === "pages" || id === "posts" || id === "entities";
}

function normalizeSitemapUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function sitemapFilename(url: string): string {
  return (url.split("/").pop() ?? "").toLowerCase();
}

function isPageChildSitemap(url: string): boolean {
  const tail = sitemapFilename(url);
  return tail.includes("page-sitemap") || tail.includes("pages-sitemap") || tail.includes("page_sitemap");
}

function isPostChildSitemap(url: string): boolean {
  const tail = sitemapFilename(url);
  return (
    tail.includes("post-sitemap") ||
    tail.includes("post_sitemap") ||
    tail.includes("posts-sitemap") ||
    tail.includes("posts_sitemap") ||
    tail.includes("news-sitemap") ||
    tail.includes("article-sitemap") ||
    (tail.includes("post") && !isPageChildSitemap(url)) ||
    tail.includes("blog")
  );
}

export function inferSystemRolesFromChildUrl(url: string): SitemapSystemRole[] {
  const roles: SitemapSystemRole[] = [];
  if (isPageChildSitemap(url)) roles.push("pages");
  if (isPostChildSitemap(url)) roles.push("posts");
  return roles;
}

function emptyEntry(): SitemapChildTagEntry {
  return { roles: [], custom: [] };
}

export function getChildTagEntry(
  site: Pick<WordPressSite, "sitemaps">,
  childUrl: string,
): SitemapChildTagEntry {
  const entry = site.sitemaps?.childTagsByUrl?.[childUrl];
  if (!entry) return emptyEntry();
  return {
    roles: [...entry.roles],
    custom: [...entry.custom],
  };
}

export type SitemapTagSiteSlice = Pick<
  WordPressSite,
  "sitemaps" | "entitySitemapUrl" | "competitorEntitySitemapUrl"
>;

export function resolveChildUrlForRole(
  site: SitemapTagSiteSlice,
  role: SitemapSystemRole,
): string | null {
  const children = site.sitemaps?.childSitemaps ?? [];
  for (const url of children) {
    const roles = site.sitemaps?.childTagsByUrl?.[url]?.roles ?? [];
    if (roles.includes(role)) return url.trim() || null;
  }
  if (role === "entity" && site.entitySitemapUrl?.trim()) {
    return site.entitySitemapUrl.trim();
  }
  if (role === "competitor" && site.competitorEntitySitemapUrl?.trim()) {
    return site.competitorEntitySitemapUrl.trim();
  }
  if (role === "pages") {
    const hit = activeChildSitemapUrls(site).find(isPageChildSitemap);
    return hit?.trim() || null;
  }
  if (role === "posts") {
    const hit = (site.sitemaps?.childSitemaps ?? []).find(isPostChildSitemap);
    return hit?.trim() || null;
  }
  return null;
}

export function restCollectionForChildUrl(
  site: Pick<WordPressSite, "sitemaps" | "manualEndpoint" | "entitySitemapUrl">,
  childUrl: string,
): string | null {
  const url = childUrl.trim();
  if (!url) return null;
  const fromMap = site.sitemaps?.endpoints?.[url]?.trim();
  if (fromMap && !GENERIC_WP_COLLECTIONS.has(fromMap.toLowerCase())) {
    return fromMap;
  }
  const ep = extractEndpointFromEntitySitemapUrl(url);
  if (!ep || GENERIC_WP_COLLECTIONS.has(ep.toLowerCase())) return null;
  return ep;
}

export function childUrlsForCustomTag(site: WordPressSite, label: string): string[] {
  const norm = normalizeCustomSitemapTagLabel(label).toLowerCase();
  if (!norm) return [];
  const out: string[] = [];
  const map = site.sitemaps?.childTagsByUrl ?? {};
  for (const [url, entry] of Object.entries(map)) {
    const has = entry.custom.some((t) => normalizeCustomSitemapTagLabel(t).toLowerCase() === norm);
    if (has) out.push(url);
  }
  return out;
}

export function restCollectionsForCustomTag(site: WordPressSite, label: string): string[] {
  const urls = childUrlsForCustomTag(site, label);
  const collections: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const coll = restCollectionForChildUrl(site, url);
    if (!coll) continue;
    const key = coll.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    collections.push(coll);
  }
  return collections;
}

function removeRoleFromAllChildren(
  childTagsByUrl: Record<string, SitemapChildTagEntry>,
  role: SitemapSystemRole,
  exceptUrl?: string,
): Record<string, SitemapChildTagEntry> {
  const next: Record<string, SitemapChildTagEntry> = {};
  for (const [url, entry] of Object.entries(childTagsByUrl)) {
    if (exceptUrl && normalizeSitemapUrl(url) === normalizeSitemapUrl(exceptUrl)) {
      next[url] = { ...entry, roles: [...entry.roles], custom: [...entry.custom] };
      continue;
    }
    const roles = entry.roles.filter((r) => r !== role);
    if (roles.length > 0 || entry.custom.length > 0) {
      next[url] = { roles, custom: [...entry.custom] };
    }
  }
  return next;
}

export function applyChildTagPatch(
  site: WordPressSite,
  childUrl: string,
  patch: Partial<SitemapChildTagEntry>,
): WordPressSite {
  const url = childUrl.trim();
  if (!url || !site.sitemaps) return site;

  let childTagsByUrl: Record<string, SitemapChildTagEntry> = {
    ...(site.sitemaps.childTagsByUrl ?? {}),
  };
  const prev = childTagsByUrl[url] ?? emptyEntry();
  const nextEntry: SitemapChildTagEntry = {
    roles: patch.roles ?? [...prev.roles],
    custom: patch.custom ?? [...prev.custom],
  };

  for (const role of nextEntry.roles) {
    if (SINGLETON_ROLES.includes(role)) {
      childTagsByUrl = removeRoleFromAllChildren(childTagsByUrl, role, url);
    }
  }

  if (nextEntry.roles.length === 0 && nextEntry.custom.length === 0) {
    const { [url]: _removed, ...rest } = childTagsByUrl;
    childTagsByUrl = rest;
  } else {
    childTagsByUrl[url] = nextEntry;
  }

  let entitySitemapUrl = site.entitySitemapUrl;
  let competitorEntitySitemapUrl = site.competitorEntitySitemapUrl;

  if (nextEntry.roles.includes("entity")) {
    entitySitemapUrl = url;
  } else if (entitySitemapUrl && normalizeSitemapUrl(entitySitemapUrl) === normalizeSitemapUrl(url)) {
    entitySitemapUrl = undefined;
  }

  if (nextEntry.roles.includes("competitor")) {
    competitorEntitySitemapUrl = url;
  } else if (
    competitorEntitySitemapUrl &&
    normalizeSitemapUrl(competitorEntitySitemapUrl) === normalizeSitemapUrl(url)
  ) {
    competitorEntitySitemapUrl = undefined;
  }

  return {
    ...site,
    entitySitemapUrl,
    competitorEntitySitemapUrl,
    sitemaps: {
      ...site.sitemaps,
      childTagsByUrl,
    },
  };
}

export function toggleChildSystemRole(
  site: WordPressSite,
  childUrl: string,
  role: SitemapSystemRole,
): WordPressSite {
  const entry = getChildTagEntry(site, childUrl);
  const has = entry.roles.includes(role);
  const roles = has ? entry.roles.filter((r) => r !== role) : [...entry.roles, role];
  return applyChildTagPatch(site, childUrl, { roles, custom: entry.custom });
}

export function toggleChildCustomTag(
  site: WordPressSite,
  childUrl: string,
  label: string,
): WordPressSite {
  const norm = normalizeCustomSitemapTagLabel(label);
  if (!norm) return site;
  const entry = getChildTagEntry(site, childUrl);
  const lower = norm.toLowerCase();
  const has = entry.custom.some((t) => normalizeCustomSitemapTagLabel(t).toLowerCase() === lower);
  const custom = has
    ? entry.custom.filter((t) => normalizeCustomSitemapTagLabel(t).toLowerCase() !== lower)
    : [...entry.custom, norm];
  const labels = new Set(
    (site.customSitemapTagLabels ?? []).map((t) => normalizeCustomSitemapTagLabel(t)),
  );
  labels.add(norm);
  return {
    ...applyChildTagPatch(site, childUrl, { roles: entry.roles, custom }),
    customSitemapTagLabels: [...labels],
  };
}

export function addCustomSitemapTagLabel(site: WordPressSite, rawLabel: string): WordPressSite {
  const norm = normalizeCustomSitemapTagLabel(rawLabel);
  if (!norm) return site;
  const labels = new Set(
    (site.customSitemapTagLabels ?? []).map((t) => normalizeCustomSitemapTagLabel(t)),
  );
  labels.add(norm);
  return { ...site, customSitemapTagLabels: [...labels] };
}

export function pruneChildTagsForSitemapList(
  sitemaps: NonNullable<WordPressSite["sitemaps"]>,
  childSitemaps: string[],
): NonNullable<WordPressSite["sitemaps"]> {
  const allowed = new Set(childSitemaps);
  const childTagsByUrl = sitemaps.childTagsByUrl;
  if (!childTagsByUrl) return sitemaps;
  const next: Record<string, SitemapChildTagEntry> = {};
  for (const [url, entry] of Object.entries(childTagsByUrl)) {
    if (allowed.has(url)) next[url] = entry;
  }
  return { ...sitemaps, childTagsByUrl: Object.keys(next).length > 0 ? next : undefined };
}

export function mergeAutoChildTagsOnDetect(
  site: WordPressSite,
  sitemaps: NonNullable<WordPressSite["sitemaps"]>,
  options?: {
    detectedEntityUrl?: string | null;
    detectedCompetitorUrl?: string | null;
  },
): NonNullable<WordPressSite["sitemaps"]> {
  const children = sitemaps.childSitemaps ?? [];
  let pruned = pruneChildTagsForSitemapList(sitemaps, children);
  let childTagsByUrl: Record<string, SitemapChildTagEntry> = {
    ...(pruned.childTagsByUrl ?? {}),
  };

  for (const url of children) {
    if (childTagsByUrl[url]) continue;
    const inferred = inferSystemRolesFromChildUrl(url);
    if (inferred.length > 0) {
      childTagsByUrl[url] = { roles: inferred, custom: [] };
    }
  }

  const applyDetectedRole = (url: string | null | undefined, role: SitemapSystemRole) => {
    const trimmed = url?.trim();
    if (!trimmed || !children.includes(trimmed)) return;
    const existing = childTagsByUrl[trimmed];
    if (existing && existing.roles.length > 0) return;
    childTagsByUrl = removeRoleFromAllChildren(childTagsByUrl, role, trimmed);
    const prev = childTagsByUrl[trimmed] ?? emptyEntry();
    childTagsByUrl[trimmed] = {
      roles: [...new Set([...prev.roles, role])],
      custom: prev.custom,
    };
  };

  applyDetectedRole(options?.detectedEntityUrl, "entity");
  applyDetectedRole(options?.detectedCompetitorUrl, "competitor");

  pruned = { ...pruned, childTagsByUrl: Object.keys(childTagsByUrl).length > 0 ? childTagsByUrl : undefined };
  return pruned;
}

export function listSitemapScopeOptions(site: WordPressSite | null | undefined): SitemapScopeOption[] {
  const options: SitemapScopeOption[] = [
    { id: "pages", label: "Pages", enabled: true },
    { id: "posts", label: "Posts", enabled: true },
    {
      id: "entities",
      label: "Entities",
      enabled: true,
    },
  ];

  const labels = site?.customSitemapTagLabels ?? [];
  for (const label of labels) {
    const norm = normalizeCustomSitemapTagLabel(label);
    if (!norm) continue;
    const collections = site ? restCollectionsForCustomTag(site, norm) : [];
    options.push({
      id: customScopeIdFromLabel(norm),
      label: norm,
      enabled: collections.length > 0,
      disabledReason: collections.length > 0 ? undefined : "No REST collection for this tag",
    });
  }

  return options;
}
