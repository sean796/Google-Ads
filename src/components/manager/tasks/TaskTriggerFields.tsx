import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ActionButton, Field, Pill, SelectField } from "@/ui";
import {
  TaskFormFieldGrid,
  TaskFormFlatGrid,
  TaskFormFlatSelectPlaceholder,
  TaskFormInfield,
  TaskFormPlaceholderCell,
} from "@/components/manager/tasks/TaskFormLayout";import { TaskExecutionTargetFields } from "@/components/manager/tasks/TaskExecutionTargetFields";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import type {
  TaskTriggerConfig,
  TaskTriggerCondition,
  TaskTriggerEvaluateResult,
  TaskTriggerSignal,
} from "@/lib/task-trigger-types";
import {
  TASK_TRIGGER_SIGNAL_DEFAULTS,
  TASK_TRIGGER_SIGNAL_LABELS,
  TASK_TRIGGER_SIGNALS,
  TASK_TRIGGER_SOURCE_OPTIONS,
  TASK_TRIGGER_SOURCE_SHORT_LABELS,
  POLL_INTERVAL_UNIT_LABELS,
  defaultTaskTriggerConfig,
  isScheduleOnlyTriggerSource,
  partsToPollHours,
  pollHoursToParts,
  primaryTriggerSource,
  type PollIntervalUnit,
  type TaskTriggerSource,
} from "@/lib/task-trigger-types";

export type TaskTriggerFieldsProps = {
  triggerConfig: TaskTriggerConfig;
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "inline";
  onChange: (config: TaskTriggerConfig) => void;
  onExecutionPayloadChange: (payload: TaskExecutionPayload) => void;
};

function conditionKey(condition: TaskTriggerCondition): string {
  return `${condition.signal}:${condition.operator}:${condition.value}:${condition.minImpressions ?? ""}`;
}

const MATCH_OPTIONS = [
  { value: "any", label: "Any condition" },
  { value: "all", label: "All conditions" },
];
const EVALUATE_STATES = ["Evaluate", "Evaluating"] as const;
const TEST_FIRE_STATES = ["Test trigger (simulated match, live run)", "Queuing"] as const;
const ROW_CLASS = "flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1";

function TriggerStackedNumericCell({
  label,
  value,
  disabled,
  hidden,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  hidden?: boolean;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <TaskFormPlaceholderCell className={cn("min-w-0 gap-2 px-2", hidden && "pointer-events-none invisible")}>
      <span className="text-base text-muted-foreground">{label}</span>
      <Field
        size="short"
        type="number"
        min={1}
        placeholder={label}
        value={value}
        disabled={disabled || hidden}
        tabIndex={hidden ? -1 : 0}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || value))}
      />
    </TaskFormPlaceholderCell>
  );
}

function PollFrequencyField({
  pollHours,
  disabled,
  onChange,
}: {
  pollHours: number;
  disabled?: boolean;
  onChange: (pollHours: number) => void;
}): React.ReactElement {
  const { value, unit } = pollHoursToParts(pollHours);
  return (
    <TaskFormPlaceholderCell className="min-w-0 gap-2 px-2">
      <span className="text-base text-muted-foreground">Poll frequency</span>
      <Field
        size="short"
        type="number"
        min={1}
        placeholder="Poll frequency"
        value={value}
        disabled={disabled}
        aria-label="Poll frequency value"
        onChange={(e) => onChange(partsToPollHours(Math.max(1, Number(e.target.value) || value), unit))}
      />
      <SelectField
        placeholder="Poll frequency unit"
        width="sm"
        value={unit}
        disabled={disabled}
        options={(Object.keys(POLL_INTERVAL_UNIT_LABELS) as PollIntervalUnit[]).map((u) => ({
          value: u,
          label: POLL_INTERVAL_UNIT_LABELS[u],
        }))}
        onValueChange={(v) => onChange(partsToPollHours(value, v as PollIntervalUnit))}
      />
    </TaskFormPlaceholderCell>
  );
}
function toggleCondition(
  conditions: TaskTriggerCondition[],
  signal: TaskTriggerSignal,
): TaskTriggerCondition[] {
  const existing = conditions.find((c) => c.signal === signal);
  if (existing) {
    return conditions.filter((c) => c.signal !== signal);
  }
  const defaults = TASK_TRIGGER_SIGNAL_DEFAULTS[signal];
  return [
    ...conditions,
    {
      signal,
      operator: defaults.operator,
      value: defaults.value,
      minImpressions: defaults.minImpressions,
    },
  ];
}

