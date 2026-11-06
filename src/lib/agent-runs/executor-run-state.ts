export const activeRunIds = new Set<number>();
const TAB_SESSION_KEY = "neo_pulse_tab_session_id";

export function tabSessionId(): string {
  const existing = sessionStorage.getItem(TAB_SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(TAB_SESSION_KEY, next);
  return next;
}

export function tryAcquireRunLease(runId: number): boolean {
  const key = `neo_pulse_agent_run_${runId}`;
  const owner = tabSessionId();
  const existing = sessionStorage.getItem(key);
  if (existing && existing !== owner) return false;
  sessionStorage.setItem(key, owner);
  return true;
}

export function releaseRunLease(runId: number): void {
  const key = `neo_pulse_agent_run_${runId}`;
  if (sessionStorage.getItem(key) === tabSessionId()) {
    sessionStorage.removeItem(key);
  }
}

export const inflightRuns = new Map<number, Promise<void>>();
/** Client harness started once per run id; blocks auto re-dispatch until explicit resume. */
const attemptedClientRunIds = new Set<number>();

export function markClientRunAttempted(runId: number): void {
  if (runId > 0) attemptedClientRunIds.add(runId);
}

export function clearClientRunAttempted(runId: number): void {
  attemptedClientRunIds.delete(runId);
}

export function hasClientRunAttempted(runId: number): boolean {
  return attemptedClientRunIds.has(runId);
}

export function isAgentRunInflight(runId: number): boolean {
  return inflightRuns.has(runId);
}

export function waitForAgentRunInflight(runId: number): Promise<void> {
  return inflightRuns.get(runId) ?? Promise.resolve();
}

export function isAgentRunActive(runId: number): boolean {
  return activeRunIds.has(runId);
}
