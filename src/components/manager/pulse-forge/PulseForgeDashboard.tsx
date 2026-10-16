import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import type { TaskProjectBundle } from "@/contexts/TeamContext";
import {
  activeForgeAgentRuns,
  primaryAutomationTask,
} from "@/lib/pulse-forge/forge-dashboard-runs";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import type { TaskBuilderTab } from "@/components/manager/pulse-forge/TaskBuilderView";
import { ForgeDashboardRow } from "@/components/manager/pulse-forge/ForgeDashboardRow";
import { ForgeDashboardHeroCard } from "@/components/manager/pulse-forge/ForgeDashboardHeroCard";
import { ForgeDashboardPanel } from "@/components/manager/pulse-forge/ForgeDashboardPanel";
import { ForgeDashboardUsageChart } from "@/components/manager/pulse-forge/ForgeDashboardUsageChart";
import {
  FORGE_DASHBOARD_PAGE_CLASS,
  FORGE_DASHBOARD_SECTION_LABEL_CLASS,
  FORGE_PAGE_TITLE_CLASS,
} from "@/components/manager/pulse-forge/forge-dashboard-styles";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { FORGE_DASHBOARD_DEMO_SNAPSHOT } from "@/lib/pulse-forge/forge-dashboard-demo-data";
import {
  agentChartLabels,
  buildForgeDashboardLiveStats,
} from "@/lib/pulse-forge/forge-dashboard-stats";
import {
  readForgeDashboardViewMode,
  writeForgeDashboardViewMode,
  type ForgeDashboardViewMode,
} from "@/lib/pulse-forge/forge-dashboard-view-mode";
import { cn } from "@/lib/utils";
import type { TaskProject } from "@/lib/tasks-types";

const DASHBOARD_PANEL_ROW_SLOTS = 5;

export type PulseForgeDashboardProps = {
  automationProjects: TaskProject[];
  projectBundles: Record<number, TaskProjectBundle>;
  onEditAutomation: (
    project: TaskProject,
    options?: { initialTab?: TaskBuilderTab },
  ) => void;
  onRefreshProject: (projectId: number) => void;
};

const VIEW_MODES: { id: ForgeDashboardViewMode; label: string }[] = [
  { id: "demo", label: "Demo" },
  { id: "live", label: "Live" },
];

