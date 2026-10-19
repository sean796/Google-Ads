import { z } from "zod";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";
import { revisionRowTitle } from "@/lib/overview/studio-doc-revisions-grouping";

const PLAIN_SNIPPET_MAX = 1_400;

const revisionItemSummarySchema = z.object({
  revisionId: z.string(),
  stepLabel: z.string(),
  changeSummary: z.string(),
  seoImpact: z.string().optional(),
});

export const overviewStudioRevisionsReportSchema = z.object({
  executiveSummary: z.string(),
  items: z.array(revisionItemSummarySchema),
  reviewBeforePublish: z.array(z.string()).optional(),
});

export type OverviewStudioRevisionsReport = z.infer<typeof overviewStudioRevisionsReportSchema>;

function snippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= PLAIN_SNIPPET_MAX) return t;
  return `${t.slice(0, PLAIN_SNIPPET_MAX)}…`;
}

function buildUserPayload(args: {
  pageTitle: string;
  pageUrl: string;
  revisions: OverviewStudioRevision[];
}): string {
  const rows = args.revisions.map((rev) => ({
    revisionId: rev.id,
    stepLabel: revisionRowTitle(rev),
    changed: rev.changed,
    before: snippet(rev.beforePlain),
    after: snippet(rev.afterPlain),
  }));
  return JSON.stringify(
    {
      pageTitle: args.pageTitle,
      pageUrl: args.pageUrl,
      revisionCount: rows.length,
      revisions: rows,
    },
    null,
    2,
  );
}

const SYSTEM = `You are an AISEO editor writing revision reports for client review and print.

Given before/after plain text for each optimized step on one URL, return JSON only.

Rules:
- executiveSummary: 3–5 sentences on what changed overall (intent, entities, meta, FAQs, body sections). Plain language for a marketing lead.
- items: one entry per revision in the input, same revisionId and stepLabel. changeSummary: 1–3 sentences on substantive diffs (not "reworded slightly" unless true). seoImpact: optional one line (title/meta/FAQ/section relevance).
- reviewBeforePublish: bullet strings for factual errors, broken grammar, awkward titles, or compliance risks spotted in AFTER text. Omit if none.
- Do not invent facts not present in before or after.
- No em dash character in strings.`;

export async function generateOverviewStudioRevisionsReport(args: {
  pageTitle: string;
  pageUrl: string;
  revisions: OverviewStudioRevision[];
  siteId?: string | null;
  signal?: AbortSignal;
}): Promise<OverviewStudioRevisionsReport> {
  if (args.revisions.length === 0) {
    throw new Error("No revisions to summarize");
  }

  const user = buildUserPayload(args);
  const res = await callAgentCategoryOpenRouterChat({
    category: "report",
    siteId: args.siteId ?? null,
    system: SYSTEM,
    user,
    temperature: 0.2,
    maxTokens: 4_096,
    responseFormat: { type: "json_object" },
    useMasterInstructions: false,
    useWordBlacklist: false,
    signal: args.signal,
  });

  const parsed = overviewStudioRevisionsReportSchema.parse(
    parseJsonObjectFromModelText(res.content),
  );

  const ids = new Set(args.revisions.map((r) => r.id));
  const items = parsed.items.filter((item) => ids.has(item.revisionId));
  if (items.length === 0) {
    throw new Error("AI summary did not return matching revision ids");
  }

  return { ...parsed, items };
}

export function reportItemForRevision(
  report: OverviewStudioRevisionsReport | null,
  revisionId: string,
): (typeof revisionItemSummarySchema)["_output"] | null {
  if (!report) return null;
  return report.items.find((i) => i.revisionId === revisionId) ?? null;
}
