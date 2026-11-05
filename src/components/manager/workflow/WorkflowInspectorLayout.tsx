import React from "react";
import { cn } from "@/lib/utils";
import { WORKFLOW_INSPECTOR_FIELD_CELL_CLASS, WORKFLOW_INSPECTOR_FIELD_GRID_CLASS, WORKFLOW_INSPECTOR_GROUP_CLASS, WORKFLOW_INSPECTOR_GROUP_TITLE_CLASS, WORKFLOW_INSPECTOR_KIND_HEADER_CLASS, WORKFLOW_INSPECTOR_KIND_LABEL_CLASS, WORKFLOW_INSPECTOR_TILE_CLASS, workflowKindBadgeClass } from "@/components/manager/workflow/forge-workflow-styles";
import type { WorkflowNodeKind } from "@/lib/workflow/workflow-types";
import { workflowTriggerLabel } from "@/lib/workflow/workflow-types";
import { Field } from "@/ui";

export function WorkflowInspectorTile({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn(WORKFLOW_INSPECTOR_TILE_CLASS, className)}>{children}</div>;
}

export function WorkflowInspectorKindHeader({
  kind,
  title,
  onTitleChange,
  clientSiteId,
}: {
  kind: WorkflowNodeKind;
  title: string;
  onTitleChange: (value: string) => void;
  clientSiteId?: string;
}): React.ReactElement {
  const kindLabel = workflowTriggerLabel(kind) || kind;

  return (
    <div className={WORKFLOW_INSPECTOR_KIND_HEADER_CLASS}>
      <span className={cn(WORKFLOW_INSPECTOR_KIND_LABEL_CLASS, workflowKindBadgeClass(kind, clientSiteId))}>
        {kindLabel}
      </span>
      <Field
        placeholder={`${kindLabel} step name`}
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        aria-label={`${kindLabel} step name`}
      />
    </div>
  );
}

export function WorkflowInspectorGroup({
  title,
  titleEnd,
  children,
  className,
}: {
  title?: string;
  titleEnd?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn(WORKFLOW_INSPECTOR_GROUP_CLASS, className)}>
      {title ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
          <p className={WORKFLOW_INSPECTOR_GROUP_TITLE_CLASS}>{title}</p>
          {titleEnd}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function WorkflowInspectorFieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn(WORKFLOW_INSPECTOR_FIELD_GRID_CLASS, className)}>{children}</div>;
}

export function WorkflowInspectorField({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn(WORKFLOW_INSPECTOR_FIELD_CELL_CLASS, className)}>{children}</div>;
}
