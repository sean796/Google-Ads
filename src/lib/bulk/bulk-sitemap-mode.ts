import type { CSVRow, WordPressPostingOptions } from "@/lib/bulk-auto-generate";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";

export type BulkSitemapMode = "post" | "entity" | "custom";
export type BulkRowSitemapType = "post" | "entity";
export type BulkSitemapScopeTag =
  | "pages"
  | "posts"
  | "entities"
  | `custom:${string}`;

const BUILTIN_SCOPE_TAGS = new Set<string>(["pages", "posts", "entities"]);

export function isCustomBulkScopeTag(tag: string): tag is `custom:${string}` {
  return tag.startsWith("custom:");
}

export function splitBulkScopeTags(scopes: BulkSitemapScopeTag[]): {
  builtin: Array<"pages" | "posts" | "entities">;
  custom: `custom:${string}`[];
} {
  const builtin: Array<"pages" | "posts" | "entities"> = [];
  const custom: `custom:${string}`[] = [];
  for (const tag of scopes) {
    if (BUILTIN_SCOPE_TAGS.has(tag)) {
      builtin.push(tag as "pages" | "posts" | "entities");
    } else if (isCustomBulkScopeTag(tag)) {
      custom.push(tag);
    }
  }
  return { builtin, custom };
}

const EMPTY_SCOPE_BUCKET: PromptBulkSitemapInventoryBuckets[OverviewSitemapSource] = {
  json: "",
  rowCount: 0,
};

export function scopeTagToOverviewSource(
  tag: Extract<BulkSitemapScopeTag, "pages" | "posts" | "entities">,
): OverviewSitemapSource {
  if (tag === "pages") return "pages";
  if (tag === "posts") return "posts";
  return "sap";
}

export type BulkWordPressRestCollection = "posts" | "pages";

/** Left-dock sitemap source (Posts / Pages / SAP) drives WP REST collection for uploads. */
export function overviewSitemapSourceToUploadConfig(source: OverviewSitemapSource): {
  sitemapType: BulkSitemapMode;
  wordpressRestEndpoint: BulkWordPressRestCollection;
} {
  if (source === "sap") {
    return { sitemapType: "entity", wordpressRestEndpoint: "posts" };
  }
  if (source === "pages") {
    return { sitemapType: "post", wordpressRestEndpoint: "pages" };
  }
  return { sitemapType: "post", wordpressRestEndpoint: "posts" };
}

export function overviewSitemapSourceToScopeTag(
  source: OverviewSitemapSource,
): Extract<BulkSitemapScopeTag, "pages" | "posts" | "entities"> {
  if (source === "sap") return "entities";
  if (source === "pages") return "pages";
  return "posts";
}

export type BulkSiteEditorialScopeConfig = {
  scopeTags?: BulkSitemapScopeTag[];
  sitemapType?: BulkSitemapMode;
};

/** Editorial schedule quotas follow left-dock sitemap / entity upload mode, not stale scopeTags alone. */
export function resolveBulkEditorialScopeTag(
  config: BulkSiteEditorialScopeConfig | undefined,
): Extract<BulkSitemapScopeTag, "pages" | "posts" | "entities"> {
  const tags = normalizeBulkSitemapScopeTags(config?.scopeTags);
  if (tags[0] === "pages" || tags[0] === "posts" || tags[0] === "entities") {
    return tags[0];
  }
  if (config?.sitemapType === "entity") return "entities";
  return "posts";
}

