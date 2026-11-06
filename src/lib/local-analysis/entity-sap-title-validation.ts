import { replaceTemplateVariables } from "@/components/integrations/entity-generation/csv/csvGenerator";
import { serviceKeywordForSapTitle } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import {
  limitServiceWords,
  SAP_TITLE_MAX_CHARS,
  shortPlaceLabelForSapTitle,
  stripTradingNameFromPhrase,
  tradingNameAppearsInText,
  truncateAtWordBoundary,
  formatSapHeadlineTitleCase,
} from "@/lib/sap-brand-and-brevity";

export const DEFAULT_ENTITY_TITLE_TEMPLATE = "{keyword} Near {entity}";

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordTokens(keyword: string): string[] {
  return normalizeForMatch(keyword)
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function entityRepresentedInTitle(title: string, entity: string): boolean {
  const normTitle = normalizeForMatch(title);
  const segments = entity
    .split(",")
    .map((s) => normalizeForMatch(s))
    .filter(Boolean);
  if (segments.length === 0) return normTitle.length > 0;
  const primary = segments[0]!;
  if (primary && normTitle.includes(primary)) return true;
  return segments.some((seg) => seg.length > 2 && normTitle.includes(seg));
}

/** Validates agent-crafted SAP titles before upload. */
export function isValidEntitySapTitle(
  title: string,
  keyword: string,
  entity: string,
  siteName?: string,
): boolean {
  const t = title.trim();
  if (!t) return false;
  if (t.length > SAP_TITLE_MAX_CHARS) return false;
  if (siteName?.trim() && tradingNameAppearsInText(t, siteName)) return false;
  if (t.includes(":")) return false;
  if (!entityRepresentedInTitle(t, entity)) return false;
  const tokens = keywordTokens(keyword);
  if (tokens.length === 0) return true;
  const normTitle = normalizeForMatch(t);
  const matched = tokens.filter((tok) => normTitle.includes(tok)).length;
  return matched >= Math.min(2, tokens.length);
}

/** Deterministic fallback when the title agent fails validation. */
export function resolveEntitySapTitleFromTemplate(
  keyword: string,
  entity: string,
  titleTemplate: string = DEFAULT_ENTITY_TITLE_TEMPLATE,
  siteName?: string,
): string {
  const template = titleTemplate.trim() || DEFAULT_ENTITY_TITLE_TEMPLATE;
  let kw = serviceKeywordForSapTitle(keyword, entity) || "service area";
  if (siteName?.trim()) {
    kw = stripTradingNameFromPhrase(kw, siteName) || kw;
  }
  kw = limitServiceWords(kw, 4);
  const ent = shortPlaceLabelForSapTitle(entity.trim()) || entity.trim();
  const title = formatSapHeadlineTitleCase(replaceTemplateVariables(template, ent, kw).trim());
  return truncateAtWordBoundary(title, SAP_TITLE_MAX_CHARS);
}

/** Final SAP post title: keep valid agent/CSV title or fall back to template. */
export function resolveEntitySapPostTitle(
  keyword: string,
  entity: string,
  existingTitle?: string,
  titleTemplate?: string,
  siteName?: string,
): string {
  const existing = existingTitle?.trim();
  if (
    existing &&
    isValidEntitySapTitle(existing, keyword, entity, siteName) &&
    /(\bnear\b|\bin\b|\bfor\b)/i.test(existing)
  ) {
    return formatSapHeadlineTitleCase(existing);
  }
  return resolveEntitySapTitleFromTemplate(keyword, entity, titleTemplate, siteName);
}

export const DEFAULT_ENTITY_SAP_TITLE_TEMPLATE = DEFAULT_ENTITY_TITLE_TEMPLATE;
