import React, { useEffect, useState } from "react";
import { WorkflowInspectorGroup } from "@/components/manager/workflow/WorkflowInspectorLayout";
import { WORKFLOW_FORM_FLAT_CONTROL_CLASS } from "@/components/manager/workflow/forge-workflow-styles";
import {
  TASK_FORM_FLAT_CONTROL_CLASS,
} from "@/components/manager/tasks/task-form-layout-styles";
import {
  computeTrailingFullMonthsCompareRanges,
  formatGscComparePeriodLabel,
  parseTrailingMonthCount,
  TRAILING_MONTH_COUNT_MAX,
  TRAILING_MONTH_COUNT_MIN,
} from "@/lib/gsc-reporting/gsc-fetch-date-presets";
import {
  payloadForGscTrailingMonthCount,
  resolveGscTrailingMonthCount,
} from "@/lib/gsc-reporting/resolve-gsc-reporting-run-config";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { cn } from "@/lib/utils";
import { Field } from "@/ui";

export type GscReportingPeriodFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "workflow" | "task";
  onChange: (payload: TaskExecutionPayload) => void;
};

export function GscReportingPeriodFields({
  executionPayload,
  disabled = false,
  layout = "task",
  onChange,
}: GscReportingPeriodFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const monthCount = resolveGscTrailingMonthCount(payload);
  const [draft, setDraft] = useState(() => String(monthCount));

  useEffect(() => {
    setDraft(String(monthCount));
  }, [monthCount]);

  const ranges = computeTrailingFullMonthsCompareRanges(monthCount);
  const periodALabel = formatGscComparePeriodLabel(ranges.primary.startDate, ranges.primary.endDate);
  const periodBLabel = formatGscComparePeriodLabel(ranges.compare.startDate, ranges.compare.endDate);

  const setMonthCount = (raw: string) => {
    setDraft(raw);
    const parsed = parseTrailingMonthCount(raw);
    if (parsed == null) return;
    onChange({ ...payload, ...payloadForGscTrailingMonthCount(parsed) });
  };

  const picker = (
    <div className="flex h-8 min-h-8 items-center gap-2">
      <Field
        type="number"
        inputMode="numeric"
        min={TRAILING_MONTH_COUNT_MIN}
        max={TRAILING_MONTH_COUNT_MAX}
        step={1}
        placeholder="Months"
        aria-label="Months vs prior"
        disabled={disabled}
        value={draft}
        onChange={(event) => setMonthCount(event.target.value)}
      />
      <span className="min-w-0 break-words text-base text-muted-foreground">months vs prior</span>
    </div>
  );

  const periodPreview = (
    <dl className="space-y-2 text-base">
      <div>
        <dt className="text-muted-foreground">Period A (current)</dt>
        <dd className="text-white tabular-nums">{periodALabel}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Period B (compare)</dt>
        <dd className="text-white tabular-nums">{periodBLabel}</dd>
      </div>
    </dl>
  );

  if (layout === "workflow") {
    return (
      <WorkflowInspectorGroup title="Reporting periods">
        {picker}
        <div className="mt-3">{periodPreview}</div>
      </WorkflowInspectorGroup>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {picker}
      {periodPreview}
    </div>
  );
}
