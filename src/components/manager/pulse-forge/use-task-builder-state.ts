import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildRecipeGuideBlocks } from "@/lib/automation-recipe-copy";
import { fetchAutomationActionBlocks, fetchAutomationTriggerBlocks, type AutomationBlockCatalogItem } from "@/lib/automation-blocks-api";
import { planToTaskDefs, recipeToPlan, validateAutomationPlan } from "@/lib/automation-planner-compile";
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
import { hydrateWorkflowAgentPlanFromNodes } from "@/lib/workflow/workflow-agent-plan";
import { mergeExecutionPayloadForSave } from "@/lib/post-creator/post-creator-schedule-payload";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { resolveAutomationVisibility } from "@/lib/pulse-forge/forge-automation-visibility";
import { readCachedExecutionPayload, readCachedRecipeClientIds, readCachedRecipePlan, writeCachedRecipeClientIds, writeCachedRecipePlan } from "@/lib/forge-automation-plan-cache";
import { suggestPresetForSiteName } from "@/lib/google-drive/google-drive-folder-presets";
import { googleDriveFolderIsConfigured } from "@/lib/google-drive/resolve-google-drive-folder";
import type { AutomationJsonPanelHandle } from "@/components/manager/tasks/planner/AutomationJsonPanel";

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

export function useTaskBuilderState({
  mode,
  teamId,
  sites,
  members,
  defaultSiteId = null,
  recipe = null,
  editAutomation = null,
  editAutomationTasks = [],
  workflowAgentEdit = null,
  initialTab,
  onTabChange,
  onTemplatesChange,
}: TaskBuilderViewProps) {
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
  }, [plan, planReady, archiveSiteName]);
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

  return {
    plan, setPlan, clientId, setClientId,
    selectedClientIds, setSelectedClientIds, automationVisibility, setAutomationVisibility,
    triggerBlocks, actionBlocks, tab, saving,
    setSaving, error, setError, saveFromName,
    setSaveFromName, saveFromKeyword, setSaveFromKeyword, draftSavedAt,
    thenExecutionPayloadRef, jsonPanelRef, archiveSiteName, clientAgnosticPlan,
    validationErrors, canSaveDraft, canInstallOrCreate, submitLabel,
    selectTab, handleSaveDraft, handleTestFire, buildTaskPayloads,
    resolvePlanForPersist, editTask, handleSaveTemplate, previewBlocks,
    tabs,
  };
}
