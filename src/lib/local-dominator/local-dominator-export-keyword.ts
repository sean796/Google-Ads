import type { TaskExecutionPayload } from "@/lib/tasks-types";

/** Stored on tasks/workflows when Local Grid should use the first grid / empty filter (legacy). */
export const LOCAL_DOMINATOR_GRID_KEYWORD_AUTO = "auto";

/** Stored when Local Grid should use the property profile primary keyword. */
export const LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY = "property";

const LEGACY_TEMPLATE_KEYWORD = "blinds near me";
const LEGACY_TEMPLATE_BUSINESS = "advance blinds & drapery";

export function isLocalDominatorPropertyGridKeyword(keyword: string | null | undefined): boolean {
  return String(keyword ?? "").trim().toLowerCase() === LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY;
}

export function isLocalDominatorAutoGridKeyword(keyword: string | null | undefined): boolean {
  const trimmed = String(keyword ?? "").trim().toLowerCase();
  return trimmed === "" || trimmed === LOCAL_DOMINATOR_GRID_KEYWORD_AUTO;
}

/** Persist explicit auto/property so empty keyword survives save/sanitize merges. */
export function normalizeLocalDominatorGridKeywordStored(
  keyword: string | null | undefined,
): string {
  const trimmed = String(keyword ?? "").trim();
  if (isLocalDominatorPropertyGridKeyword(trimmed)) {
    return LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY;
  }
  return isLocalDominatorAutoGridKeyword(trimmed)
    ? LOCAL_DOMINATOR_GRID_KEYWORD_AUTO
    : trimmed;
}

/** Raw stored keyword for export API (property/auto stay as sentinels until site resolve). */
export function resolveLocalDominatorExportKeyword(keyword: string | null | undefined): string {
  if (isLocalDominatorPropertyGridKeyword(keyword) || isLocalDominatorAutoGridKeyword(keyword)) {
    return String(keyword ?? "").trim().toLowerCase() === LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY
      ? LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY
      : LOCAL_DOMINATOR_GRID_KEYWORD_AUTO;
  }
  return String(keyword ?? "").trim();
}

function isLegacyTemplateKeywordLeak(keyword: string, businessName: string): boolean {
  return (
    keyword.trim().toLowerCase() === LEGACY_TEMPLATE_KEYWORD
    && businessName.trim().toLowerCase() !== LEGACY_TEMPLATE_BUSINESS
  );
}

/** Workflow run: node config wins; drop stale template keyword for other businesses. */
export function resolveWorkflowLocalDominatorGridKeyword(
  nodePayload: TaskExecutionPayload | null | undefined,
  mergedKeyword: string | null | undefined,
  businessName: string,
): string {
  const business = businessName.trim();
  const nodeKeyword = nodePayload?.keyword;

  if (nodeKeyword !== undefined && nodeKeyword !== null) {
    const normalized = normalizeLocalDominatorGridKeywordStored(nodeKeyword);
    if (isLegacyTemplateKeywordLeak(normalized, business)) {
      return LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY;
    }
    return normalized;
  }

  const merged = String(mergedKeyword ?? "").trim();
  if (isLocalDominatorAutoGridKeyword(merged) || isLegacyTemplateKeywordLeak(merged, business)) {
    return LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY;
  }
  if (!merged) return LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY;
  return merged;
}
