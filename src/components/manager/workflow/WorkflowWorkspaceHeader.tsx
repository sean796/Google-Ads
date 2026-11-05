import React from "react";
import { Play, Save, Upload } from "lucide-react";
import { PulseForgeBreadcrumbs } from "@/components/manager/pulse-forge/PulseForgeBreadcrumbs";
import {
  WORKFLOW_HEADER_BAND_CLASS,
  WORKFLOW_HEADER_NAME_CLASS,
  WORKFLOW_HEADER_RUN_BTN,
  WORKFLOW_HEADER_TOOL_BTN,
} from "@/components/manager/workflow/forge-workflow-styles";
import type { PulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-hash";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

export type WorkflowWorkspaceHeaderProps = {
  route: PulseForgeRoute;
  workflowName?: string | null;
  name: string;
  saving: boolean;
  testingRun?: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onTestRun: () => void;
  publishDisabled?: boolean;
};

export function WorkflowWorkspaceHeader({
  route,
  workflowName,
  name,
  saving,
  testingRun = false,
  onNameChange,
  onSave,
  onPublish,
  onTestRun,
  publishDisabled = false,
}: WorkflowWorkspaceHeaderProps): React.ReactElement {
  return (
    <div className={WORKFLOW_HEADER_BAND_CLASS}>
      <PulseForgeBreadcrumbs
        route={route}
        workflowName={workflowName}
        hideLeaf
        className="shrink-0"
      />
      <Field
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Untitled workflow"
        aria-label="Workflow name"
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="quiet"
          type="button"
          disabled={saving || testingRun}
          onClick={onSave}
        >
          <Save className="h-4 w-4 shrink-0" />
          Save
        </Button>
        <Button
          variant="quiet"
          type="button"
          disabled={saving || testingRun || publishDisabled}
          onClick={onPublish}
        >
          <Upload className="h-4 w-4 shrink-0" />
          Publish
        </Button>
        <Button
          variant="quiet"
          type="button"
          disabled={testingRun || saving}
          onClick={onTestRun}
        >
          <Play className="h-4 w-4 shrink-0" />
          {testingRun ? "Testing…" : "Test"}
        </Button>
      </div>
    </div>
  );
}
