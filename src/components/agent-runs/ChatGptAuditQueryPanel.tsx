import React, { useCallback, useMemo, useState } from "react";
import {
  cancelChatGptAuditJob,
  finishChatGptAuditJob,
  submitChatGptAuditQuery,
} from "@/lib/chatgpt-audit-api";
import { auditQuestionsForSave } from "@/lib/chatgpt-audit-questions";
import type { AgentRun } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import { cn } from "@/lib/utils";
import { Button, TextareaField } from "@/ui";

function readResponseCount(run: AgentRun): number {
  const result = (run.result ?? {}) as Record<string, unknown>;
  const count = Number(result.responseCount ?? 0);
  if (Number.isFinite(count) && count > 0) return count;
  const responses = result.responses;
  return Array.isArray(responses) ? responses.length : 0;
}

function readJobId(run: AgentRun): string {
  const result = (run.result ?? {}) as Record<string, unknown>;
  return String(result.jobId ?? "").trim();
}

function readSessionReady(run: AgentRun): boolean {
  const result = (run.result ?? {}) as Record<string, unknown>;
  return result.sessionReady === true;
}

function readWorkerLabel(run: AgentRun): string {
  const checkpoint = (run.result as { checkpoint?: { lastMessage?: string; lastStepLabel?: string } } | undefined)
    ?.checkpoint;
  return String(checkpoint?.lastMessage ?? checkpoint?.lastStepLabel ?? "").trim();
}

function readSetupQuestions(run: AgentRun): string[] {
  const payload = run.plan?.executionPayload;
  const contract = run.plan?.clientRunContract as { auditQuestions?: string[] } | undefined;
  const fromContract = auditQuestionsForSave(contract?.auditQuestions);
  if (fromContract.length > 0) return fromContract;
  return auditQuestionsForSave(payload?.auditQuestions);
}

export type ChatGptAuditQueryPanelProps = {
  run: AgentRun;
  isRunning: boolean;
  onRefresh?: () => void;
};

export function ChatGptAuditQueryPanel({
  run,
  isRunning,
  onRefresh,
}: ChatGptAuditQueryPanelProps): React.ReactElement {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobId = readJobId(run);
  const sessionReady = readSessionReady(run);
  const workerLabel = useMemo(() => readWorkerLabel(run), [run]);
  const responseCount = useMemo(() => readResponseCount(run), [run]);
  const setupQuestions = useMemo(() => readSetupQuestions(run), [run]);
  const hasSetupQuestions = setupQuestions.length > 0;
  const canInteract = isRunning && !isAgentRunTerminal(run.status) && Boolean(jobId);
  const canSend = canInteract && sessionReady && question.trim().length > 0 && !busy;

  const handleSend = useCallback(async () => {
    const text = question.trim();
    if (!jobId || !text) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitChatGptAuditQuery(jobId, text);
      if (!result.ok) {
        setError(result.error ?? "Could not send question.");
        return;
      }
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send question.");
    } finally {
      setBusy(false);
    }
  }, [jobId, question]);

  const handleFinish = useCallback(async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await finishChatGptAuditJob(jobId);
      if (!result.ok) {
        setError(result.error ?? "Could not finish session.");
        return;
      }
      window.setTimeout(() => onRefresh?.(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish session.");
    } finally {
      setBusy(false);
    }
  }, [jobId, onRefresh]);

  const handleCancel = useCallback(async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      await cancelChatGptAuditJob(jobId);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel session.");
    } finally {
      setBusy(false);
    }
  }, [jobId, onRefresh]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-base font-medium text-foreground">
          {hasSetupQuestions ? "Setup questions" : "Ask ChatGPT"}
        </p>

        {hasSetupQuestions ? (
          <div className="min-h-[6rem] space-y-2 rounded-md bg-ui-field/40 p-3">
            <ol className="list-decimal space-y-2 pl-5 text-base text-foreground">
              {setupQuestions.map((item, index) => (
                <li key={`${index}-${item.slice(0, 24)}`} className="whitespace-pre-wrap">
                  {item}
                </li>
              ))}
            </ol>
            {canInteract ? (
              <p className="text-base tabular-nums text-muted-foreground">
                {sessionReady
                  ? `${responseCount} of ${setupQuestions.length} repl${setupQuestions.length === 1 ? "y" : "ies"} saved to CSV`
                  : "Logging into ChatGPT…"}
              </p>
            ) : null}
            {canInteract && sessionReady && workerLabel ? (
              <p className="text-base text-muted-foreground">{workerLabel}</p>
            ) : null}
            {canInteract ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" type="button" disabled={busy} onClick={() => void handleCancel()}>
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <TextareaField
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask an audit question about the selected client website"
              rows={4}
              disabled={!canInteract || busy}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="run" type="button" disabled={!canSend} onClick={() => void handleSend()}>
                Send question
              </Button>
              <Button
                type="button"
                disabled={!canInteract || busy}
                onClick={() => void handleFinish()}
              >
                Finish session
              </Button>
              {canInteract ? (
                <Button variant="quiet" type="button" disabled={busy} onClick={() => void handleCancel()}>
                  Cancel
                </Button>
              ) : null}
            </div>
            {!sessionReady && canInteract ? (
              <p className="text-base text-muted-foreground">Logging into ChatGPT…</p>
            ) : null}
          </>
        )}

        {error ? <p className="text-base text-destructive">{error}</p> : null}
      </div>

      {responseCount > 0 ? (
        <p className="text-base tabular-nums text-muted-foreground">
          {responseCount} repl{responseCount === 1 ? "y" : "ies"} saved to the audit CSV (markdown). Open the run
          deliverable to download.
        </p>
      ) : (
        <p className={cn("text-base text-muted-foreground", !isRunning && "opacity-70")}>
          {hasSetupQuestions
            ? "Replies are saved to the audit CSV only, not in this log."
            : "Replies are saved to the audit CSV when the session finishes."}
        </p>
      )}
    </div>
  );
}