export function TaskTriggerFields({
  triggerConfig,
  executionPayload,
  disabled = false,
  layout = "stack",
  onChange,
  onExecutionPayloadChange,
}: TaskTriggerFieldsProps): React.ReactElement {
  const config = triggerConfig ?? defaultTaskTriggerConfig();
  const inline = layout === "inline";
  const activeSignals = useMemo(
    () => new Set(config.conditions.map((c) => c.signal)),
    [config.conditions],
  );

  const patchConfig = (patch: Partial<TaskTriggerConfig>) => onChange({ ...config, ...patch });
  const scheduleOnly = isScheduleOnlyTriggerSource(config.sources);
  const activeSource = primaryTriggerSource(config.sources);

  const handleSourceChange = (source: TaskTriggerSource) => {
    patchConfig({
      sources: [source],
      ...(source === "schedule" ? { conditions: [] } : {}),
    });
  };

  const sourceSelectOptions = TASK_TRIGGER_SOURCE_OPTIONS.filter((opt) => opt.enabled).map((opt) => ({
    value: opt.value,
    label: inline ? TASK_TRIGGER_SOURCE_SHORT_LABELS[opt.value] : opt.label,
  }));

  const signalsHeaderSecondary = scheduleOnly
    ? "Runs on poll interval. Picks URLs from the scan bucket (no GSC signals)."
    : config.conditions.length === 0
      ? "Select at least one condition."
      : null;

  const sourcesField = (
    <SelectField
      placeholder="Source"
      width="full"
      value={activeSource}
      disabled={disabled}
      options={sourceSelectOptions}
      onValueChange={(v) => handleSourceChange(v as TaskTriggerSource)}
    />
  );

  const matchField = (
    <SelectField
      placeholder="Match"
      width="full"
      value={config.match}
      disabled={disabled}
      options={MATCH_OPTIONS}
      onValueChange={(v) => patchConfig({ match: v as TaskTriggerConfig["match"] })}
    />
  );

  const signalPills = TASK_TRIGGER_SIGNALS.map((signal) => (
    <Pill
      key={signal}
      square
      label={TASK_TRIGGER_SIGNAL_LABELS[signal]}
      active={activeSignals.has(signal)}
      disabled={disabled}
      onClick={() => patchConfig({ conditions: toggleCondition(config.conditions, signal) })}
    />
  ));

  const conditionRows = config.conditions.map((condition) => (
    <div key={conditionKey(condition)} className={ROW_CLASS}>
      <span className="text-base text-foreground">{TASK_TRIGGER_SIGNAL_LABELS[condition.signal]}</span>
      <Field
        size="count"
        type="number"
        min={0}
        value={condition.value}
        disabled={disabled}
        placeholder="Threshold"
        aria-label={`${TASK_TRIGGER_SIGNAL_LABELS[condition.signal]} threshold`}
        onChange={(e) => {
          const value = Number(e.target.value);
          patchConfig({
            conditions: config.conditions.map((c) =>
              c.signal === condition.signal ? { ...c, value: Number.isFinite(value) ? value : 0 } : c,
            ),
          });
        }}
      />
      <Field
        size="count"
        type="number"
        min={0}
        value={condition.minImpressions ?? TASK_TRIGGER_SIGNAL_DEFAULTS[condition.signal].minImpressions ?? 0}
        disabled={disabled}
        placeholder="Min impressions"
        aria-label={`${TASK_TRIGGER_SIGNAL_LABELS[condition.signal]} min impressions`}
        onChange={(e) => {
          const minImpressions = Number(e.target.value);
          patchConfig({
            conditions: config.conditions.map((c) =>
              c.signal === condition.signal
                ? { ...c, minImpressions: Number.isFinite(minImpressions) ? minImpressions : 0 }
                : c,
            ),
          });
        }}
      />
      <span className="text-base text-muted-foreground">min impressions</span>
    </div>
  ));

  const numericFieldRows: { label: string; value: number; onChange: (value: number) => void }[] =
    scheduleOnly
      ? [
          {
            label: "URL cooldown (hours)",
            value: config.cooldownHours,
            onChange: (value) => patchConfig({ cooldownHours: value }),
          },
        ]
      : [
          {
            label: "Lookback days",
            value: config.lookbackDays,
            onChange: (value) => patchConfig({ lookbackDays: value }),
          },
          {
            label: "Compare days",
            value: config.compareDays,
            onChange: (value) => patchConfig({ compareDays: value }),
          },
          {
            label: "URL cooldown (hours)",
            value: config.cooldownHours,
            onChange: (value) => patchConfig({ cooldownHours: value }),
          },
        ];

  const inlineNumericRows: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    hidden?: boolean;
  }[] = [
    {
      label: "Lookback days",
      value: config.lookbackDays,
      onChange: (value) => patchConfig({ lookbackDays: value }),
      hidden: scheduleOnly,
    },
    {
      label: "Compare days",
      value: config.compareDays,
      onChange: (value) => patchConfig({ compareDays: value }),
      hidden: scheduleOnly,
    },
    {
      label: "URL cooldown (hours)",
      value: config.cooldownHours,
      onChange: (value) => patchConfig({ cooldownHours: value }),
    },
  ];

  const numericField = (row: { label: string; value: number; onChange: (value: number) => void }) => (
    <TaskFormPlaceholderCell key={row.label} className="min-w-0 gap-2 px-2">
      <span className="text-base text-muted-foreground">{row.label}</span>
      <Field
        size="short"
        type="number"
        min={1}
        placeholder={row.label}
        value={row.value}
        disabled={disabled}
        onChange={(e) => row.onChange(Math.max(1, Number(e.target.value) || row.value))}
      />
    </TaskFormPlaceholderCell>
  );

  if (inline) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        <TaskFormFlatGrid className="grid-cols-2">
          {sourcesField}
          <TaskFormFlatSelectPlaceholder
            placeholder="Match"
            value={config.match}
            onChange={(v) => patchConfig({ match: v as TaskTriggerConfig["match"] })}
            disabled={disabled || scheduleOnly}
            options={MATCH_OPTIONS}
            className={cn("min-w-0", scheduleOnly && "pointer-events-none invisible")}
          />
        </TaskFormFlatGrid>
        {!scheduleOnly ? (
          <TaskFormPlaceholderCell className="min-w-0 flex-col items-stretch gap-1 px-2">
            <div className={ROW_CLASS}>
              <span className="shrink-0 text-base text-muted-foreground">Conditions</span>
              {signalsHeaderSecondary ? (
                <span className="min-w-0 text-base text-muted-foreground">{signalsHeaderSecondary}</span>
              ) : null}
            </div>
            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1">{signalPills}</div>
            {conditionRows}
          </TaskFormPlaceholderCell>
        ) : null}
        <TaskFormFlatGrid className="grid-cols-2 md:grid-cols-4">
          <PollFrequencyField
            pollHours={config.pollHours}
            disabled={disabled}
            onChange={(pollHours) => patchConfig({ pollHours })}
          />
          {inlineNumericRows.map((row) => (
            <TriggerStackedNumericCell
              key={row.label}
              label={row.label}
              value={row.value}
              disabled={disabled}
              hidden={row.hidden}
              onChange={row.onChange}
            />
          ))}
        </TaskFormFlatGrid>
        <TaskExecutionTargetFields
          executionPayload={executionPayload}
          disabled={disabled}
          variant="inlineRow"
          bucketLabel="Scan bucket"
          onChange={onExecutionPayloadChange}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TaskFormFieldGrid>
        {sourcesField}
        {!scheduleOnly ? matchField : null}
      </TaskFormFieldGrid>

      {scheduleOnly ? (
        <p className="text-base text-muted-foreground">
          Runs on poll interval. Picks URLs from the scan bucket (no GSC signals).
        </p>
      ) : (
        <TaskFormInfield label="Conditions">
          <div className="flex flex-wrap gap-1">{signalPills}</div>
          {config.conditions.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">{conditionRows}</div>
          ) : (
            <p className="mt-1 text-base text-muted-foreground">Select at least one condition.</p>
          )}
        </TaskFormInfield>
      )}

      {scheduleOnly ? (
        <TaskFormFieldGrid>
          <PollFrequencyField
            pollHours={config.pollHours}
            disabled={disabled}
            onChange={(pollHours) => patchConfig({ pollHours })}
          />
          {numericFieldRows.map(numericField)}
        </TaskFormFieldGrid>
      ) : (
        <>
          <TaskFormFieldGrid>{numericFieldRows.slice(0, 2).map(numericField)}</TaskFormFieldGrid>
          <TaskFormFieldGrid>
            <PollFrequencyField
              pollHours={config.pollHours}
              disabled={disabled}
              onChange={(pollHours) => patchConfig({ pollHours })}
            />
            {numericFieldRows.slice(2).map(numericField)}
          </TaskFormFieldGrid>
        </>
      )}

      <TaskExecutionTargetFields
        executionPayload={executionPayload}
        disabled={disabled}
        variant="inline"
        bucketLabel="Scan bucket"
        onChange={onExecutionPayloadChange}
      />

      {!scheduleOnly ? (
        <p className="text-base text-muted-foreground">
          GSC data lags about 3 days. Only inventory URLs with impressions in the selected window are evaluated.
        </p>
      ) : null}
    </div>
  );
}
export type TaskTriggerEvaluatePanelProps = {
  evaluating: boolean;
  testFiring: boolean;
  result: TaskTriggerEvaluateResult | null;
  error: string | null;
  disabled?: boolean;
  onEvaluate: () => void;
  onTestFire: () => void;
};

