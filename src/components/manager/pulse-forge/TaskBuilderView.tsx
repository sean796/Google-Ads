import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TaskBuilderPanelShell } from "@/components/manager/pulse-forge/TaskBuilderPanelShell";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { getPropertyListRowBlackLabelButtonClass } from "@/components/integrations/wordpress/cyberpunk-theme";
import {
  TASK_FORM_DIALOG_BUTTON_CLASS,
  TASK_FORM_FLAT_CONTROL_CLASS,
  TASK_FORM_SELECT_CONTENT_CLASS,
  TASK_FORM_SELECT_ITEM_CLASS,
  TASK_FORM_SELECT_TRIGGER_CLASS,
  TaskFormInlineRow,
} from "@/components/manager/tasks/TaskFormLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutomationWhenPanel } from "@/components/manager/tasks/planner/AutomationWhenPanel";
import { AutomationWhatPanel } from "@/components/manager/tasks/planner/AutomationWhatPanel";
import { AutomationThenPanel } from "@/components/manager/tasks/planner/AutomationThenPanel";
import { AutomationJsonPanel, type AutomationJsonPanelHandle } from "@/components/manager/tasks/planner/AutomationJsonPanel";
import { TaskBuilderArchivePanel } from "@/components/manager/tasks/planner/TaskBuilderArchivePanel";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
import { buildRecipeGuideBlocks } from "@/lib/automation-recipe-copy";
import {
  fetchAutomationActionBlocks,
  fetchAutomationTriggerBlocks,
  type AutomationBlockCatalogItem,
} from "@/lib/automation-blocks-api";
import {
  planToTaskDefs,
  recipeToPlan,
  validateAutomationPlan,
} from "@/lib/automation-planner-compile";
import { isClientAgnosticExecutionKind } from "@/lib/agent-runs-types";
import type { AutomationPlan } from "@/lib/automation-planner-types";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import { saveTemplateFromProject, testFireTaskTrigger } from "@/lib/tasks-api";
import { resolveTaskForAutomationExecute } from "@/lib/task-automation-ui";
import type { DefaultTaskCreatePayload, ForgeAutomationVisibility, TaskExecutionPayload, TaskProject, TaskTemplate, TeamTask } from "@/lib/tasks-types";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";
import { defaultTaskTriggerConfig } from "@/lib/task-trigger-types";
import type { TeamMember } from "@/lib/teams-types";
import { pulseMemberUserId } from "@/lib/chat-neo-pulse";
import { hydrateWorkflowAgentPlanFromNodes, applyActionScheduleToPlanTrigger, applyTriggerScheduleToPlan } from "@/lib/workflow/workflow-agent-plan";
import {
  mergeExecutionPayloadForSave,
} from "@/lib/post-creator/post-creator-schedule-payload";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { TaskBuilderClientSitePicker } from "@/components/manager/pulse-forge/TaskBuilderClientSitePicker";
import { FORGE_TASK_BUILDER_INFIELD_CLASS } from "@/components/manager/pulse-forge/forge-recipe-styles";
import { resolveAutomationVisibility } from "@/lib/pulse-forge/forge-automation-visibility";
import {
  readCachedExecutionPayload,
  readCachedRecipeClientIds,
  readCachedRecipePlan,
  writeCachedExecutionPayload,
  writeCachedRecipeClientIds,
  writeCachedRecipePlan,
} from "@/lib/forge-automation-plan-cache";
import { suggestPresetForSiteName } from "@/lib/google-drive/google-drive-folder-presets";
import { googleDriveFolderIsConfigured } from "@/lib/google-drive/resolve-google-drive-folder";

export type TaskBuilderMode = "recipe" | "create" | "edit" | "workflow-agent";

export type TaskBuilderTab = "setup" | "what" | "when" | "then" | "preview" | "json" | "archive" | "template";

function emptyPlan(): AutomationPlan {
  return {
    keyword: "",
    name: "",
    trigger: {
      keyword: "gsc-ctr-drop",
      kind: "gsc",
      source: "gsc",
      triggerConfig: defaultTaskTriggerConfig(),
    },
    action: {
      keyword: "content-optimizer-full",
      executionKind: "content_optimizer",
      executionPayload: { updateMode: "update", targetBucket: "posts" },
      title: "",
    },
  };
}

