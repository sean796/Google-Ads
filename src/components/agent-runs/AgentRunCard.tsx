import type { MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { isAgentRunResumable } from "@/lib/agent-runs/agent-run-checkpoint";
import type { AgentRun, AgentRunStatus } from "@/lib/agent-runs-types";
import { AGENT_RUN_STATUS_LABELS, isAgentRunTerminal } from "@/lib/agent-runs-types";
import { agentRunCardTitle, agentRunCollapsedHint, agentRunIsServerExecution, agentRunServerStatusLabel } from "@/lib/agent-runs/agent-run-display";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";
import { AgentRunsDetailsDrawer } from "./AgentRunsDetailsDrawer";
import { useAgentRunLiveSnapshot } from "./use-agent-run-live-snapshot";
import { Button } from "@/ui";

function statusClass(status: AgentRunStatus): string {
  return `agent-runs-status-pill agent-runs-status-pill--${status}`;
}

type AgentRunCardProps = {
  run: AgentRun;
  expanded: boolean;
  stripeIndex: number;
  clientLabel?: string | null;
  showClientTag?: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onResume?: () => void;
  resumable?: boolean;
};

export function AgentRunCard({
  run,
  expanded,
  stripeIndex,
  clientLabel,
  showClientTag = false,
  onToggle,
  onCancel,
  onResume,
  resumable = false,
}: AgentRunCardProps) {
  const live = useAgentRunLiveSnapshot(run);
  const hint = agentRunCollapsedHint(run, live, 0);
  const cardTitle = agentRunCardTitle(run, clientLabel);
  const drawerId = `agent-run-drawer-${run.id}`;
  const isActive = run.status === "running";
  const isServerRun = agentRunIsServerExecution(run);
  const serverStatus = isServerRun ? agentRunServerStatusLabel(run) : null;
  const showResume = resumable || isAgentRunResumable(run);
  const showCancel = !isAgentRunTerminal(run.status);
  const showResumeAction = showResume && Boolean(onResume);
  const statusDetail =
    hint ||
    (!hint && expanded && isServerRun && isActive && serverStatus ? serverStatus : null) ||
    "\u00a0";

  const handleRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    onToggle();
  };

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      <div
        className={cn(
          "agent-runs-card__row",
          contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize: isActive }),
          expanded && "agent-runs-card__row--expanded",
          showClientTag && clientLabel?.trim() && "agent-runs-card__row--with-client",
        )}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={drawerId}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="agent-runs-card__lead">
          <div className="agent-runs-card__title">{cardTitle}</div>
          <span className="agent-runs-card__hint" aria-live="polite">
            {statusDetail}
          </span>
        </div>
        <span className="agent-runs-card__status-end">
          {showClientTag && clientLabel?.trim() ? (
            <span className="agent-runs-client-tag">{clientLabel.trim()}</span>
          ) : null}
          <span className={statusClass(run.status)}>{AGENT_RUN_STATUS_LABELS[run.status]}</span>
        </span>
        <Button
          size="icon" icon={ChevronDown}
          variant="quiet"
          aria-label={expanded ? "Collapse details" : "Expand details"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        ></Button>
      </div>

      <div
        id={drawerId}
        className={cn("agent-runs-card__drawer", !expanded && "agent-runs-card__drawer--collapsed")}
        aria-hidden={!expanded}
      >
        <div className="agent-runs-card__drawer-inner">
          <AgentRunsDetailsDrawer
            run={run}
            resumable={showResume}
            showCancel={showCancel}
            showResume={showResumeAction}
            onCancel={onCancel}
            onResume={onResume}
          />
        </div>
      </div>
    </div>
  );
}