export function normalizeBulkSitemapScopeTags(raw: unknown): BulkSitemapScopeTag[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkSitemapScopeTag[] = [];
  for (const item of raw) {
    const v = String(item).trim();
    const lower = v.toLowerCase();
    if (lower === "pages" || lower === "posts" || lower === "entities") {
      if (!out.includes(lower)) out.push(lower as BulkSitemapScopeTag);
      continue;
    }
    if (lower.startsWith("custom:")) {
      const id = `custom:${lower.slice("custom:".length)}` as `custom:${string}`;
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** When scopes are set, include only those inventory buckets (strict — no implicit widening). */
export function filterPromptBulkSitemapBucketsByScopes(
  buckets: PromptBulkSitemapInventoryBuckets,
  scopes: BulkSitemapScopeTag[] | undefined,
): PromptBulkSitemapInventoryBuckets {
  const selected = normalizeBulkSitemapScopeTags(scopes ?? []);
  if (selected.length === 0) return buckets;
  const { builtin } = splitBulkScopeTags(selected);
  if (builtin.length === 0) {
    return {
      pages: { ...EMPTY_SCOPE_BUCKET },
      posts: { ...EMPTY_SCOPE_BUCKET },
      sap: { ...EMPTY_SCOPE_BUCKET },
      customByScope: buckets.customByScope,
    };
  }
  const allowed = new Set(builtin.map(scopeTagToOverviewSource));
  return {
    pages: allowed.has("pages") ? buckets.pages : { ...EMPTY_SCOPE_BUCKET },
    posts: allowed.has("posts") ? buckets.posts : { ...EMPTY_SCOPE_BUCKET },
    sap: allowed.has("sap") ? buckets.sap : { ...EMPTY_SCOPE_BUCKET },
    customByScope: buckets.customByScope,
  };
}

export function filterCustomBucketsByScopes(
  customByScope: PromptBulkSitemapInventoryBuckets["customByScope"],
  scopes: BulkSitemapScopeTag[] | undefined,
): PromptBulkSitemapInventoryBuckets["customByScope"] {
  const selected = normalizeBulkSitemapScopeTags(scopes ?? []);
  if (selected.length === 0) return customByScope;
  const { builtin, custom } = splitBulkScopeTags(selected);
  if (custom.length === 0) {
    return builtin.length > 0 ? undefined : customByScope;
  }
  const out: NonNullable<PromptBulkSitemapInventoryBuckets["customByScope"]> = {};
  for (const scopeId of custom) {
    const block = customByScope?.[scopeId];
    out[scopeId] = block ?? { json: "", rowCount: 0, label: scopeId };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function totalRowsInScopedBuckets(buckets: PromptBulkSitemapInventoryBuckets): number {
  let total =
    buckets.pages.rowCount + buckets.posts.rowCount + buckets.sap.rowCount;
  for (const block of Object.values(buckets.customByScope ?? {})) {
    total += block.rowCount;
  }
  return total;
}

const POST_ALIASES = new Set(["post", "posts", "blog", "blogs"]);
const ENTITY_ALIASES = new Set(["entity", "entities", "sap", "service-area", "servicearea"]);

/** Normalize a CSV cell or header alias value to a row sitemap type. */
export function parseBulkRowSitemapCell(raw: unknown): BulkRowSitemapType | undefined {
  if (raw == null) return undefined;
  const norm = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (!norm) return undefined;
  if (POST_ALIASES.has(norm)) return "post";
  if (ENTITY_ALIASES.has(norm)) return "entity";
  return undefined;
}

/** Pick sitemap_type from a parsed CSV row record (header aliases). */
export function pickSitemapTypeFromRow(row: Record<string, unknown>): BulkRowSitemapType | undefined {
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase().replace(/\s+/g, "");
    if (
      norm === "sitemap" ||
      norm === "sitemap_type" ||
      norm === "sitemaptype" ||
      norm === "post_destination" ||
      norm === "postdestination"
    ) {
      const parsed = parseBulkRowSitemapCell(row[key]);
      if (parsed) return parsed;
    }
  }
  return undefined;
}

/** Empty / N/A entity is a blog row. Never route those to the entity sitemap. */
export function rowHasUploadEntity(entity: string | undefined | null): boolean {
  const value = entity?.trim() ?? "";
  return value.length > 0 && value.toUpperCase() !== "N/A";
}

export function resolveUploadSitemapType(
  requested: BulkRowSitemapType,
  entity: string | undefined | null,
): BulkRowSitemapType {
  if (!rowHasUploadEntity(entity)) return "post";
  return requested;
}

export function resolveRowSitemapType(
  siteMode: BulkSitemapMode,
  row: Pick<CSVRow, "sitemap_type" | "entity">,
  fallback: BulkRowSitemapType,
): BulkRowSitemapType {
  const requested: BulkRowSitemapType =
    siteMode === "post"
      ? "post"
      : siteMode === "entity"
        ? "entity"
        : (row.sitemap_type ?? fallback);
  return resolveUploadSitemapType(requested, row.entity);
}

export function applyRowSitemapToPosting(
  posting: WordPressPostingOptions | undefined,
  rowType: BulkRowSitemapType,
): WordPressPostingOptions | undefined {
  if (!posting) return posting;
  return {
    ...posting,
    sitemapType: rowType,
    sites: posting.sites?.map((s) => ({ ...s, sitemapType: rowType })),
  };
}

export function seedCustomRowSitemaps(
  rows: CSVRow[],
  defaultType: BulkRowSitemapType,
): CSVRow[] {
  return rows.map((row) =>
    row.sitemap_type ? row : { ...row, sitemap_type: defaultType },
  );
}

export function inferBulkSitemapModeFromRows(rows: CSVRow[]): {
  mode: BulkSitemapMode;
  rows: CSVRow[];
} {
  const hasEntity = rows.some((r) => rowHasUploadEntity(r.entity));
  if (!hasEntity) {
    return { mode: "post", rows };
  }

  const explicitTypes = rows
    .map((r) => r.sitemap_type)
    .filter((t): t is BulkRowSitemapType => t === "post" || t === "entity");

  if (explicitTypes.length > 0) {
    const unique = new Set(explicitTypes);
    if (unique.size > 1) {
      return { mode: "custom", rows };
    }
  }

  return { mode: "entity", rows };
}

export function postingSitemapPlaceholder(siteMode: BulkSitemapMode): BulkRowSitemapType {
  return siteMode === "entity" ? "entity" : "post";
}

/** Unset site pill is always Posts. CSV entity cells switch the pill after upload. */
export function defaultBulkSitemapMode(): BulkRowSitemapType {
  return "post";
}

export function resolveSiteSitemapMode(
  siteConfigs: Record<string, { sitemapType: BulkSitemapMode }>,
  selectedWordPressSites: ReadonlySet<string>,
  _entityAvailable?: boolean,
): BulkSitemapMode {
  const siteId = Array.from(selectedWordPressSites)[0];
  const configured = siteId ? siteConfigs[siteId]?.sitemapType : undefined;
  return configured ?? defaultBulkSitemapMode();
}

export function buildCustomModePrefetchSites(
  posting: WordPressPostingOptions,
  rows: CSVRow[],
  fallback: BulkRowSitemapType,
): Array<{ site: WordPressPostingOptions["site"]; sitemapType: BulkRowSitemapType }> {
  const baseSites = posting.sites?.length
    ? posting.sites.map((s) => s.site)
    : posting.site
      ? [posting.site]
      : [];
  if (baseSites.length === 0) return [];

  const rowTypes = new Set<BulkRowSitemapType>();
  for (const row of rows) {
    rowTypes.add(resolveRowSitemapType("custom", row, fallback));
  }

  const seen = new Set<string>();
  const out: Array<{ site: WordPressPostingOptions["site"]; sitemapType: BulkRowSitemapType }> = [];
  for (const site of baseSites) {
    for (const sitemapType of rowTypes) {
      const key = `${site.id}:${sitemapType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ site, sitemapType });
    }
  }
  return out;
}

export function csvRowsHaveExplicitSitemap(rows: CSVRow[]): boolean {
  return rows.some((r) => r.sitemap_type === "post" || r.sitemap_type === "entity");
}
