import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { AgentRunBucketGroup, AgentRunBucketKey } from "@/lib/agent-runs/agent-run-grouping";
import { AgentRunsBucketTabs } from "./AgentRunsBucketTabs";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type AgentRunsGroupFolderProps = {
  label?: string;
  leading?: ReactNode;
  count: number;
  buckets?: AgentRunBucketGroup[];
  activeBucketKey?: AgentRunBucketKey;
  onBucketChange?: (key: AgentRunBucketKey) => void;
  collapsible?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

export function AgentRunsGroupFolder({
  label,
  leading,
  count,
  buckets,
  activeBucketKey,
  onBucketChange,
  collapsible = false,
  expanded = true,
  onToggleExpanded,
}: AgentRunsGroupFolderProps) {
  const showTabs = Boolean(expanded && buckets?.length && activeBucketKey && onBucketChange);

  return (
    <div className="agent-runs-client-header">
      {collapsible ? (
        <Button
          variant="quiet"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </Button>
      ) : null}
      {leading ?? (label ? <span className="agent-runs-client-header__label">{label}</span> : null)}
      {showTabs ? (
        <AgentRunsBucketTabs
          buckets={buckets}
          value={activeBucketKey}
          onChange={onBucketChange}
          className="agent-runs-client-header__tabs"
        />
      ) : null}
      <span className="agent-runs-folder__count">{count}</span>
    </div>
  );
}
