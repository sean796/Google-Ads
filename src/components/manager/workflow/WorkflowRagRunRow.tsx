import React, { useEffect, useRef } from "react";
import { ChevronDown, Copy, Download, Share2, Trash2 } from "lucide-react";
import { WORKFLOW_SIDEBAR_FIELD_CLASS, WORKFLOW_SIDEBAR_ROW_CLASS } from "@/components/manager/workflow/forge-workflow-styles";
import type { WorkflowRun, WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import {
  formatFileSize,
  formatRunWhen,
  runStatusLabel,
  type DownloadableFile,
  type RagClientSection,
} from "@/components/manager/workflow/workflow-rag-sidebar-files";

type WorkflowRagRunRowProps = {
  run: WorkflowRun;
  rowIndex: number;
  expanded: boolean;
  loading: boolean;
  outputs: WorkflowStepOutput[];
  files: DownloadableFile[];
  clientSections?: RagClientSection[];
  promotingKey: string | null;
  deletingRun: boolean;
  onToggle: () => void;
  onPromote: (output: WorkflowStepOutput) => void;
  onDeleteRun: () => void;
  scrollTailIntoView?: boolean;
};

function renderFileRow(
  file: DownloadableFile,
  outputs: WorkflowStepOutput[],
  onPromote: (output: WorkflowStepOutput) => void,
  promotingKey: string | null,
  indentClass = "pl-8",
) {
  const output = outputs.find((item) => item.variableKey === file.outputKey);
  return (
    <div
      key={`${file.name}-${file.href}`}
      className={cn(
        "flex h-8 items-center gap-2 px-3 text-base text-white",
        indentClass,
        WORKFLOW_SIDEBAR_ROW_CLASS,
      )}
    >
      <span className="min-w-0 flex-1 break-words font-normal text-white">{file.name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
      <a
        href={file.href}
        download={file.name}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-ui-field-hover hover:text-white"
        aria-label={`Download ${file.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <Download className="h-4 w-4" aria-hidden />
      </a>
      {output ? (
        <>
          <Button
            size="icon" icon={Copy}
            variant="quiet"
            aria-label={`Copy ${file.outputKey}`}
            onClick={(event) => {
              event.stopPropagation();
              void navigator.clipboard.writeText(`{{${file.outputKey}}}`);
            }}
          ></Button>
          <Button
            size="icon" icon={Share2}
            variant="quiet"
            aria-label={`Promote ${file.name}`}
            disabled={promotingKey === output.variableKey}
            onClick={(event) => {
              event.stopPropagation();
              onPromote(output);
            }}
          ></Button>
        </>
      ) : null}
    </div>
  );
}

export function WorkflowRagRunRow({
  run,
  expanded,
  loading,
  outputs,
  files,
  clientSections,
  promotingKey,
  deletingRun,
  onToggle,
  onPromote,
  onDeleteRun,
  scrollTailIntoView,
}: WorkflowRagRunRowProps): React.ReactElement {
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded || loading || !scrollTailIntoView) return;
    tailRef.current?.scrollIntoView({ block: "nearest" });
  }, [expanded, loading, scrollTailIntoView, files.length, outputs.length, clientSections?.length]);
  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    onToggle();
  };

  const fileCount = files.length;

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-3 px-3 text-base text-white",
          WORKFLOW_SIDEBAR_ROW_CLASS,
          expanded && "text-primary",
        )}
        onClick={handleRowClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="min-w-0 break-words font-normal">Run #{run.id}</span>
        <span className="shrink-0 capitalize text-muted-foreground">{runStatusLabel(run.status)}</span>
        <span className="shrink-0 text-muted-foreground">
          {fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "No files"}
        </span>
        <span className="ml-auto shrink-0 text-muted-foreground">{formatRunWhen(run.createdAt)}</span>
        <Button
          size="icon" icon={Trash2}
          variant="quiet"
          aria-label={`Delete run ${run.id}`}
          disabled={deletingRun}
          onClick={(event) => {
            event.stopPropagation();
            onDeleteRun();
          }}
        ></Button>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </div>

      {expanded ? (
        <div className="flex flex-col">
          {loading ? (
            <p className={cn("px-3 py-2 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
              Loading…
            </p>
          ) : null}
          {!loading && files.length === 0 && !(clientSections?.some((section) => section.files.length > 0)) ? (
            <p className={cn("px-3 py-2 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
              No files for this run.
            </p>
          ) : null}
          {!loading && clientSections && clientSections.length > 0
            ? clientSections.map((section) => (
                <div key={section.siteId} className="flex flex-col">
                  <p className={cn("px-3 py-2 text-base font-semibold text-white", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
                    {section.label}
                  </p>
                  {section.files.length === 0 ? (
                    <p className={cn("px-3 py-1 text-base text-muted-foreground", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
                      No files
                    </p>
                  ) : (
                    section.files.map((file) =>
                      renderFileRow(file, section.outputs, onPromote, promotingKey, "pl-10"),
                    )
                  )}
                </div>
              ))
            : null}
          {!loading && !clientSections?.length
            ? files.map((file) => renderFileRow(file, outputs, onPromote, promotingKey))
            : null}
          <div ref={tailRef} className="h-0 shrink-0" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
