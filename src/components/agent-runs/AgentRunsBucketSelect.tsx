import { useMemo } from "react";
import {
  AGENT_RUN_SIDEBAR_BUCKET_KEYS,
  AGENT_RUN_SIDEBAR_DEFAULT_BUCKET,
  agentRunBucketIcon,
  agentRunBucketLabel,
} from "@/lib/agent-runs/agent-run-bucket-icons";
import type { AgentRunBucketGroup, AgentRunBucketKey } from "@/lib/agent-runs/agent-run-grouping";
import { SelectField } from "@/ui";
import { agentRunsBucketSelectSlotProps } from "@/components/agent-runs/agent-runs-bucket-select-width";
import { cn } from "@/lib/utils";

export type AgentRunsBucketSelectProps = {
  value: AgentRunBucketKey;
  onChange: (key: AgentRunBucketKey) => void;
  buckets?: AgentRunBucketGroup[];
  className?: string;
  disabled?: boolean;
};

export function AgentRunsBucketSelect({
  value,
  onChange,
  buckets = [],
  className,
  disabled = false,
}: AgentRunsBucketSelectProps) {
  const countByKey = useMemo(() => {
    const map = new Map<AgentRunBucketKey, number>();
    for (const bucket of buckets) {
      map.set(bucket.key, bucket.runs.length);
    }
    return map;
  }, [buckets]);

  const resolvedValue = AGENT_RUN_SIDEBAR_BUCKET_KEYS.includes(value)
    ? value
    : AGENT_RUN_SIDEBAR_DEFAULT_BUCKET;

  const options = AGENT_RUN_SIDEBAR_BUCKET_KEYS.map((key) => ({
    value: key,
    label: `${agentRunBucketLabel(key)} (${countByKey.get(key) ?? 0})`,
    icon: agentRunBucketIcon(key),
  }));

  const slot = agentRunsBucketSelectSlotProps();

  return (
    <div
      className={cn("agent-runs-bucket-select-slot flex-none self-center", slot.className, className)}
      style={slot.style}
    >
      <SelectField
        placeholder="Run categories"
        value={resolvedValue}
        onValueChange={(key) => {
          const next = key as AgentRunBucketKey;
          if (next !== value) onChange(next);
        }}
        options={options}
        width="full"
        disabled={disabled}
      />
    </div>
  );
}
