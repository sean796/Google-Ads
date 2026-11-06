import React, { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { TaskBuilderPanelShell } from "@/components/manager/pulse-forge/TaskBuilderPanelShell";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { AutomationWhenPanel } from "@/components/manager/tasks/planner/AutomationWhenPanel";
import { AutomationWhatPanel } from "@/components/manager/tasks/planner/AutomationWhatPanel";
import { AutomationThenPanel } from "@/components/manager/tasks/planner/AutomationThenPanel";
import { AutomationJsonPanel } from "@/components/manager/tasks/planner/AutomationJsonPanel";
import { TaskBuilderArchivePanel } from "@/components/manager/tasks/planner/TaskBuilderArchivePanel";
import { TaskBuilderSetupTab, TaskBuilderTemplateTab } from "@/components/manager/pulse-forge/TaskBuilderSetupAndTemplateTabs";
import { useTaskBuilderState, type TaskBuilderViewProps } from "@/components/manager/pulse-forge/use-task-builder-state";
import { hydrateWorkflowAgentPlanFromNodes, applyActionScheduleToPlanTrigger, applyTriggerScheduleToPlan } from "@/lib/workflow/workflow-agent-plan";
import { mergeExecutionPayloadForSave } from "@/lib/post-creator/post-creator-schedule-payload";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { writeCachedExecutionPayload, writeCachedRecipeClientIds, writeCachedRecipePlan } from "@/lib/forge-automation-plan-cache";
import { Button } from "@/ui";

export function TaskBuilderView({
  mode,
  teamId,
  sites,
  members,
  defaultSiteId = null,
  recipe = null,
  editAutomation = null,
  editAutomationTasks = [],
  workflowAgentEdit = null,
  workflowReturn,
  onCancel,
  onCreate,
  onUpdate,
  onUpdateTask,
  onSaveWorkflowAgent,
  onInstallAsWorkflow,
  onTemplatesChange,
  onTaskExecuted,
  initialTab,
  onTabChange,
}: TaskBuilderViewProps): React.ReactElement {
  const {
    plan,
    setPlan,
    clientId,
    setClientId,
    selectedClientIds,
    setSelectedClientIds,
    automationVisibility,
    setAutomationVisibility,
    triggerBlocks,
    actionBlocks,
    tab,
    saving,
    setSaving,
    error,
    setError,
    saveFromName,
    setSaveFromName,
    saveFromKeyword,
    setSaveFromKeyword,
    draftSavedAt,
    thenExecutionPayloadRef,
    jsonPanelRef,
    archiveSiteName,
    clientAgnosticPlan,
    validationErrors,
    canSaveDraft,
    canInstallOrCreate,
    submitLabel,
    selectTab,
    handleSaveDraft,
    handleTestFire,
    buildTaskPayloads,
    resolvePlanForPersist,
    editTask,
    handleSaveTemplate,
    tabs,
    previewBlocks,
  } = useTaskBuilderState({
    mode, teamId, sites, members, defaultSiteId, recipe,
    editAutomation, editAutomationTasks, workflowAgentEdit, workflowReturn, onCancel, onCreate,
    onUpdate, onUpdateTask, onSaveWorkflowAgent, onInstallAsWorkflow, onTemplatesChange, onTaskExecuted,
    initialTab, onTabChange,
  });

  const handleSubmit = useCallback(async () => {
    if (!canInstallOrCreate) return;
    const trimmedName = plan.name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if ((mode === "recipe" || mode === "create") && !clientAgnosticPlan && selectedClientIds.size === 0) {
      setError("Select at least one client site.");
      return;
    }
    setSaving(true);
    setError(null);
    let planForSave = resolvePlanForPersist();
    if (!planForSave) {
      setSaving(false);
      return;
    }
    const mergedPayload = planForSave.action.executionPayload ?? {};
    const baseKeyword = planForSave.keyword.trim() || trimmedName.toLowerCase().replace(/\s+/g, "-");
    let ok = false;
    if (mode === "workflow-agent" && onSaveWorkflowAgent) {
      const saveResult = await onSaveWorkflowAgent(planForSave, mergedPayload);
      ok = saveResult.ok;
      if (ok && saveResult.workflow && recipe && workflowAgentEdit) {
        const hydrated = hydrateWorkflowAgentPlanFromNodes({
          recipe,
          workflow: saveResult.workflow,
          nodeId: workflowAgentEdit.nodeId,
        });
        planForSave = hydrated;
        setPlan(hydrated);
        thenExecutionPayloadRef.current = hydrated.action.executionPayload ?? null;
      }
      if (!ok) setError(saveResult.error ?? "Could not save agent.");
    } else if (mode === "edit" && editAutomation && onUpdate) {
      const projectPayload = {
        keyword: baseKeyword,
        title: trimmedName,
        description: planForSave.description?.trim() || undefined,
        wordpressSiteId: clientId.trim() || null,
        automationVisibility,
      };
      const taskPayload = buildTaskPayloads(planForSave)[0]!;
      if (editTask && onUpdateTask) {
        const taskResult = await onUpdateTask(editTask.id, taskPayload);
        ok = taskResult.ok;
      } else {
        ok = true;
      }
      if (ok) {
        ok = await onUpdate(editAutomation.id, projectPayload);
      }
      if (ok) {
        const savedPayload = taskPayload.executionPayload ?? planForSave.action.executionPayload;
        if (savedPayload) {
          const keptPlan = {
            ...planForSave,
            action: { ...planForSave.action, executionPayload: savedPayload },
          };
          planForSave = keptPlan;
          setPlan(keptPlan);
          thenExecutionPayloadRef.current = savedPayload;
          if (editAutomation?.id) {
            writeCachedExecutionPayload(editAutomation.id, savedPayload);
          }
        }
      }
      if (!ok) setError("Could not save automation.");
    } else if (mode === "recipe" && clientAgnosticPlan && onInstallAsWorkflow) {
      ok = await onInstallAsWorkflow(planForSave);
      if (!ok) setError("Could not create workflow.");
    } else {
      const siteIds = clientAgnosticPlan ? [""] : [...selectedClientIds];
      const multiSite = !clientAgnosticPlan && siteIds.length > 1;
      ok = true;
      for (const siteId of siteIds) {
        const site = sites.find((entry) => entry.id === siteId);
        const siteName = site?.name ?? "";
        const keyword = multiSite ? `${baseKeyword}-${siteId}` : baseKeyword;
        const title = multiSite && siteName ? `${trimmedName} - ${siteName}` : trimmedName;
        const created = await onCreate({
          keyword,
          title,
          description: planForSave.description?.trim() || undefined,
          wordpressSiteId: siteId.trim() || null,
          wordpressSites: sites,
          isAutomation: true,
          sourceTemplateKeyword: mode === "recipe" && recipe ? recipe.keyword : undefined,
          defaultTasks: buildTaskPayloads(planForSave),
          automationVisibility,
        });
        if (!created) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        setError(
          mode === "recipe"
            ? "Could not install automation for all selected sites."
            : "Could not create automation for all selected sites.",
        );
      } else if (mode === "recipe" && recipe && teamId) {
        writeCachedRecipePlan(teamId, recipe.keyword, planForSave);
        writeCachedRecipeClientIds(teamId, recipe.keyword, [...selectedClientIds]);
      }
    }
    setSaving(false);
    if (!ok) return;
    if (mode === "edit" || mode === "workflow-agent") {
      return;
    }
    onCancel();
  }, [
    automationVisibility,
    buildTaskPayloads,
    canInstallOrCreate,
    clientId,
    editAutomation,
    editTask,
    mode,
    onCancel,
    onInstallAsWorkflow,
    onCreate,
    onSaveWorkflowAgent,
    onUpdate,
    onUpdateTask,
    plan,
    recipe,
    resolvePlanForPersist,
    clientAgnosticPlan,
    selectedClientIds,
    sites,
    teamId,
    workflowAgentEdit,
    setError, setPlan, setSaving, thenExecutionPayloadRef,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black font-sans">
      <nav className="flex shrink-0 flex-wrap items-center gap-1 px-4 py-3">
        {workflowReturn ? (
          <Button
            variant="quiet"
            disabled={saving}
            onClick={onCancel}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back to workflow
          </Button>
        ) : null}
        {tabs.map(({ id, label }) => (
          <WorkspacePill
            key={id}
            label={label}
            square
            tone="forge"
            active={tab === id}
            onClick={() => selectTab(id)}
          />
        ))}
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {mode === "edit" && plan.trigger.kind === "gsc" && editTask ? (
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleTestFire()}
            >
              Test fire
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={saving}
            onClick={onCancel}
          >
            {workflowReturn ? "Back to workflow" : "Cancel"}
          </Button>
          {mode === "recipe" || mode === "create" ? (
            <Button
              type="button"
              disabled={saving || !canSaveDraft}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? "Save…" : draftSavedAt && Date.now() - draftSavedAt < 3000 ? "Saved" : "Save"}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={saving || !canInstallOrCreate}
            onClick={() => void handleSubmit()}
          >
            {saving ? `${submitLabel}…` : submitLabel}
          </Button>
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
        {tab === "setup" ? (
          <TaskBuilderSetupTab
            mode={mode}
            plan={plan}
            setPlan={setPlan}
            saving={saving}
            automationVisibility={automationVisibility}
            setAutomationVisibility={setAutomationVisibility}
            sites={sites}
            clientAgnosticPlan={clientAgnosticPlan}
            clientId={clientId}
            setClientId={setClientId}
            selectedClientIds={selectedClientIds}
            setSelectedClientIds={setSelectedClientIds}
          />
        ) : null}

        {tab === "what" ? (
          <TaskBuilderPanelShell>
            <AutomationWhatPanel
              action={plan.action}
              actionBlocks={actionBlocks}
              clientSiteId={(() => {
                if (mode === "workflow-agent" && workflowAgentEdit) {
                  const fromWorkflow = workflowAgentEdit.workflow.wordpressSiteId?.trim();
                  if (fromWorkflow) return fromWorkflow;
                  const clientNode = workflowAgentEdit.workflow.nodes.find(
                    (node) => node.kind === "workflow_client",
                  );
                  const fromClient = (
                    clientNode?.config as { siteIds?: string[] } | undefined
                  )?.siteIds?.[0]?.trim();
                  if (fromClient) return fromClient;
                }
                return (
                  clientId.trim() ||
                  (selectedClientIds.size > 0 ? [...selectedClientIds][0] : "") ||
                  editAutomation?.wordpressSiteId?.trim() ||
                  undefined
                );
              })()}
              disabled={saving}
              pillTone="forge"
              onChange={(action) => {
                setPlan((p) => {
                  const mergedPayload = mergeExecutionPayloadForSave(
                    p.action.executionPayload,
                    thenExecutionPayloadRef.current,
                    action.executionPayload,
                  );
                  thenExecutionPayloadRef.current = mergedPayload;
                  return {
                    ...p,
                    action: { ...action, executionPayload: mergedPayload },
                  };
                });
              }}
            />
          </TaskBuilderPanelShell>
        ) : null}

        {tab === "when" && mode !== "workflow-agent" ? (
          <TaskBuilderPanelShell>
            <AutomationWhenPanel
              trigger={plan.trigger}
              triggerBlocks={triggerBlocks}
              disabled={saving}
              onChange={(trigger) =>
                setPlan((current) => {
                  const withTrigger = { ...current, trigger };
                  const synced = applyTriggerScheduleToPlan(withTrigger);
                  thenExecutionPayloadRef.current = synced.action.executionPayload ?? null;
                  return synced;
                })
              }
            />
          </TaskBuilderPanelShell>
        ) : null}

        {tab === "then" && mode !== "workflow-agent" ? (
          <TaskBuilderPanelShell>
            <AutomationThenPanel
              action={plan.action}
              disabled={saving}
              siteName={archiveSiteName}
              onChange={(patch) => {
                if (patch.executionPayload) {
                  thenExecutionPayloadRef.current = patch.executionPayload;
                  if (editAutomation?.id) {
                    writeCachedExecutionPayload(editAutomation.id, patch.executionPayload);
                  }
                }
                setPlan((current) => {
                  const next = { ...current, action: { ...current.action, ...patch } };
                  if (!patch.executionPayload) return next;
                  const synced = applyActionScheduleToPlanTrigger(next);
                  thenExecutionPayloadRef.current = synced.action.executionPayload ?? null;
                  return synced;
                });
              }}
            />
          </TaskBuilderPanelShell>
        ) : null}

        {tab === "preview" ? (
          <TaskBuilderPanelShell label="Preview">
            {previewBlocks.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {previewBlocks.flatMap((block) =>
                  block.steps.map((line) => (
                    <li key={`${block.title ?? "step"}-${line}`} className="text-base text-muted-foreground">
                      {line}
                    </li>
                  )),
                )}
              </ul>
            ) : (
              <p className="text-base text-muted-foreground">Preview appears for recipe installs.</p>
            )}
          </TaskBuilderPanelShell>
        ) : null}

        {tab === "json" ? (
          <TaskBuilderPanelShell>
            <AutomationJsonPanel
              ref={jsonPanelRef}
              plan={plan}
              disabled={saving}
              onPlanChange={(nextPlan) => {
                thenExecutionPayloadRef.current = nextPlan.action.executionPayload ?? null;
                setPlan(nextPlan);
              }}
            />
          </TaskBuilderPanelShell>
        ) : null}

        {tab === "archive" ? (
          <TaskBuilderPanelShell>
            <TaskBuilderArchivePanel
              teamId={teamId}
              taskId={editTask?.id ?? null}
              saveLocalArchive={effectiveSaveLocalArchive(
                plan.action.executionKind,
                plan.action.executionPayload,
              )}
              executionPayload={plan.action.executionPayload}
              executionKind={plan.action.executionKind}
              automationTitle={plan.name || plan.action.title || editAutomation?.title}
              siteName={archiveSiteName}
              disabled={saving}
            />
          </TaskBuilderPanelShell>
        ) : null}

        {tab === "template" && mode === "edit" ? (
          <TaskBuilderTemplateTab
            teamId={teamId}
            editAutomation={editAutomation}
            editTask={editTask}
            saving={saving}
            onTaskExecuted={onTaskExecuted}
            handleSaveTemplate={handleSaveTemplate}
            saveFromName={saveFromName}
            setSaveFromName={setSaveFromName}
            saveFromKeyword={saveFromKeyword}
            setSaveFromKeyword={setSaveFromKeyword}
          />
        ) : null}
      </div>

      <div className="min-h-6 shrink-0 px-4 pb-3">
        {error ? (
          <p className="break-words text-base text-ui-danger-hover">{error}</p>
        ) : validationErrors.length > 0 ? (
          <p className="break-words text-base text-ui-danger-hover">{validationErrors[0]}</p>
        ) : null}
      </div>
    </div>
  );
}
