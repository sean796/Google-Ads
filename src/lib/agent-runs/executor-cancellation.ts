import {
  clearPersistedAgentRunCancellations,
  isAgentRunCancelledPersisted,
  persistAgentRunCancelled,
  readPersistedCancelledAgentRunIds,
} from "@/lib/agent-runs/agent-run-cancellation-storage";

const locallyCancelledRunIds = new Set<number>();

export function hydrateCancelledRunsForTeam(teamId: number): void {
  for (const runId of readPersistedCancelledAgentRunIds(teamId)) {
    locallyCancelledRunIds.add(runId);
  }
}

export function markAgentRunCancelledLocally(runId: number, teamId?: number): void {
  locallyCancelledRunIds.add(runId);
  if (teamId != null && teamId > 0) {
    persistAgentRunCancelled(teamId, runId);
  }
}

export function markAgentRunsCancelledLocally(
  runIds: Iterable<number>,
  teamId?: number,
): void {
  for (const runId of runIds) {
    markAgentRunCancelledLocally(runId, teamId);
  }
}

export function clearLocalAgentRunCancellations(teamId?: number): void {
  locallyCancelledRunIds.clear();
  clearPersistedAgentRunCancellations(teamId);
}

export function isAgentRunCancelledLocally(runId: number, teamId?: number): boolean {
  if (locallyCancelledRunIds.has(runId)) return true;
  if (teamId != null && isAgentRunCancelledPersisted(teamId, runId)) {
    locallyCancelledRunIds.add(runId);
    return true;
  }
  return false;
}
