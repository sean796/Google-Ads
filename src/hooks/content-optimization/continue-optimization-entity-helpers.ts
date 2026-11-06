import { type WordPressSite } from "@/components/integrations/types";
import { lookupOverviewInventoryHitForUrl } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { parseEntityFromSapTitle } from "@/lib/local-analysis/entity-sap-inventory-collision";
import { extractOriginFromSapTitle } from "@/lib/sap-origin-from-title";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";

const SAP_ENTITY_ACF_KEYS = ["origin", "service_area", "service_area_name", "location", "entity"] as const;

const LEADING_SERVICE_TOKENS = new Set([
  "blinds",
  "blind",
  "shades",
  "shade",
  "curtains",
  "curtain",
  "shutters",
  "shutter",
  "drapery",
  "draperies",
  "window",
  "windows",
  "coverings",
  "treatment",
  "treatments",
  "custom",
  "motorized",
  "commercial",
  "hunter",
  "douglas",
  "alta",
  "repair",
  "repairs",
  "installation",
  "install",
]);

function readEntityFromAcfLike(source: Record<string, unknown> | undefined): string {
  if (!source) return "";
  for (const key of SAP_ENTITY_ACF_KEYS) {
    const v = String(source[key] ?? "").trim();
    if (v && v !== "N/A") return v;
  }
  return "";
}

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Geo-modified SAP keyword/title head: "blinds sunset park fl" → "Sunset Park, FL". */
export function entityFromGeoKeywordPhrase(phrase: string): string {
  const raw = phrase.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!raw) return "";

  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return "";

  let region = "";
  let placeWords = [...words];
  const last = placeWords[placeWords.length - 1] ?? "";
  if (/^[a-z]{2}$/.test(last)) {
    region = last.toUpperCase();
    placeWords = placeWords.slice(0, -1);
  }

  while (placeWords.length > 0 && LEADING_SERVICE_TOKENS.has(placeWords[0]!)) {
    placeWords.shift();
  }

  if (placeWords.length === 0) return "";

  const place = titleCaseWords(placeWords.join(" "));
  const label = region ? `${place}, ${region}` : place;
  return normalizeEntityHintCommaLabel(label) || label;
}

function entityFromSapTitleHead(title: string): string {
  const head = title.split(":")[0]?.trim() ?? title.trim();
  if (!head) return "";

  const fromNear = parseEntityFromSapTitle(head);
  if (fromNear) return normalizeEntityHintCommaLabel(fromNear) || fromNear;

  const fromIn = extractOriginFromSapTitle(head);
  if (fromIn) return normalizeEntityHintCommaLabel(fromIn) || fromIn;

  const fromGeo = entityFromGeoKeywordPhrase(head);
  if (fromGeo) return fromGeo;

  return "";
}

export type ResolveSapEntityForOptimizeArgs = {
  site: WordPressSite;
  url: string;
  title?: string;
  keyword?: string;
  acfFields?: Record<string, unknown>;
  acfContext?: { origin?: string };
  urlEntities?: Record<string, string | "N/A">;
};

/** Same resolution order as bulk SAP rows: inventory ACF, cached entities, post ACF, title, keyword. */
export function resolveSapEntityForOptimize(args: ResolveSapEntityForOptimizeArgs): string {
  const invHit = lookupOverviewInventoryHitForUrl(args.site, args.url, "sap");
  const invAcf =
    invHit?.row?.acf && typeof invHit.row.acf === "object"
      ? (invHit.row.acf as Record<string, unknown>)
      : undefined;

  const fromInv = readEntityFromAcfLike(invAcf);
  if (fromInv) return fromInv;

  const fromUrlEntities = args.urlEntities?.[args.url]?.trim();
  if (fromUrlEntities && fromUrlEntities !== "N/A") return fromUrlEntities;

  const fromFields = readEntityFromAcfLike(args.acfFields);
  if (fromFields) return fromFields;

  const fromContext = String(args.acfContext?.origin ?? "").trim();
  if (fromContext && fromContext !== "N/A") return fromContext;

  const title = args.title?.trim() ?? "";
  if (title) {
    const fromTitle = entityFromSapTitleHead(title);
    if (fromTitle) return fromTitle;
  }

  const keyword = args.keyword?.trim() ?? "";
  if (keyword) {
    const fromKeyword = entityFromGeoKeywordPhrase(keyword);
    if (fromKeyword) return fromKeyword;
  }

  const invTitle = String(invHit?.row?.fields?.title ?? "").trim();
  if (invTitle && invTitle !== title) {
    const fromInvTitle = entityFromSapTitleHead(invTitle);
    if (fromInvTitle) return fromInvTitle;
  }

  return "";
}

/** @deprecated Use resolveSapEntityForOptimize — kept for call sites that only pass inventory/ACF. */
export function readSapEntityFromInventory(
  site: WordPressSite,
  url: string,
  acfFields?: Record<string, unknown>,
  acfContext?: { origin?: string },
  urlEntities?: Record<string, string | "N/A">,
): string {
  return resolveSapEntityForOptimize({ site, url, acfFields, acfContext, urlEntities });
}

export async function updateBulkStateWithEntity(
  site: WordPressSite,
  url: string,
  _primaryKeyword: string,
  extractedEntity: string | "N/A",
  _finalTitle: string,
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"],
): Promise<void> {
  const batchKey = `${site.id}-batch`;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (current && current.urls.includes(url)) {
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlEntities: { ...(current.urlEntities || {}), [url]: extractedEntity },
        },
      };
    }
    return prev;
  });
}
