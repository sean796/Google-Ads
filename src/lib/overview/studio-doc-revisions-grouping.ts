import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";

export function revisionRowTitle(rev: OverviewStudioRevision): string {
  return rev.sectionTitle?.trim() || rev.stepLabel;
}

export type OverviewStudioRevisionRun = {
  runKey: string;
  runId: string | null;
  label: string;
  startedAt: number;
  endedAt: number;
  revisions: OverviewStudioRevision[];
  changedCount: number;
  totalCount: number;
};

const ORPHAN_RUN_KEY = "orphan";

function runKeyForRevision(rev: OverviewStudioRevision): string {
  const id = rev.runId?.trim();
  if (id) return `run:${id}`;
  return ORPHAN_RUN_KEY;
}

/** Newest run first; steps inside each run newest first (store order). */
export function groupOverviewStudioRevisionsIntoRuns(
  list: OverviewStudioRevision[],
): OverviewStudioRevisionRun[] {
  const map = new Map<string, OverviewStudioRevision[]>();
  for (const rev of list) {
    const key = runKeyForRevision(rev);
    const bucket = map.get(key) ?? [];
    bucket.push(rev);
    map.set(key, bucket);
  }

  const runs: OverviewStudioRevisionRun[] = [];
  for (const [runKey, revisions] of map.entries()) {
    const times = revisions.map((r) => r.at);
    const startedAt = Math.min(...times);
    const endedAt = Math.max(...times);
    const runId = runKey.startsWith("run:") ? runKey.slice(4) : null;
    const changedCount = revisions.filter((r) => r.changed).length;
    runs.push({
      runKey,
      runId,
      label: formatRevisionRunLabel({ runId, startedAt, endedAt, changedCount, totalCount: revisions.length }),
      startedAt,
      endedAt,
      revisions,
      changedCount,
      totalCount: revisions.length,
    });
  }

  runs.sort((a, b) => b.startedAt - a.startedAt);
  return runs;
}

export function formatRevisionRunLabel(args: {
  runId: string | null;
  startedAt: number;
  endedAt: number;
  changedCount: number;
  totalCount: number;
}): string {
  const when = formatRevisionDateTime(args.endedAt || args.startedAt);
  const changes =
    args.changedCount === args.totalCount
      ? `${args.totalCount} changes`
      : `${args.changedCount} changed, ${args.totalCount - args.changedCount} unchanged`;
  if (args.runId) {
    return `${when} · Run ${args.runId} · ${changes}`;
  }
  return `${when} · ${changes}`;
}

export function formatRevisionDateTime(at: number): string {
  try {
    return new Date(at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Oldest step first (document / generation order for reports). */
export function sortRevisionsChronological(
  revisions: OverviewStudioRevision[],
): OverviewStudioRevision[] {
  return [...revisions].sort((a, b) => a.at - b.at);
}

export function revisionStepSortKey(rev: OverviewStudioRevision): string {
  return revisionRowTitle(rev).toLowerCase();
}
