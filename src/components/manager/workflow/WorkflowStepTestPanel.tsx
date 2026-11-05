import React, { useMemo } from "react";
import { Play } from "lucide-react";
import {
  WORKFLOW_INSPECTOR_RUN_BTN,
  WORKFLOW_STEP_TEST_CELL_CLASS,
  WORKFLOW_STEP_TEST_GRID_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import type { WorkflowNode } from "@/lib/workflow/workflow-types";
import {
  blankContentGapStepTestRows,
  isContentGapCheckStep,
  isGoogleDriveStep,
  mergeContentGapStepTestRows,
  resolveGoogleDriveStepTestLink,
  resolveGoogleDriveStepTestLinkLabel,
  humanizeGoogleDriveStepTestMessage,
  resolveWorkflowStepTestRows,
  type WorkflowStepTestResult,
  type WorkflowStepTestRow,
} from "@/lib/workflow/workflow-step-test";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type WorkflowStepTestPanelProps = {
  node: WorkflowNode;
  stepTestResult?: WorkflowStepTestResult | null;
  testingStepId?: string | null;
  onTestStep: (nodeId: string) => void;
};

function rowsByLabel(rows: WorkflowStepTestRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.label, row.value]));
}

function CompactTestCell({
  label,
  value,
  valueClassName,
  numeric = false,
  className,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  numeric?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn(WORKFLOW_STEP_TEST_CELL_CLASS, className)} title={value ? `${label} ${value}` : label}>
      <span className="min-w-0 break-words text-base">
        <span className="text-muted-foreground">{label}</span>
        {value ? (
          <>
            <span className="text-muted-foreground"> </span>
            <span className={cn("text-white", numeric && "tabular-nums", valueClassName)}>{value}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

export function WorkflowStepTestPanel({
  node,
  stepTestResult,
  testingStepId,
  onTestStep,
}: WorkflowStepTestPanelProps): React.ReactElement {
  const running = testingStepId === node.id;
  const hasResult = stepTestResult?.nodeId === node.id;
  const showContentGap = isContentGapCheckStep(node);
  const resultOk = hasResult ? stepTestResult?.ok : undefined;

  const contentGapRows = useMemo(() => {
    if (!showContentGap) return blankContentGapStepTestRows();
    if (hasResult && stepTestResult?.rows?.length) {
      return mergeContentGapStepTestRows(stepTestResult.rows);
    }
    if (hasResult && stepTestResult) return resolveWorkflowStepTestRows(node, stepTestResult);
    return blankContentGapStepTestRows();
  }, [hasResult, node, showContentGap, stepTestResult]);

  const values = rowsByLabel(contentGapRows);

  const showGoogleDrive = isGoogleDriveStep(node);
  const driveTestLink = useMemo(() => {
    if (!showGoogleDrive || !hasResult) return "";
    return resolveGoogleDriveStepTestLink(stepTestResult);
  }, [hasResult, showGoogleDrive, stepTestResult]);

  const genericValue = useMemo(() => {
    if (showContentGap || showGoogleDrive) return "";
    if (hasResult && stepTestResult) {
      const rows = resolveWorkflowStepTestRows(node, stepTestResult);
      return rows[0]?.value ?? "";
    }
    return "";
  }, [hasResult, node, showContentGap, showGoogleDrive, stepTestResult]);

  if (!showContentGap && showGoogleDrive) {
    const resultMessage =
      hasResult && !driveTestLink
        ? humanizeGoogleDriveStepTestMessage(stepTestResult?.summary?.trim() ?? "") ||
          (running ? "Testing…" : "")
        : "";
    return (
      <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-1 gap-0.5 overflow-hidden">
        <Button
          variant="run"
          type="button"
          onClick={() => onTestStep(node.id)}
        >
          <Play className="h-4 w-4" />
          Test step
        </Button>
        <div
          className={cn(WORKFLOW_STEP_TEST_CELL_CLASS, "min-w-0")}
          title={resultMessage || "Result"}
        >
          <span className="min-w-0 break-words text-base">
            <span className="text-muted-foreground">Result</span>
            {driveTestLink ? (
              <>
                <span className="text-muted-foreground"> </span>
                <a
                  href={driveTestLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {resolveGoogleDriveStepTestLinkLabel(stepTestResult)}
                </a>
              </>
            ) : resultMessage ? (
              <>
                <span className="text-muted-foreground"> </span>
                <span
                  className={cn(
                    resultOk === false ? "text-[hsl(var(--semantic-warning-foreground))]" : "text-white",
                  )}
                >
                  {resultMessage}
                </span>
              </>
            ) : null}
          </span>
        </div>
      </div>
    );
  }

  if (!showContentGap) {
    return (
      <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-1 gap-0.5 overflow-hidden">
        <Button
          variant="run"
          type="button"
          onClick={() => onTestStep(node.id)}
        >
          <Play className="h-4 w-4" />
          Test step
        </Button>
        <CompactTestCell
          label="Result"
          value={genericValue}
          valueClassName={resultOk === false ? "text-[hsl(var(--semantic-warning-foreground))]" : undefined}
        />
      </div>
    );
  }

  return (
    <div className={WORKFLOW_STEP_TEST_GRID_CLASS}>
      <Button
        variant="run"
        type="button"
        onClick={() => onTestStep(node.id)}
      >
        <Play className="h-4 w-4 shrink-0" />
        Test
      </Button>
      <CompactTestCell
        label="Content"
        value={values.Content ?? ""}
        valueClassName={hasResult && resultOk === false ? "text-[hsl(var(--semantic-warning-foreground))]" : undefined}
      />
      <CompactTestCell label="Current" value={values.Current ?? ""} numeric />
      <CompactTestCell label="Target" value={values.Target ?? ""} numeric />
      <CompactTestCell
        label="Gap"
        value={values.Gap ?? ""}
        numeric
        valueClassName={cn(
          values.Gap && Number(values.Gap) > 0
            ? "text-[hsl(var(--semantic-warning-foreground))]"
            : resultOk
              ? "text-primary"
              : undefined,
        )}
      />
    </div>
  );
}
