import React, { useMemo, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { TaskFormFlatSelectPlaceholder, TaskFormPanel } from "@/components/manager/tasks/TaskFormLayout";
import {
  WorkflowInspectorField,
  WorkflowInspectorFieldGrid,
  WorkflowInspectorGroup,
} from "@/components/manager/workflow/WorkflowInspectorLayout";

import {
  TASK_EXECUTION_TARGET_BUCKETS,
  TASK_EXECUTION_TARGET_BUCKET_LABELS,
  type TaskExecutionTargetBucket,
} from "@/lib/task-execution-bucket";
import { MISSING_TEMPLATE_AUDIT_CSV_HEADERS } from "@/lib/content-optimization/missing-new-template";
import {
  decodeCsvBase64,
  defaultCsvRowsConfig,
  encodeCsvUtf8ToBase64,
  type CsvRowsInputSource,
  type WorkflowCsvRowsConfig,
} from "@/lib/workflow/csv-rows-types";
import { autoCsvColumnMap, parseWorkflowCsvRows } from "@/lib/workflow/parse-workflow-csv-rows";
import { Button, Field, FileInput, RowButton } from "@/ui";

export type CsvRowsExecutionFieldsProps = {
  config: WorkflowCsvRowsConfig;
  disabled?: boolean;
  surface?: "inspector" | "what";
  onChange: (config: WorkflowCsvRowsConfig) => void;
};

function headersForEditor(config: WorkflowCsvRowsConfig, source: CsvRowsInputSource): string[] {
  if (config.csvHeaders && config.csvHeaders.length > 0) return [...config.csvHeaders];
  if (source === "site") return [...MISSING_TEMPLATE_AUDIT_CSV_HEADERS];
  return [""];
}

export function CsvRowsExecutionFields({
  config,
  disabled = false,
  surface = "inspector",
  onChange,
}: CsvRowsExecutionFieldsProps): React.ReactElement {
  const merged = { ...defaultCsvRowsConfig(), ...config };
  const source: CsvRowsInputSource =
    merged.csvInputSource === "workflow"
      ? "workflow"
      : merged.csvInputSource === "site"
        ? "site"
        : "upload";
  const headers = headersForEditor(merged, source);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const rowCount = useMemo(() => {
    if (source === "workflow" || source === "site") return null;
    if (!merged.csvBase64?.trim()) return 0;
    try {
      const text = decodeCsvBase64(merged.csvBase64.trim());
      return parseWorkflowCsvRows(text).records.length;
    } catch {
      return 0;
    }
  }, [merged.csvBase64, source]);

  const patch = (partial: Partial<WorkflowCsvRowsConfig>) => {
    onChange({ ...merged, ...partial });
  };

  const setHeaders = (next: string[]) => {
    const csvHeaders = next.length > 0 ? next : [""];
    patch({
      csvHeaders,
      csvColumnMap: autoCsvColumnMap(csvHeaders.filter((header) => header.trim())),
    });
  };

  const handleFile = async (file: File | null) => {
    if (!file) {
      patch({ csvBase64: undefined, csvFileName: undefined, csvHeaders: undefined, csvColumnMap: {} });
      return;
    }
    const text = await file.text();
    const parsed = parseWorkflowCsvRows(text);
    patch({
      csvInputSource: "upload",
      csvBase64: encodeCsvUtf8ToBase64(text),
      csvFileName: file.name,
      csvHeaders: parsed.headers.length > 0 ? parsed.headers : [""],
      csvColumnMap: autoCsvColumnMap(parsed.headers),
    });
  };

  const fileWell = (
    <>
      <FileInput
        ref={fileInputRef}
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="tool"
        disabled={disabled || source !== "upload"}
        onClick={() => fileInputRef.current?.click()}
      >
        {merged.csvFileName || "Choose CSV file"}
      </Button>
    </>
  );

  const sourceSelect = (
    <TaskFormFlatSelectPlaceholder
      placeholder="CSV source"
      value={source}
      disabled={disabled}
      onChange={(value) =>
        patch(
          value === "site"
            ? {
                csvInputSource: "site",
                csvHeaders: [...MISSING_TEMPLATE_AUDIT_CSV_HEADERS],
                csvColumnMap: autoCsvColumnMap([...MISSING_TEMPLATE_AUDIT_CSV_HEADERS]),
              }
            : {
                csvInputSource: value === "workflow" ? "workflow" : "upload",
              },
        )
      }
      options={[
        { value: "upload", label: "Upload" },
        { value: "workflow", label: "Previous step CSV" },
        { value: "site", label: "Site inventory" },
      ]}
    />
  );

  const countLabel =
    source === "workflow"
      ? "From previous step"
      : source === "site"
        ? "From site inventory"
        : `${rowCount ?? 0} row${rowCount === 1 ? "" : "s"}`;

  const bucketSelect = (
    <TaskFormFlatSelectPlaceholder
      placeholder="Target bucket"
      value={merged.targetBucket ?? ""}
      disabled={disabled}
      onChange={(value) =>
        patch({ targetBucket: value as TaskExecutionTargetBucket })
      }
      options={TASK_EXECUTION_TARGET_BUCKETS.map((bucket) => ({
        value: bucket,
        label: TASK_EXECUTION_TARGET_BUCKET_LABELS[bucket],
      }))}
    />
  );

  const headerRows = (
    <div className="flex flex-col gap-1">
      {headers.map((value, index) => (
        <div key={index} className="flex min-w-0 items-center gap-2 bg-black px-3">
          <Field
            value={value}
            disabled={disabled}
            placeholder={index === 0 ? "url" : "H2"}
            aria-label={`Header ${index + 1}`}
            onChange={(event) => {
              const next = [...headers];
              next[index] = event.target.value;
              setHeaders(next);
            }}
          />
          <Button
            size="icon" icon={Minus}
            variant="quiet"
            disabled={disabled || headers.length <= 1}
            aria-label={`Remove ${value || `header ${index + 1}`}`}
            onClick={() => setHeaders(headers.filter((_, row) => row !== index))}
          ></Button>
        </div>
      ))}
      <RowButton
        type="button"
        disabled={disabled}
        aria-label="Add header"
        onClick={() => setHeaders([...headers, ""])}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
      </RowButton>
    </div>
  );

  if (surface === "what") {
    return (
      <div className="flex flex-col gap-3">
        <TaskFormPanel title="CSV">
          <div className="grid grid-cols-2 gap-1">
            {sourceSelect}
            {source === "site" ? bucketSelect : fileWell}
          </div>
          <div className="flex min-h-9 items-center bg-black px-3">
            <span className="text-base tabular-nums text-white">{countLabel}</span>
          </div>
        </TaskFormPanel>
        <TaskFormPanel title="Headers">{headerRows}</TaskFormPanel>
      </div>
    );
  }

  return (
    <>
      <WorkflowInspectorGroup title="CSV">
        <WorkflowInspectorFieldGrid>
          <WorkflowInspectorField>{sourceSelect}</WorkflowInspectorField>
          <WorkflowInspectorField>{source === "site" ? bucketSelect : fileWell}</WorkflowInspectorField>
        </WorkflowInspectorFieldGrid>
        <div className="flex min-h-9 items-center bg-black px-3">
          <span className="text-base tabular-nums text-white">{countLabel}</span>
        </div>
      </WorkflowInspectorGroup>
      <WorkflowInspectorGroup title="Headers">{headerRows}</WorkflowInspectorGroup>
    </>
  );
}

export function WorkflowCsvRowsInspector({
  config,
  disabled,
  onChange,
}: {
  config: WorkflowCsvRowsConfig;
  disabled?: boolean;
  onChange: (config: WorkflowCsvRowsConfig) => void;
}): React.ReactElement {
  return <CsvRowsExecutionFields config={config} disabled={disabled} onChange={onChange} />;
}
