import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { PulseForgeNavSidebar } from "@/components/manager/pulse-forge/PulseForgeNavSidebar";
import { PulseForgeDashboard } from "@/components/manager/pulse-forge/PulseForgeDashboard";
import { PulseForgeBreadcrumbs } from "@/components/manager/pulse-forge/PulseForgeBreadcrumbs";
import { AutomationRecipeLibrary } from "@/components/manager/tasks/recipes/AutomationRecipeLibrary";
import { TaskBuilderView } from "@/components/manager/pulse-forge/TaskBuilderView";
import { WorkflowEditorView } from "@/components/manager/workflow/WorkflowEditorView";
import { WorkflowList } from "@/components/manager/workflow/WorkflowList";
import { createTaskProject } from "@/lib/tasks-api";
import { fetchAutomationRecipe } from "@/lib/automation-recipes-api";
import { fetchWorkflow, createWorkflow } from "@/lib/workflow/workflow-api";
import { automationPlanToWorkflowGraph } from "@/lib/workflow/workflow-migrate-from-planner";
import { persistWorkflowDefinition } from "@/lib/workflow/workflow-persist";
import {
  stripScheduleFieldsFromAgentPayload,
} from "@/lib/workflow/workflow-agent-plan";
import { stripInlineDeliveryFlags } from "@/lib/workflow/workflow-then-utils";
import { recipeToPlan } from "@/lib/automation-planner-compile";
import type { WorkflowActionConfig, WorkflowDefinition } from "@/lib/workflow/workflow-types";
import type { AutomationPlan } from "@/lib/automation-planner-types";
import { isAutomationProject } from "@/lib/task-automation-templates";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type { TaskProject } from "@/lib/tasks-types";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import type { PulseForgeNavMode } from "@/components/manager/pulse-forge/PulseForgeNavSidebar";
import {
  pulseForgeNavModeFromRoute,
  isPulseForgeWorkflowEditorOpen,
  setPulseForgeHash,
  usePulseForgeRoute,
  type PulseForgeRoute,
} from "@/lib/pulse-forge/pulse-forge-hash";
import { filterVisibleAutomationProjects } from "@/lib/pulse-forge/forge-automation-visibility";
import { useAuth } from "@/contexts/AuthContext";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";