export function PulseForgeDashboard({
  automationProjects,
  projectBundles,
  onEditAutomation,
  onRefreshProject,
}: PulseForgeDashboardProps): React.ReactElement {
  const { runs, refreshRuns } = useAgentRunsContext();
  const [viewMode, setViewMode] = useState<ForgeDashboardViewMode>(() =>
    readForgeDashboardViewMode(),
  );

  const setMode = useCallback((mode: ForgeDashboardViewMode) => {
    setViewMode(mode);
    writeForgeDashboardViewMode(mode);
  }, []);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  useEffect(() => {
    if (viewMode !== "live") return;
    const automationProjectIds = new Set(automationProjects.map((project) => project.id));
    const prefetchProjectIds = new Set<number>();
    for (const run of runs) {
      if (isAgentRunTerminal(run.status)) continue;
      const projectId = run.context?.projectId;
      if (projectId != null && automationProjectIds.has(projectId)) {
        prefetchProjectIds.add(projectId);
      }
    }
    for (const projectId of prefetchProjectIds) {
      if (!projectBundles[projectId]) {
        onRefreshProject(projectId);
      }
    }
  }, [automationProjects, onRefreshProject, projectBundles, runs, viewMode]);

  const activeRuns = useMemo(
    () => activeForgeAgentRuns(runs, automationProjects, projectBundles),
    [automationProjects, projectBundles, runs],
  );

  const liveSnapshot = useMemo(
    () => buildForgeDashboardLiveStats(runs, automationProjects, projectBundles),
    [automationProjects, projectBundles, runs],
  );

  const snapshot = viewMode === "demo" ? FORGE_DASHBOARD_DEMO_SNAPSHOT : liveSnapshot;

  const projectById = useMemo(() => {
    const map = new Map<number, TaskProject>();
    for (const project of automationProjects) map.set(project.id, project);
    return map;
  }, [automationProjects]);

  const modelChartLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const row of snapshot.topModels) labels[row.id] = row.title;
    return labels;
  }, [snapshot.topModels]);

  const agentChartLabelMap = useMemo(
    () => agentChartLabels(snapshot.agentChartKeys, automationProjects),
    [automationProjects, snapshot.agentChartKeys],
  );

  const demoAgentLabels: Record<string, string> = useMemo(
    () => ({
      a1: "Content Optimizer Bulk",
      a2: "GSC Monthly YoY Report",
      a3: "Post Creator Weekly",
      a4: "Meta Batch Optimizer",
      a5: "Local SEO Pages",
    }),
    [],
  );

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${FORGE_DASHBOARD_PAGE_CLASS}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className={FORGE_PAGE_TITLE_CLASS}>My Forge</h1>
          <span
            className={cn(
              "min-w-[4.5rem] bg-primary/20 px-2 py-0.5 text-center text-base font-medium tabular-nums text-white",
              !(viewMode === "live" && activeRuns.length > 0) && "invisible",
            )}
          >
            {activeRuns.length} live
          </span>
          <span className={FORGE_DASHBOARD_SECTION_LABEL_CLASS}>This period&apos;s usage</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base text-muted-foreground">Past 30 days</span>
          <div className="flex items-center gap-1">
            {VIEW_MODES.map((mode) => (
              <WorkspacePill
                key={mode.id}
                label={mode.label}
                square
                active={viewMode === mode.id}
                onClick={() => setMode(mode.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {snapshot.heroCards.map((card) => (
              <ForgeDashboardHeroCard key={card.key} card={card} />
            ))}
          </div>

          <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <ForgeDashboardPanel title="Top models">
              {Array.from({ length: DASHBOARD_PANEL_ROW_SLOTS }, (_, index) => {
                const row = snapshot.topModels[index];
                if (!row) {
                  return (
                    <ForgeDashboardRow
                      key={`model-placeholder-${index}`}
                      rank={index + 1}
                      stripeIndex={index}
                      placeholder
                    />
                  );
                }
                return (
                  <ForgeDashboardRow
                    key={row.id}
                    rank={index + 1}
                    stripeIndex={index}
                    title={row.title}
                    value={row.value}
                    active={row.active}
                  />
                );
              })}
            </ForgeDashboardPanel>

            <ForgeDashboardPanel title="Agent rankings">
              {Array.from({ length: DASHBOARD_PANEL_ROW_SLOTS }, (_, index) => {
                const row = snapshot.agentRankings[index];
                if (!row) {
                  return (
                    <ForgeDashboardRow
                      key={`agent-placeholder-${index}`}
                      rank={index + 1}
                      stripeIndex={index}
                      placeholder
                    />
                  );
                }
                const project =
                  row.projectId != null ? projectById.get(row.projectId) : undefined;
                return (
                  <ForgeDashboardRow
                    key={row.id}
                    rank={index + 1}
                    stripeIndex={index}
                    title={row.title}
                    meta={row.meta}
                    value={row.value}
                    active={row.active}
                    onClick={project ? () => onEditAutomation(project) : undefined}
                    action={
                      project && primaryAutomationTask(project.id, projectBundles) ? (
                        <button
                          type="button"
                          className="text-base text-muted-foreground hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditAutomation(project, { initialTab: "archive" });
                          }}
                        >
                          Archive
                        </button>
                      ) : null
                    }
                  />
                );
              })}
            </ForgeDashboardPanel>
          </div>

          <ForgeDashboardUsageChart
            title="Usage by model"
            chartSeries={snapshot.chartSeries}
            chartKeys={snapshot.chartKeys}
            labels={modelChartLabels}
          />

          <ForgeDashboardUsageChart
            title="Usage by agent"
            chartSeries={snapshot.agentChartSeries}
            chartKeys={snapshot.agentChartKeys}
            labels={viewMode === "demo" ? demoAgentLabels : agentChartLabelMap}
          />
        </div>
      </div>
    </div>
  );
}