export type TaskBuilderViewProps = {
  mode: TaskBuilderMode;
  teamId: number | null;
  sites: WordPressSiteOption[];
  members: TeamMember[];
  defaultSiteId?: string | null;
  recipe?: AutomationRecipeCatalogItem | null;
  editAutomation?: TaskProject | null;
  editAutomationTasks?: TeamTask[];
  workflowAgentEdit?: { workflow: WorkflowDefinition; nodeId: string } | null;
  workflowReturn?: { workflowId: number; workflowName?: string | null };
  onCancel: () => void;
  onCreate: (payload: {
    keyword: string;
    title: string;
    description?: string;
    wordpressSiteId?: string | null;
    wordpressSites?: WordPressSiteOption[];
    defaultTasks?: DefaultTaskCreatePayload[];
    isAutomation: boolean;
    sourceTemplateKeyword?: string;
    templateKeyword?: string;
    automationVisibility?: ForgeAutomationVisibility;
  }) => Promise<boolean>;
  onUpdate?: (
    projectId: number,
    payload: {
      keyword: string;
      title: string;
      description?: string;
      wordpressSiteId?: string | null;
      automationVisibility?: ForgeAutomationVisibility;
    },
  ) => Promise<boolean>;
  onUpdateTask?: (
    taskId: number,
    payload: DefaultTaskCreatePayload,
  ) => Promise<{ ok: boolean; task?: TeamTask }>;
  onSaveWorkflowAgent?: (
    plan: AutomationPlan,
    executionPayload: TaskExecutionPayload,
  ) => Promise<{ ok: boolean; workflow?: WorkflowDefinition; error?: string }>;
  onInstallAsWorkflow?: (plan: AutomationPlan) => Promise<boolean>;
  onTemplatesChange?: (templates: TaskTemplate[]) => void;
  onTaskExecuted?: () => void;
  initialTab?: TaskBuilderTab;
  onTabChange?: (tab: TaskBuilderTab) => void;
};

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
  const [plan, setPlan] = useState<AutomationPlan>(emptyPlan);
  const [clientId, setClientId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(() => new Set());
  const [automationVisibility, setAutomationVisibility] = useState<ForgeAutomationVisibility>("private");
  const [triggerBlocks, setTriggerBlocks] = useState<AutomationBlockCatalogItem[]>([]);
  const [actionBlocks, setActionBlocks] = useState<AutomationBlockCatalogItem[]>([]);
  const [tab, setTab] = useState<TaskBuilderTab>("setup");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveFromName, setSaveFromName] = useState("");
  const [saveFromKeyword, setSaveFromKeyword] = useState("");
  const [planReady, setPlanReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const thenExecutionPayloadRef = useRef<TaskExecutionPayload | null>(null);
  const jsonPanelRef = useRef<AutomationJsonPanelHandle>(null);
  const planInitializedScopeRef = useRef<string | null>(null);

  const pulseUserId = useMemo(() => pulseMemberUserId(members), [members]);
  const editTask = editAutomationTasks[0] ?? null;
  const archiveSiteName = useMemo(() => {
    const siteId =
      clientId.trim() ||
      (selectedClientIds.size > 0 ? [...selectedClientIds][0] : "") ||
      editAutomation?.wordpressSiteId?.trim() ||
      "";
    if (!siteId) return "";
    return sites.find((site) => site.id === siteId)?.name ?? "";
  }, [clientId, editAutomation?.wordpressSiteId, selectedClientIds, sites]);
  const clientAgnosticPlan = isClientAgnosticExecutionKind(
    plan.action.executionKind,
    plan.action.executionPayload,
  );
  const validationErrors = useMemo(() => {
    const errors = planReady ? validateAutomationPlan(plan) : [];
    const payload = mergeExecutionPayloadForSave(
      plan.action.executionPayload,
      thenExecutionPayloadRef.current,
    );
    if (payload.saveToGoogleDrive === true && !googleDriveFolderIsConfigured(payload, archiveSiteName)) {
      errors.push("Google Drive folder path is required.");
    }
    return errors;
  }, [plan, planReady]);
  const canSaveDraft = planReady && Boolean(plan.name.trim()) && validationErrors.length === 0;
  const canInstallOrCreate =
    canSaveDraft &&
    (mode !== "recipe" && mode !== "create"
      ? true
      : clientAgnosticPlan || selectedClientIds.size > 0);

  const submitLabel =
    mode === "recipe"
      ? "Install"
      : mode === "workflow-agent" || mode === "edit"
        ? "Save"
        : "Create";

  const previewBlocks = useMemo(() => {
    if (!recipe) return [];
    return buildRecipeGuideBlocks({
      ...recipe,
      defaultTasks: planToTaskDefs(plan),
    });
  }, [plan, recipe]);

  const tabs = useMemo((): { id: TaskBuilderTab; label: string }[] => {
    const base: { id: TaskBuilderTab; label: string }[] = [
      { id: "setup", label: "Setup" },
      { id: "what", label: "What" },
    ];
    if (mode !== "workflow-agent") {
      base.push({ id: "when", label: "When" });
    }
    if (mode !== "workflow-agent") {
      base.push({ id: "then", label: "Then" });
    }
    if (mode === "recipe" && recipe) {
      base.push({ id: "preview", label: "Preview" });
    }
    base.push({ id: "json", label: "JSON" });
    base.push({ id: "archive", label: "Archive" });
    if (mode === "edit") {
      base.push({ id: "template", label: "Template" });
    }
    return base;
  }, [mode, recipe]);

  const builderScopeKey =
    mode === "workflow-agent" && workflowAgentEdit && recipe
      ? `workflow-agent:${workflowAgentEdit.workflow.id}:${workflowAgentEdit.nodeId}:${recipe.keyword}`
      : mode === "edit" && editAutomation
      ? `edit:${editAutomation.id}`
      : mode === "recipe" && recipe
        ? `recipe:${recipe.keyword}`
        : mode === "create"
          ? "create"
          : "none";

  useEffect(() => {
    if (mode === "workflow-agent" && tab === "when") {
      setTab("what");
    }
  }, [mode, tab]);

  useEffect(() => {
    if (!teamId) return;
    void fetchAutomationTriggerBlocks(teamId).then(setTriggerBlocks);
    void fetchAutomationActionBlocks(teamId).then(setActionBlocks);
  }, [teamId]);

  useEffect(() => {
    if (planInitializedScopeRef.current === builderScopeKey) {
      setPlanReady(true);
      return;
    }
    setPlanReady(false);

    if (mode === "recipe" && recipe) {
      const base = recipeToPlan(recipe);
      const cached = teamId ? readCachedRecipePlan(teamId, recipe.keyword) : null;
      const next = cached
        ? {
            ...cached,
            keyword: cached.keyword?.trim() || base.keyword,
            name: cached.name?.trim() || base.name,
            description: cached.description ?? base.description,
            category: cached.category ?? base.category,
            prerequisites: cached.prerequisites ?? base.prerequisites,
          }
        : base;
      planInitializedScopeRef.current = builderScopeKey;
      setPlan(next);
      thenExecutionPayloadRef.current = next.action.executionPayload ?? null;
      const cachedClientIds = teamId ? readCachedRecipeClientIds(teamId, recipe.keyword) : [];
      setSelectedClientIds(
        cachedClientIds.length > 0
          ? new Set(cachedClientIds)
          : defaultSiteId
            ? new Set([defaultSiteId])
            : new Set(),
      );
      setAutomationVisibility("private");
      setError(null);
      setPlanReady(true);
      return;
    }
    if (mode === "workflow-agent" && recipe && workflowAgentEdit) {
      const next = hydrateWorkflowAgentPlanFromNodes({
        recipe,
        workflow: workflowAgentEdit.workflow,
        nodeId: workflowAgentEdit.nodeId,
      });
      planInitializedScopeRef.current = builderScopeKey;
      setPlan(next);
      thenExecutionPayloadRef.current = next.action.executionPayload ?? null;
      setSelectedClientIds(new Set());
      setAutomationVisibility("private");
      setError(null);
      setPlanReady(true);
      return;
    }
    if (mode === "edit" && editAutomation) {
      if (!editTask) return;
      const resolvedTask = resolveTaskForAutomationExecute(editTask, editAutomation);
      const cachedPayload = readCachedExecutionPayload(editAutomation.id);
      const executionPayload = mergeExecutionPayloadForSave(
        resolvedTask.executionPayload,
        cachedPayload,
      );
      const base = recipeToPlan({
        keyword: editAutomation.keyword,
        name: editAutomation.title,
        description: editAutomation.description ?? "",
        isAutomation: true,
        category: "reactive",
        verticals: [],
        tags: [],
        prerequisites: [],
        filters: {},
        defaultTasks: [
          {
            keyword: resolvedTask.keyword,
            title: resolvedTask.title,
            scheduleMode: resolvedTask.scheduleMode,
            triggerConfig: resolvedTask.triggerConfig,
            recurrenceRule: resolvedTask.recurrenceRule,
            dueDate: resolvedTask.dueDate,
            dueTime: resolvedTask.dueTime,
            executionKind: resolvedTask.executionKind,
            executionPayload,
          },
        ],
        triggerBlock: undefined,
        actionBlock: undefined,
      });
      planInitializedScopeRef.current = builderScopeKey;
      const nextPlan = { ...base, keyword: editAutomation.keyword, name: editAutomation.title };
      setPlan(nextPlan);
      thenExecutionPayloadRef.current = nextPlan.action.executionPayload ?? null;
      setClientId(editAutomation.wordpressSiteId ?? "");
      setAutomationVisibility(resolveAutomationVisibility(editAutomation));
      setSaveFromName(editAutomation.title);
      setError(null);
      setPlanReady(true);
      return;
    }
    if (mode === "create") {
      planInitializedScopeRef.current = builderScopeKey;
      const next = emptyPlan();
      setPlan(next);
      thenExecutionPayloadRef.current = next.action.executionPayload ?? null;
      setSelectedClientIds(defaultSiteId ? new Set([defaultSiteId]) : new Set());
      setAutomationVisibility("private");
      setError(null);
      setPlanReady(true);
    }
  }, [builderScopeKey, defaultSiteId, editAutomation, editTask, mode, recipe, teamId, workflowAgentEdit]);

  const appliedBuilderScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (appliedBuilderScopeRef.current !== builderScopeKey) {
      appliedBuilderScopeRef.current = builderScopeKey;
      setTab(initialTab ?? "setup");
      return;
    }
    if (initialTab) {
      setTab(initialTab);
    }
  }, [builderScopeKey, initialTab]);

  const mergeThenPayloadIntoPlan = useCallback((sourcePlan: AutomationPlan): AutomationPlan => {
    const mergedPayload = mergeExecutionPayloadForSave(
      sourcePlan.action.executionPayload,
      thenExecutionPayloadRef.current,
    );
    thenExecutionPayloadRef.current = mergedPayload;
    return {
      ...sourcePlan,
      action: { ...sourcePlan.action, executionPayload: mergedPayload },
    };
  }, []);

  const selectTab = useCallback(
    (next: TaskBuilderTab) => {
      if (mode !== "workflow-agent" && (next === "json" || tab === "then")) {
        setPlan((current) => mergeThenPayloadIntoPlan(current));
      }
      setTab(next);
      onTabChange?.(next);
    },
    [mergeThenPayloadIntoPlan, mode, onTabChange, tab],
  );

  useEffect(() => {
    if (mode === "workflow-agent" || !archiveSiteName.trim()) return;
    const suggested = suggestPresetForSiteName(archiveSiteName);
    if (!suggested) return;
    const current = mergeExecutionPayloadForSave(
      plan.action.executionPayload,
      thenExecutionPayloadRef.current,
    );
    if (current.saveToGoogleDrive !== true || String(current.googleDriveFolderId ?? "").trim()) {
      return;
    }
    const mergedPayload = mergeExecutionPayloadForSave(current, {
      googleDrivePresetKey: suggested.id,
      googleDriveFolderId: suggested.folderId,
      googleDriveFolderLabel: suggested.label,
    });
    thenExecutionPayloadRef.current = mergedPayload;
    setPlan((currentPlan) => ({
      ...currentPlan,
      action: { ...currentPlan.action, executionPayload: mergedPayload },
    }));
  }, [archiveSiteName, mode, plan.action.executionPayload]);

  const buildTaskPayloads = useCallback(
    (sourcePlan: AutomationPlan): DefaultTaskCreatePayload[] => {
      const executionPayload = mergeExecutionPayloadForSave(
        sourcePlan.action.executionPayload,
        thenExecutionPayloadRef.current,
      );
      const planForSave = {
        ...sourcePlan,
        action: { ...sourcePlan.action, executionPayload },
      };
      return planToTaskDefs(planForSave).map((task) => ({
        ...task,
        assigneeIds: pulseUserId != null ? [pulseUserId] : undefined,
      }));
    },
    [pulseUserId],
  );

  const taskPayloads = useCallback(
    (): DefaultTaskCreatePayload[] => buildTaskPayloads(plan),
    [buildTaskPayloads, plan],
  );

  const resolvePlanForPersist = useCallback((): AutomationPlan | null => {
    const trimmedName = plan.name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return null;
    }
    let planForSave = plan;
    const flushedPlan = jsonPanelRef.current?.flushPendingPlan();
    if (flushedPlan === null) {
      setError("Fix JSON errors before saving.");
      return null;
    }
    if (flushedPlan) {
      planForSave = flushedPlan;
      setPlan(flushedPlan);
      thenExecutionPayloadRef.current = flushedPlan.action.executionPayload ?? null;
    }
    if (mode !== "workflow-agent") {
      planForSave = mergeThenPayloadIntoPlan(planForSave);
    }
    setPlan(planForSave);
    return planForSave;
  }, [mergeThenPayloadIntoPlan, mode, plan]);

  const handleSaveDraft = useCallback(async () => {
    if (!canSaveDraft || !teamId) return;
    setSaving(true);
    setError(null);
    const planForSave = resolvePlanForPersist();
    if (!planForSave) {
      setSaving(false);
      return;
    }
    if (mode === "recipe" && recipe) {
      writeCachedRecipePlan(teamId, recipe.keyword, planForSave);
      writeCachedRecipeClientIds(teamId, recipe.keyword, [...selectedClientIds]);
      setDraftSavedAt(Date.now());
    } else if (mode === "create") {
      writeCachedRecipePlan(teamId, "create", planForSave);
      writeCachedRecipeClientIds(teamId, "create", [...selectedClientIds]);
      setDraftSavedAt(Date.now());
    }
    setSaving(false);
  }, [canSaveDraft, mode, recipe, resolvePlanForPersist, selectedClientIds, teamId]);

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
  ]);

  const handleTestFire = useCallback(async () => {
    if (!teamId || !editTask || plan.trigger.kind !== "gsc") return;
    setSaving(true);
    await testFireTaskTrigger(teamId, editTask.id);
    setSaving(false);
  }, [editTask, plan.trigger.kind, teamId]);

  const handleSaveTemplate = useCallback(async () => {
    if (!teamId || !editAutomation) return;
    const trimmedName = saveFromName.trim();
    if (!trimmedName) {
      setError("Template name is required.");
      return;
    }
    setSaving(true);
    const result = await saveTemplateFromProject(teamId, {
      projectId: editAutomation.id,
      name: trimmedName,
      keyword: saveFromKeyword.trim() || undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save template.");
      return;
    }
    if (result.templates) onTemplatesChange?.(result.templates);
  }, [editAutomation, onTemplatesChange, saveFromKeyword, saveFromName, teamId]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black font-sans">
      <nav className="flex shrink-0 flex-wrap items-center gap-1 px-4 py-3">
        {workflowReturn ? (
          <button
            type="button"
            className="mr-1 flex shrink-0 items-center gap-1.5 bg-transparent px-2 py-2 text-base text-muted-foreground hover:text-white"
            disabled={saving}
            onClick={onCancel}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back to workflow
          </button>
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
              variant="outline"
              className={getPropertyListRowBlackLabelButtonClass()}
              disabled={saving}
              onClick={() => void handleTestFire()}
            >
              Test fire
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={getPropertyListRowBlackLabelButtonClass()}
            disabled={saving}
            onClick={onCancel}
          >
            {workflowReturn ? "Back to workflow" : "Cancel"}
          </Button>
          {mode === "recipe" || mode === "create" ? (
            <Button
              type="button"
              variant="outline"
              className={cn(getPropertyListRowBlackLabelButtonClass(), "min-w-[5rem] tabular-nums")}
              disabled={saving || !canSaveDraft}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? "Save…" : draftSavedAt && Date.now() - draftSavedAt < 3000 ? "Saved" : "Save"}
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-10 min-w-[5.5rem] rounded-none bg-[#77AA00] text-base tabular-nums text-black hover:bg-[#77AA00]/90"
            disabled={saving || !canInstallOrCreate}
            onClick={() => void handleSubmit()}
          >
            {saving ? `${submitLabel}…` : submitLabel}
          </Button>
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
        {tab === "setup" ? (
          <TaskBuilderPanelShell>
            <div className="flex h-full min-h-0 flex-col gap-4">
              {mode === "workflow-agent" ? (
                <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                  <span className="shrink-0 text-base text-white">Name</span>
                  <Input
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
                    className={TASK_FORM_FLAT_CONTROL_CLASS}
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
                    <Input
                      value={plan.keyword}
                      onChange={(e) => setPlan((p) => ({ ...p, keyword: e.target.value }))}
                      placeholder="automation-keyword"
                      disabled={saving}
                      className={TASK_FORM_FLAT_CONTROL_CLASS}
                    />
                  </div>
                  <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                    <span className="shrink-0 text-base text-white">Name</span>
                    <Input
                      value={plan.name}
                      onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Automation name"
                      disabled={saving}
                      className={TASK_FORM_FLAT_CONTROL_CLASS}
                    />
                  </div>
                </div>
              )}
              {sites.length > 0 && mode !== "workflow-agent" && !clientAgnosticPlan ? (
                mode === "edit" ? (
                  <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-2">
                    <div className={FORGE_TASK_BUILDER_INFIELD_CLASS}>
                      <span className="shrink-0 text-base text-white">Client site</span>
                      <Select
                        value={clientId || "__empty__"}
                        onValueChange={(v) => setClientId(v === "__empty__" ? "" : v)}
                        disabled={saving}
                      >
                        <SelectTrigger className={TASK_FORM_SELECT_TRIGGER_CLASS}>
                          <SelectValue placeholder="Client site" />
                        </SelectTrigger>
                        <SelectContent className={TASK_FORM_SELECT_CONTENT_CLASS}>
                          {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id} className={TASK_FORM_SELECT_ITEM_CLASS}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <Input
                    value={saveFromName}
                    onChange={(e) => setSaveFromName(e.target.value)}
                    placeholder="Team template name"
                    disabled={saving}
                    className={TASK_FORM_FLAT_CONTROL_CLASS}
                  />
                </TaskFormInlineRow>
                <TaskFormInlineRow label="Template keyword">
                  <Input
                    value={saveFromKeyword}
                    onChange={(e) => setSaveFromKeyword(e.target.value)}
                    placeholder="template-keyword"
                    disabled={saving}
                    className={TASK_FORM_FLAT_CONTROL_CLASS}
                  />
                </TaskFormInlineRow>
                <TaskFormInlineRow label="Save">
                  <Button
                    type="button"
                    className={cn("h-9 w-full max-w-xs text-base", TASK_FORM_DIALOG_BUTTON_CLASS)}
                    disabled={saving}
                    onClick={() => void handleSaveTemplate()}
                  >
                    Save template
                  </Button>
                </TaskFormInlineRow>
              </div>
            </div>
          </TaskBuilderPanelShell>
        ) : null}
      </div>

      <div className="min-h-6 shrink-0 px-4 pb-3">
        {error ? (
          <p className="truncate text-base text-red-400">{error}</p>
        ) : validationErrors.length > 0 ? (
          <p className="truncate text-base text-red-400">{validationErrors[0]}</p>
        ) : null}
      </div>
    </div>
  );
}
