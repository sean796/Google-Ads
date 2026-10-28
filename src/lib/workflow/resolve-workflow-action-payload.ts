import type { WordPressSite } from "@/components/integrations/types";
import { stripTitlePipeSuffix } from "@/lib/sap-title-pipe-brand";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import {
  resolveBrowserTargetUrl,
  type ResolveBrowserTargetContext,
} from "@/lib/browser-automation/resolve-browser-target-url";
import type { TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import { dominantKeywordFromRows, parseLocalDominatorCsv } from "@/lib/local-dominator-csv";
import {
  peekWorkflowGridCsvText,
  peekWorkflowGridKeyword,
} from "@/lib/workflow/workflow-grid-csv-stash";
import { readSitePrimaryLocalKeyword } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";

type SiteNameSource = Pick<WordPressSite, "name" | "siteUrl" | "productionSiteUrl"> | null | undefined;

function siteBusinessName(site: SiteNameSource): string {
  if (!site) return "";
  return stripTitlePipeSuffix(wordpressSiteDisplayName(site));
}

const WORKFLOW_CLIENT_BUSINESS_KINDS = new Set<TaskExecutionKind>([
  "local_dominator_export",
  "entity_page_creator",
  "entity_generator",
]);

/** Workflow client site is the source of truth; ignore stale stored businessName. */
function withWorkflowClientBusinessName(
  payload: TaskExecutionPayload,
  site: SiteNameSource,
): TaskExecutionPayload {
  const name = siteBusinessName(site);
  if (!name) {
    if (!payload.businessName?.trim()) return payload;
    const { businessName: _removed, ...rest } = payload;
    return rest;
  }
  return { ...payload, businessName: name };
}

function resolveStashedGridFocusKeyword(workflowRunId: number, fallbackKeyword?: string): string {
  const fromStash = peekWorkflowGridKeyword(workflowRunId)?.trim();
  if (fromStash) return fromStash;

  const fallback = fallbackKeyword?.trim() ?? "";
  const csvText = peekWorkflowGridCsvText(workflowRunId)?.trim();
  if (!csvText) return fallback;

  const parsed = parseLocalDominatorCsv(csvText, { defaultKeyword: fallback });
  const fromRows = dominantKeywordFromRows(parsed.rows).trim();
  return fromRows || fallback;
}

export function applyEntityPageCreatorWorkflowFocusKeyword(
  payload: TaskExecutionPayload,
  workflowRunId: number,
  fallbackKeyword?: string,
  site?: SiteNameSource,
): TaskExecutionPayload {
  const next: TaskExecutionPayload = {
    ...payload,
    locationSource: "grid",
    gridInputSource: "workflow",
    gridCsvBase64: undefined,
    gridCsvUrl: undefined,
  };

  if (!next.focusKeyword?.trim()) {
    const profileKw = site ? readSitePrimaryLocalKeyword(site as WordPressSite) : "";
    if (profileKw) {
      next.focusKeyword = profileKw;
    }
  }

  if (!next.focusKeyword?.trim()) {
    const gridKeyword = resolveStashedGridFocusKeyword(workflowRunId, fallbackKeyword);
    if (gridKeyword) {
      next.focusKeyword = gridKeyword;
    }
  }

  return next;
}

export function resolveWorkflowActionPayload(
  kind: TaskExecutionKind,
  payload: TaskExecutionPayload,
  site: SiteNameSource,
  workflowRunId?: number,
  browserContext?: ResolveBrowserTargetContext,
): TaskExecutionPayload {
  let resolved = payload;
  if (WORKFLOW_CLIENT_BUSINESS_KINDS.has(kind)) {
    resolved = withWorkflowClientBusinessName(resolved, site);
  }
  if (
    (kind === "entity_page_creator" || kind === "entity_generator" || kind === "sap_generator")
    && workflowRunId != null
    && workflowRunId > 0
  ) {
    resolved = applyEntityPageCreatorWorkflowFocusKeyword(
      resolved,
      workflowRunId,
      siteBusinessName(site),
      site,
    );
  }
  if (kind === "browser_automation") {
    try {
      const targetUrl = resolveBrowserTargetUrl(resolved, site, browserContext);
      resolved = { ...resolved, targetUrl };
    } catch {
      return resolved;
    }
  }
  return resolved;
}