export function TaskTriggerEvaluatePanel({
  evaluating,
  testFiring,
  result,
  error,
  disabled = false,
  onEvaluate,
  onTestFire,
}: TaskTriggerEvaluatePanelProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <ActionButton
          variant="tool"
          states={EVALUATE_STATES}
          state={evaluating ? "Evaluating" : "Evaluate"}
          disabled={disabled || evaluating || testFiring}
          onClick={onEvaluate}
        />
        <ActionButton
          states={TEST_FIRE_STATES}
          state={testFiring ? "Queuing" : TEST_FIRE_STATES[0]}
          disabled={disabled || evaluating || testFiring}
          onClick={onTestFire}
        />
      </div>
      <p className="h-6 text-base text-ui-danger">{error}</p>
      {result?.ok ? (
        <div className="flex flex-col gap-2">
          <p className="text-base text-foreground">
            Scanned {result.scannedCount ?? 0} URLs · GSC data for {result.gscDataCount ?? 0} ·{" "}
            {result.matchedCount ?? 0} matches
            {result.skippedNoGscData != null ? ` · ${result.skippedNoGscData} skipped (no GSC data)` : null}
          </p>
          {(result.matches ?? []).length > 0 ? (
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-base">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2">URL</th>
                    <th className="py-1 pr-2">Signal</th>
                    <th className="py-1 pr-2">Current</th>
                    <th className="py-1">Prior</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.matches ?? []).map((row) => (
                    <tr key={row.url} className="align-top text-foreground">
                      <td className="py-1 pr-2">{row.url}</td>
                      <td className="py-1 pr-2">{TASK_TRIGGER_SIGNAL_LABELS[row.signal]}</td>
                      <td className="py-1 pr-2">
                        imp {row.current.impressions ?? 0}, ctr {(row.current.ctr ?? 0).toFixed(3)}, pos{" "}
                        {(row.current.position ?? 0).toFixed(1)}
                      </td>
                      <td className="py-1">
                        imp {row.prior.impressions ?? 0}, ctr {(row.prior.ctr ?? 0).toFixed(3)}, pos{" "}
                        {(row.prior.position ?? 0).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}