import {
  appendOverviewStudioRevision,
  revisionPlainFromHtml,
  type OverviewStudioRevision,
} from "@/lib/overview/studio-doc-revisions-store";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export type RecordOverviewStudioRevisionInput = {
  pageUrl: string;
  stepLabel: string;
  sectionTitle?: string;
  runId?: string;
  beforeHtml: string;
  afterHtml: string;
};

export function recordOverviewStudioRevision(
  input: RecordOverviewStudioRevisionInput,
): OverviewStudioRevision | null {
  const urlKey = normalizePageUrlKey(input.pageUrl.trim());
  if (!urlKey) return null;

  const beforeHtml = input.beforeHtml ?? "";
  const afterHtml = input.afterHtml ?? "";

  return appendOverviewStudioRevision({
    urlKey,
    stepLabel: input.stepLabel.trim() || "Rewrite",
    sectionTitle: input.sectionTitle?.trim() || undefined,
    runId: input.runId?.trim() || undefined,
    beforeHtml,
    afterHtml,
    beforePlain: revisionPlainFromHtml(beforeHtml),
    afterPlain: revisionPlainFromHtml(afterHtml),
    changed: false,
  });
}

/** Title, meta, and other plain string fields (not HTML). */
export function recordOverviewStudioTextRevision(input: {
  pageUrl: string;
  stepLabel: string;
  sectionTitle?: string;
  runId?: string;
  beforeText: string;
  afterText: string;
}): OverviewStudioRevision | null {
  const urlKey = normalizePageUrlKey(input.pageUrl.trim());
  if (!urlKey) return null;
  const beforePlain = (input.beforeText ?? "").trim();
  const afterPlain = (input.afterText ?? "").trim();
  return appendOverviewStudioRevision({
    urlKey,
    stepLabel: input.stepLabel.trim() || "Rewrite",
    sectionTitle: input.sectionTitle?.trim() || undefined,
    runId: input.runId?.trim() || undefined,
    beforeHtml: "",
    afterHtml: "",
    beforePlain,
    afterPlain,
    changed: false,
  });
}