export function PulseForgeShell(): React.ReactElement {
  const {
    activeTeam,
    members,
    taskProjects,
    projectBundles,
    refreshTasksWorkspace,
    refreshProjectBundle,
    setTaskProjects,
    setTaskTemplates,
  } = useTeam();
  const { user } = useAuth();
  const { runs, refreshRuns } = useAgentRunsContext();
  const { sites: wpSites } = useWordPressSites();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const teamId = activeTeam?.id ?? null;
  const route = usePulseForgeRoute();
  const navMode = pulseForgeNavModeFromRoute(route);

  const [recipeForRoute, setRecipeForRoute] = useState<AutomationRecipeCatalogItem | null>(null);
  const [workflowAgentEdit, setWorkflowAgentEdit] = useState<{
    workflow: WorkflowDefinition;
    nodeId: string;
  } | null>(null);
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [draftWorkflowName, setDraftWorkflowName] = useState<string>("Untitled workflow");
  const { reportError, clearErrors } = useManagerErrorLog();

  const siteOptions: WordPressSiteOption[] = useMemo(
    () => wpSites.map((s) => ({ id: s.id, name: s.name || s.siteUrl || s.id })),
    [wpSites],
  );

  const automationProjects = useMemo(() => {
    const automations = taskProjects.filter((p) =>
      isAutomationProject(p, projectBundles[p.id]?.tasks, members),
    );
    return filterVisibleAutomationProjects(automations, user?.id ?? null);
  }, [members, projectBundles, taskProjects, user?.id]);

  const workflowEditorOpen = useMemo(() => isPulseForgeWorkflowEditorOpen(route), [route]);

  const handleWorkflowError = useCallback(
    (error: string | null) => {
      if (error) reportError(error);
    },
    [reportError],
  );

  useEffect(() => {
    if (route.section !== "workflows") {
      clearErrors();
      return;
    }
    if ("view" in route) {
      return;
    }
    clearErrors();
  }, [clearErrors, route]);

  useEffect(() => {
    if (route.section !== "recipes" || !("view" in route) || route.view !== "builder") {
      setRecipeForRoute(null);
      return;
    }
    if (!teamId) {
      setRecipeForRoute(null);
      return;
    }
    let cancelled = false;
    void fetchAutomationRecipe(teamId, route.recipeKeyword).then((recipe) => {
      if (cancelled) return;
      setRecipeForRoute(recipe);
    });
    return () => {
      cancelled = true;
    };
  }, [route, teamId]);

  const workflowAgentBuilderRoute = useMemo(() => {
    if (
      route.section !== "recipes" ||
      !("view" in route) ||
      route.view !== "builder" ||
      !route.workflowId ||
      !route.workflowNodeId
    ) {
      return null;
    }
    return route;
  }, [route]);

  const workflowReturn = useMemo(() => {
    if (!workflowAgentBuilderRoute) return undefined;
    return {
      workflowId: workflowAgentBuilderRoute.workflowId,
      workflowName,
    };
  }, [workflowAgentBuilderRoute, workflowName]);

  useEffect(() => {
    if (!workflowAgentBuilderRoute || !teamId) {
      setWorkflowAgentEdit(null);
      return;
    }
    let cancelled = false;
    void fetchWorkflow(teamId, workflowAgentBuilderRoute.workflowId).then((workflow) => {
      if (cancelled || !workflow) return;
      setWorkflowAgentEdit({
        workflow,
        nodeId: workflowAgentBuilderRoute.workflowNodeId,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, workflowAgentBuilderRoute]);

  useEffect(() => {
    const workflowId =
      route.section === "workflows" && "view" in route && route.view === "edit"
        ? route.workflowId
        : route.section === "recipes" &&
            "view" in route &&
            route.view === "builder" &&
            route.workflowId
          ? route.workflowId
          : null;

    if (!workflowId || !teamId) {
      setWorkflowName(null);
      return;
    }
    let cancelled = false;
    void fetchWorkflow(teamId, workflowId).then((workflow) => {
      if (!cancelled) setWorkflowName(workflow?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [route, teamId]);

  const navigate = useCallback((next: PulseForgeRoute) => {
    setPulseForgeHash(next);
  }, []);

  const navigateSection = useCallback(
    (section: PulseForgeNavMode) => {
      navigate({ section });
    },
    [navigate],
  );

  const openRecipe = useCallback(
    (recipe: AutomationRecipeCatalogItem) => {
      navigate({ section: "recipes", view: "builder", recipeKeyword: recipe.keyword });
    },
    [navigate],
  );

  const openWorkflow = useCallback(
    (workflowId: number) => {
      navigate({ section: "workflows", view: "edit", workflowId });
    },
    [navigate],
  );

  const openCreateWorkflow = useCallback(() => {
    navigate({ section: "workflows", view: "new" });
  }, [navigate]);

  const closeEditor = useCallback(() => {
    if (route.section === "recipes") {
      navigate({ section: "recipes" });
      return;
    }
    navigate({ section: "workflows" });
  }, [navigate, route.section]);

  const closeRecipeBuilder = useCallback(() => {
    if (workflowAgentBuilderRoute) {
      navigate({
        section: "workflows",
        view: "edit",
        workflowId: workflowAgentBuilderRoute.workflowId,
      });
      return;
    }
    closeEditor();
  }, [closeEditor, navigate, workflowAgentBuilderRoute]);

  const handleSaveWorkflowAgent = useCallback(
    async (
      plan: AutomationPlan,
      executionPayload: AutomationPlan["action"]["executionPayload"],
    ): Promise<{ ok: boolean; workflow?: WorkflowDefinition; error?: string }> => {
      if (!teamId || !workflowAgentEdit) {
        return { ok: false, error: "Workflow not loaded." };
      }
      const agentPayload = stripInlineDeliveryFlags(
        stripScheduleFieldsFromAgentPayload({
          ...(executionPayload ?? {}),
          saveLocalArchive: false,
        }),
      );
      const nodes = workflowAgentEdit.workflow.nodes.map((node) => {
        if (node.id !== workflowAgentEdit.nodeId || node.kind !== "action_agent") return node;
        const config = node.config as WorkflowActionConfig;
        return {
          ...node,
          label: plan.action.title?.trim() || plan.name || node.label,
          config: {
            ...config,
            executionKind: plan.action.executionKind,
            executionPayload: agentPayload,
            title: plan.action.title ?? plan.name,
            actionBlockKeyword: plan.action.keyword?.trim() || config.actionBlockKeyword,
          },
        };
      });
      const draft = { ...workflowAgentEdit.workflow, nodes };
      const result = await persistWorkflowDefinition(teamId, draft);
      if (result.workflow) {
        setWorkflowAgentEdit({
          workflow: result.workflow,
          nodeId: workflowAgentEdit.nodeId,
        });
      }
      return { ok: result.ok, workflow: result.workflow, error: result.error };
    },
    [teamId, workflowAgentEdit],
  );

  const handleCreateFromRecipe = useCallback(
    async (payload: Parameters<typeof createTaskProject>[1]) => {
      if (!teamId) return false;
      const result = await createTaskProject(teamId, payload);
      if (result.ok && result.project) {
        setTaskProjects((prev) => [...prev, result.project!]);
        void refreshProjectBundle(result.project.id);
        return true;
      }
      return false;
    },
    [refreshProjectBundle, setTaskProjects, teamId],
  );

  const handlePlanInstallAsWorkflow = useCallback(
    async (plan: AutomationPlan) => {
      if (!teamId) return false;
      const graph = automationPlanToWorkflowGraph(plan, {
        teamId,
        siteId: activeWordPressSiteId ?? null,
      });
      const created = await createWorkflow(teamId, graph);
      if (created.workflow) {
        clearErrors();
        openWorkflow(created.workflow.id);
        return true;
      }
      reportError(created.error ?? "Could not create workflow.");
      return false;
    },
    [activeWordPressSiteId, clearErrors, openWorkflow, reportError, teamId],
  );

  const handleRecipeInstallAsWorkflow = useCallback(
    async (recipe: AutomationRecipeCatalogItem) => {
      const plan = recipeToPlan(recipe);
      await handlePlanInstallAsWorkflow(plan);
    },
    [handlePlanInstallAsWorkflow],
  );

  const handleRefreshProject = useCallback(
    (projectId: number) => {
      void refreshProjectBundle(projectId);
    },
    [refreshProjectBundle],
  );

  if (!teamId || !activeTeam) {
    return (
      <div className="flex h-full items-center justify-center bg-black px-6">
        <p className="text-base text-muted-foreground">Select a team to open Pulse Forge.</p>
      </div>
    );
  }

  return (
    <div className="neo-pulse-forge-shell flex h-full min-h-0 w-full flex-1 overflow-hidden bg-black font-sans">
      <PulseForgeNavSidebar
        navMode={navMode}
        workflowEditorOpen={workflowEditorOpen}
        onSelectMyForge={() => navigateSection("forge")}
        onSelectRecipes={() => navigateSection("recipes")}
        onSelectWorkflows={() => {
          navigateSection("workflows");
          void refreshRuns();
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {route.section === "workflows" ? null : (
          <div className="shrink-0 border-b border-white/10 bg-black">
            <PulseForgeBreadcrumbs
              route={route}
              recipeName={recipeForRoute?.name}
              workflowName={
                route.section === "workflows" && "view" in route && route.view === "new"
                  ? draftWorkflowName
                  : workflowName
              }
              className="px-4 py-3"
            />
          </div>
        )}
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {route.section === "recipes" && "view" in route && route.view === "builder" ? (
            recipeForRoute ? (
              <TaskBuilderView
                mode={workflowAgentEdit ? "workflow-agent" : "recipe"}
                teamId={teamId}
                sites={siteOptions}
                members={members}
                defaultSiteId={activeWordPressSiteId}
                recipe={recipeForRoute}
                workflowAgentEdit={workflowAgentEdit}
                workflowReturn={workflowReturn}
                onCancel={closeRecipeBuilder}
                onCreate={handleCreateFromRecipe}
                onInstallAsWorkflow={handlePlanInstallAsWorkflow}
                onSaveWorkflowAgent={handleSaveWorkflowAgent}
                onTemplatesChange={setTaskTemplates}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <p className="text-base text-muted-foreground">Agent not found.</p>
              </div>
            )
          ) : route.section === "workflows" && "view" in route && route.view === "edit" ? (
            <WorkflowEditorView
              teamId={teamId}
              workflowId={route.workflowId}
              sites={siteOptions}
              defaultSiteId={activeWordPressSiteId}
              route={route}
              onCreated={(workflowId) => openWorkflow(workflowId)}
              onCancel={closeEditor}
              onNameChange={setWorkflowName}
              onSaveErrorChange={handleWorkflowError}
            />
          ) : route.section === "workflows" && "view" in route && route.view === "new" ? (
            <WorkflowEditorView
              teamId={teamId}
              workflowId={null}
              sites={siteOptions}
              defaultSiteId={activeWordPressSiteId}
              route={route}
              onCreated={(workflowId) => openWorkflow(workflowId)}
              onCancel={closeEditor}
              onNameChange={setDraftWorkflowName}
              onSaveErrorChange={handleWorkflowError}
            />
          ) : navMode === "recipes" ? (
            <AutomationRecipeLibrary
              teamId={teamId}
              sites={siteOptions}
              defaultSiteId={activeWordPressSiteId}
              onRecipeClick={openRecipe}
              onRecipeInstall={(recipe) => void handleRecipeInstallAsWorkflow(recipe)}
              onInstalled={() => navigate({ section: "workflows" })}
            />
          ) : navMode === "workflows" ? (
            <WorkflowList
              teamId={teamId}
              sites={siteOptions}
              route={route}
              defaultSiteId={activeWordPressSiteId}
              onOpenWorkflow={openWorkflow}
              onNewWorkflow={openCreateWorkflow}
              onLoadErrorChange={handleWorkflowError}
            />
          ) : (
            <PulseForgeDashboard
              automationProjects={automationProjects}
              projectBundles={projectBundles}
              onEditAutomation={() => navigateSection("workflows")}
              onRefreshProject={handleRefreshProject}
            />
          )}
        </main>
      </div>
    </div>
  );
}
