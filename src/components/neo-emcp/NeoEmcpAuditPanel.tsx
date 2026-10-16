import React from "react";
import { AlertTriangle, CheckCircle2, Play, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { EmcpAuditFinding, EmcpBatchStepResult } from "@/lib/emcp/neo-emcp-api";
import type { EmcpPlannedStep } from "@/lib/emcp/neo-emcp-mastra-agents";

export interface NeoEmcpAuditPanelProps {
  findings: EmcpAuditFinding[];
  businessDetails: Record<string, unknown> | null;
  locations: Array<Record<string, unknown>>;
  planSummary: string;
  plannedSteps: EmcpPlannedStep[];
  dryRunResults: EmcpBatchStepResult[];
  committedResults: EmcpBatchStepResult[];
  isBusy: boolean;
  onRunAuditOnly: () => void;
  onRunDoctorPlanAndPreview: () => void;
  onCommitPlannedFixes: () => void;
}

export const NeoEmcpAuditPanel: React.FC<NeoEmcpAuditPanelProps> = ({
  findings,
  businessDetails,
  locations,
  planSummary,
  plannedSteps,
  dryRunResults,
  committedResults,
  isBusy,
  onRunAuditOnly,
  onRunDoctorPlanAndPreview,
  onCommitPlannedFixes,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 bg-zinc-900 p-4 md:grid-cols-3">
        <div className="flex flex-col gap-1 bg-black p-3">
          <span className="text-base text-muted-foreground">Shared Business Details</span>
          <span className="text-base font-semibold text-white">
            {businessDetails?.name ? String(businessDetails.name) : "Not configured"}
          </span>
          <span className="font-mono text-base tabular-nums text-primary">
            version: {businessDetails?.version ? String(businessDetails.version) : "none"}
          </span>
        </div>

        <div className="flex flex-col gap-1 bg-black p-3">
          <span className="text-base text-muted-foreground">Locations (location_source)</span>
          <span className="text-base font-semibold tabular-nums text-white">
            {locations.length} published location posts
          </span>
          <span className="text-base text-muted-foreground">
            Mode: {businessDetails?.locations ? String(businessDetails.locations) : "one"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 bg-black p-3">
          <div className="flex flex-col gap-1">
            <span className="text-base text-muted-foreground">8-Point Schema Audit</span>
            <span className="text-base font-semibold tabular-nums text-white">
              {findings.length} {findings.length === 1 ? "finding" : "findings"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              onClick={onRunAuditOnly}
              disabled={isBusy}
              className={BULK_HEADER_TOOL_BTN}
            >
              Scan Site
            </Button>
            <Button
              type="button"
              onClick={onRunDoctorPlanAndPreview}
              disabled={isBusy}
              className={BULK_HEADER_RUN_BTN}
            >
              <Play className="h-4 w-4" />
              Plan & Dry Run
            </Button>
          </div>
        </div>
      </div>

      {findings.length === 0 ? (
        <div className="flex items-center gap-3 bg-zinc-900 p-4 text-base text-foreground">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          <span>
            Run Scan Site to execute `neo-pulse/read` (`audit`) across business details, locations, page schema, and ACF fields.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 bg-zinc-900 p-4">
          <h3 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
            Audit Findings ({findings.length})
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {findings.map((finding, idx) => (
              <div
                key={`${finding.code}_${idx}`}
                className="flex items-start justify-between gap-3 bg-black p-3"
              >
                <div className="flex items-start gap-2.5">
                  {finding.severity === "error" ? (
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  )}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-zinc-900 px-2 py-0.5 font-mono text-base text-primary">
                        Check #{finding.check}: {finding.code}
                      </span>
                      {finding.fix_op ? (
                        <span className="bg-zinc-900 px-2 py-0.5 font-mono text-base text-muted-foreground">
                          {finding.fix_tool} / {finding.fix_op}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-base text-white">{finding.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {plannedSteps.length > 0 ? (
        <div className="flex flex-col gap-3 bg-zinc-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold uppercase tracking-wider text-primary">
                Mastra Doctor Remediation Plan ({plannedSteps.length} steps)
              </h3>
              <p className="text-base text-muted-foreground">{planSummary}</p>
            </div>
            <Button
              type="button"
              onClick={onCommitPlannedFixes}
              disabled={isBusy}
              className={BULK_HEADER_RUN_BTN}
            >
              <Play className="h-4 w-4" />
              Commit Planned Writes
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {plannedSteps.map((step) => (
              <div key={step.id} className="flex flex-col gap-1.5 bg-black p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-white">{step.title}</span>
                  <span className="font-mono text-base text-primary">
                    {step.tool} {step.operation ? `-> ${step.operation}` : ""}
                  </span>
                </div>
                <p className="text-base text-muted-foreground">{step.reason}</p>
                <pre className="overflow-x-auto bg-zinc-950 p-2 font-mono text-base text-zinc-300">
                  {JSON.stringify(step.arguments, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dryRunResults.length > 0 || committedResults.length > 0 ? (
        <div className="flex flex-col gap-2 bg-zinc-900 p-4">
          <h3 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
            Execution & Dry-Run Output
          </h3>
          {dryRunResults.map((res) => (
            <div key={res.id} className="flex flex-col gap-1 bg-black p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-base text-primary">
                  [DRY RUN] {res.tool} {res.operation}
                </span>
                <span className="font-mono text-base tabular-nums text-muted-foreground">
                  {res.durationMs}ms
                </span>
              </div>
              <pre className="overflow-x-auto bg-zinc-950 p-2 font-mono text-base text-zinc-300">
                {JSON.stringify(res.data ?? res.error, null, 2)}
              </pre>
            </div>
          ))}
          {committedResults.map((res) => (
            <div key={`commit_${res.id}`} className="flex flex-col gap-1 bg-black p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-base text-primary">
                  [COMMITTED] {res.tool} {res.operation}
                </span>
                <span className="font-mono text-base tabular-nums text-muted-foreground">
                  {res.durationMs}ms
                </span>
              </div>
              <pre className="overflow-x-auto bg-zinc-950 p-2 font-mono text-base text-zinc-300">
                {JSON.stringify(res.data ?? res.error, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
