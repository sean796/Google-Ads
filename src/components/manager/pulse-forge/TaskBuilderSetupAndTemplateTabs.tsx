import type { Dispatch, SetStateAction } from "react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { TaskFormInlineRow } from "@/components/manager/tasks/TaskFormLayout";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
import { TaskBuilderPanelShell } from "@/components/manager/pulse-forge/TaskBuilderPanelShell";
import { TaskBuilderClientSitePicker } from "@/components/manager/pulse-forge/TaskBuilderClientSitePicker";
import { FORGE_TASK_BUILDER_INFIELD_CLASS } from "@/components/manager/pulse-forge/forge-recipe-styles";
import type { TaskBuilderMode } from "@/components/manager/pulse-forge/use-task-builder-state";
import type { AutomationPlan } from "@/lib/automation-planner-types";
import type { ForgeAutomationVisibility, TaskProject, TeamTask } from "@/lib/tasks-types";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { Button, Field, SelectField } from "@/ui";

type TaskBuilderSetupTabProps = {
  mode: TaskBuilderMode;
  plan: AutomationPlan;
  setPlan: Dispatch<SetStateAction<AutomationPlan>>;
  saving: boolean;
  automationVisibility: ForgeAutomationVisibility;
  setAutomationVisibility: Dispatch<SetStateAction<ForgeAutomationVisibility>>;
  sites: WordPressSiteOption[];
  clientAgnosticPlan: boolean;
  clientId: string;
  setClientId: Dispatch<SetStateAction<string>>;
  selectedClientIds: Set<string>;
  setSelectedClientIds: Dispatch<SetStateAction<Set<string>>>;
};

export function TaskBuilderSetupTab({
  mode,
  plan,
  setPlan,
  saving,
  automationVisibility,
  setAutomationVisibility,
  sites,
  clientAgnosticPlan,
  clientId,
  setClientId,
  selectedClientIds,
  setSelectedClientIds,
}: TaskBuilderSetupTabProps): React.ReactElement {
  return (
    <TaskBuilderPanelShell>
        <div className="flex h-full min-h-0 flex-col gap-4">
          {mode === "workflow-agent" ? (
            <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
              <span className="shrink-0 text-base text-white">Name</span>
              <Field
                value={plan.action.title ?? plan.name}
                onChange={(e) => {
                  const value = e.target.value;
                  setPlan((p) => ({
                    ...p,
                    name: value,
                    action: { ...p.action, title: value },
                  }));
                }}
                placeholder="Step name"
                disabled={saving}
              />
            </div>
          ) : (
            <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-3">
              <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                <span className="shrink-0 text-base text-white">Visibility</span>
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <WorkspacePill
                    label="Private"
                    square
                    tone="forge"
                    active={automationVisibility === "private"}
                    disabled={saving}
                    onClick={() => setAutomationVisibility("private")}
                  />
                  <WorkspacePill
                    label="Public"
                    square
                    tone="forge"
                    active={automationVisibility === "public"}
                    disabled={saving}
                    onClick={() => setAutomationVisibility("public")}
                  />
                </div>
              </div>
              <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                <span className="shrink-0 text-base text-white">Keyword</span>
                <Field
                  value={plan.keyword}
                  onChange={(e) => setPlan((p) => ({ ...p, keyword: e.target.value }))}
                  placeholder="automation-keyword"
                  disabled={saving}
                />
              </div>
              <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                <span className="shrink-0 text-base text-white">Name</span>
                <Field
                  value={plan.name}
                  onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Automation name"
                  disabled={saving}
                />
              </div>
            </div>
          )}
          {sites.length > 0 && mode !== "workflow-agent" && !clientAgnosticPlan ? (
            mode === "edit" ? (
              <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-2">
                <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                  <span className="shrink-0 text-base text-white">Client site</span>
                  <SelectField placeholder="Client site" value={clientId || "__empty__"} onValueChange={(v) => setClientId(v === "__empty__" ? "" : v)} disabled={saving} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
                </div>
              </div>
            ) : (
              <section className="flex min-h-0 flex-1 flex-col">
                <TaskBuilderClientSitePicker
                  sites={sites}
                  selectedIds={selectedClientIds}
                  onChange={setSelectedClientIds}
                  disabled={saving}
                />
              </section>
            )
          ) : null}
        </div>
    </TaskBuilderPanelShell>
  );
}

type TaskBuilderTemplateTabProps = {
  teamId: number | null;
  editAutomation: TaskProject | null;
  editTask: TeamTask | null;
  saving: boolean;
  onTaskExecuted?: () => void;
  handleSaveTemplate: () => Promise<void>;
  saveFromName: string;
  setSaveFromName: Dispatch<SetStateAction<string>>;
  saveFromKeyword: string;
  setSaveFromKeyword: Dispatch<SetStateAction<string>>;
};

export function TaskBuilderTemplateTab({
  teamId,
  editAutomation,
  editTask,
  saving,
  onTaskExecuted,
  handleSaveTemplate,
  saveFromName,
  setSaveFromName,
  saveFromKeyword,
  setSaveFromKeyword,
}: TaskBuilderTemplateTabProps): React.ReactElement {
  return (
    <TaskBuilderPanelShell label="Template">
        <div className="flex flex-col gap-3">
          {editTask ? (
            <div className="flex justify-end">
              <AutomationTaskExecuteButton
                teamId={teamId}
                taskId={editTask.id}
                task={editTask}
                project={editAutomation}
                disabled={saving}
                onExecuted={() => onTaskExecuted?.()}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <TaskFormInlineRow label="Template name">
              <Field
                value={saveFromName}
                onChange={(e) => setSaveFromName(e.target.value)}
                placeholder="Team template name"
                disabled={saving}
              />
            </TaskFormInlineRow>
            <TaskFormInlineRow label="Template keyword">
              <Field
                value={saveFromKeyword}
                onChange={(e) => setSaveFromKeyword(e.target.value)}
                placeholder="template-keyword"
                disabled={saving}
              />
            </TaskFormInlineRow>
            <TaskFormInlineRow label="Save">
              <Button
                variant="run"
                type="button"
                disabled={saving}
                onClick={() => void handleSaveTemplate()}
              >
                Save template
              </Button>
            </TaskFormInlineRow>
          </div>
        </div>
    </TaskBuilderPanelShell>
  );
}
