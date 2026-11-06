import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { TaskProjectBundle } from "@/contexts/TeamContext";
import type { TaskBuilderTab } from "@/components/manager/pulse-forge/use-task-builder-state";
import { ForgeAutomationListTile } from "@/components/manager/pulse-forge/ForgeAutomationListTile";
import { ForgeAutomationBulkSelectBar } from "@/components/manager/pulse-forge/ForgeAutomationBulkSelectBar";
import { ForgeAutomationsFilterBar } from "@/components/manager/pulse-forge/ForgeAutomationsFilters";
import { ForgeAutomationsGridPagination } from "@/components/manager/pulse-forge/ForgeAutomationsGridPagination";
import { FORGE_RECIPE_PAGE_CLASS } from "@/components/manager/pulse-forge/forge-recipe-styles";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import {
  FORGE_AUTOMATIONS_DEMO_ROWS,
} from "@/lib/pulse-forge/forge-automations-demo-data";
import {
  buildForgeAutomationFilterOptions,
  filterForgeAutomationDemoRows,
  filterForgeAutomationProjects,
  sortForgeAutomationDemoRows,
  sortForgeAutomationProjects,
  type ForgeAutomationsListQuery,
} from "@/lib/pulse-forge/forge-automations-filters";
import {
  readForgeAutomationsViewMode,
  writeForgeAutomationsViewMode,
  type ForgeAutomationsViewMode,
} from "@/lib/pulse-forge/forge-automations-view-mode";
import { activeRunForProject } from "@/lib/pulse-forge/forge-dashboard-runs";
import {
  formatAutomationCompareLabel,
  formatAutomationExecutionTime,
  formatAutomationScheduleLabel,
} from "@/lib/pulse-forge/forge-automation-row-meta";
import type { TaskProject } from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import { taskSupportsManualAutomationExecute } from "@/lib/task-automation-ui";
import {
  automationVisibilityLabel,
  resolveAutomationVisibility,
} from "@/lib/pulse-forge/forge-automation-visibility";
import { primeForgeClientColors } from "@/lib/pulse-forge/forge-client-colors";
import {
  clampForgeAutomationsPageIndex,
  FORGE_AUTOMATIONS_PAGE_SIZE,
  sliceForgeAutomationsPage,
} from "@/lib/pulse-forge/forge-automations-pagination";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const FORGE_AUTOMATIONS_GRID_CLASS =
  "grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-8 lg:auto-rows-fr";

const FORGE_AUTOMATIONS_EMPTY_CLASS =
  "col-span-1 flex min-h-[12rem] flex-1 items-center justify-center sm:col-span-2 lg:col-span-3";

function ForgeAutomationGridPlaceholders({ count }: { count: number }): React.ReactElement | null {
  if (count <= 0) return null;
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={`grid-slot-${index}`} className="min-h-0" aria-hidden />
      ))}
    </>
  );
}

export type PulseForgeAutomationsListProps = {
  teamId: number;
  members: TeamMember[];
  automationProjects: TaskProject[];
  projectBundles: Record<number, TaskProjectBundle>;
  runs: AgentRun[];
  sites: WordPressSiteOption[];
  onEditAutomation: (project: TaskProject, options?: { initialTab?: TaskBuilderTab }) => void;
  onDeleteAutomation: (projectId: number) => void;
  onDeleteAutomations?: (projectIds: number[]) => void | Promise<void>;
  onRefreshProject: (projectId: number) => void;
  onCreateBlank: () => void;
  onTaskExecuted?: (projectId: number) => void;
};

const VIEW_MODES: { id: ForgeAutomationsViewMode; label: string }[] = [
  { id: "demo", label: "Demo" },
  { id: "live", label: "Live" },
];

export function PulseForgeAutomationsList({
  teamId,
  members,
  automationProjects,
  projectBundles,
  runs,
  sites,
  onEditAutomation,
  onDeleteAutomation,
  onDeleteAutomations,
  onRefreshProject,
  onCreateBlank,
  onTaskExecuted,
}: PulseForgeAutomationsListProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<ForgeAutomationsViewMode>(() =>
    readForgeAutomationsViewMode(),
  );
  const [query, setQuery] = useState<ForgeAutomationsListQuery>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(() => new Set());

  const setMode = useCallback((mode: ForgeAutomationsViewMode) => {
    setViewMode(mode);
    writeForgeAutomationsViewMode(mode);
  }, []);

  const patchQuery = useCallback((patch: Partial<ForgeAutomationsListQuery>) => {
    setQuery((current) => ({ ...current, ...patch }));
    setPageIndex(0);
  }, []);

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites) map.set(site.id, site.name);
    return map;
  }, [sites]);

  const siteIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites) map.set(site.name.toLowerCase(), site.id);
    return map;
  }, [sites]);

  const filterOptions = useMemo(
    () =>
      buildForgeAutomationFilterOptions(
        automationProjects,
        projectBundles,
        sites,
        viewMode === "demo" ? FORGE_AUTOMATIONS_DEMO_ROWS : undefined,
      ),
    [automationProjects, projectBundles, sites, viewMode],
  );

  useEffect(() => {
    const orderedSiteIds = [...filterOptions.siteIds].sort((left, right) =>
      (siteNameById.get(left) ?? left).localeCompare(siteNameById.get(right) ?? right),
    );
    primeForgeClientColors(orderedSiteIds);
  }, [filterOptions.siteIds, siteNameById]);

  const filteredDemoRows = useMemo(
    () =>
      sortForgeAutomationDemoRows(
        filterForgeAutomationDemoRows(FORGE_AUTOMATIONS_DEMO_ROWS, sites, query),
        query.sort,
      ),
    [query, sites],
  );

  const filteredProjects = useMemo(
    () =>
      sortForgeAutomationProjects(
        filterForgeAutomationProjects(
          automationProjects,
          projectBundles,
          runs,
          query,
        ),
        query.sort,
        siteNameById,
      ),
    [automationProjects, projectBundles, query, runs, siteNameById],
  );

  const activeTotalCount =
    viewMode === "demo" ? filteredDemoRows.length : filteredProjects.length;
  const safePageIndex = clampForgeAutomationsPageIndex(pageIndex, activeTotalCount);
  const paginatedDemoRows = useMemo(
    () => sliceForgeAutomationsPage(filteredDemoRows, safePageIndex),
    [filteredDemoRows, safePageIndex],
  );
  const paginatedProjects = useMemo(
    () => sliceForgeAutomationsPage(filteredProjects, safePageIndex),
    [filteredProjects, safePageIndex],
  );

  useEffect(() => {
    if (viewMode !== "live") return;
    for (const project of paginatedProjects) {
      if (!projectBundles[project.id]) {
        onRefreshProject(project.id);
      }
    }
  }, [onRefreshProject, paginatedProjects, projectBundles, viewMode]);

  useEffect(() => {
    setPageIndex(0);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "live") {
      setSelectedProjectIds(new Set());
    }
  }, [viewMode]);

  useEffect(() => {
    setSelectedProjectIds((current) => {
      const allowed = new Set(filteredProjects.map((project) => project.id));
      const next = new Set<number>();
      for (const id of current) {
        if (allowed.has(id)) next.add(id);
      }
      return next.size === current.size ? current : next;
    });
  }, [filteredProjects]);

  const selectedCount = selectedProjectIds.size;
  const allFilteredSelected =
    filteredProjects.length > 0 &&
    filteredProjects.every((project) => selectedProjectIds.has(project.id));
  const someSelected = filteredProjects.some((project) => selectedProjectIds.has(project.id));

  const selectAllFiltered = useCallback(() => {
    setSelectedProjectIds(new Set(filteredProjects.map((project) => project.id)));
  }, [filteredProjects]);

  const clearSelection = useCallback(() => {
    setSelectedProjectIds(new Set());
  }, []);

  const toggleProjectSelected = useCallback((projectId: number, selected: boolean) => {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (selected) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  }, []);

  const bulkDeleteSelected = useCallback(async () => {
    const ids = [...selectedProjectIds];
    if (ids.length === 0) return;
    if (onDeleteAutomations) {
      await onDeleteAutomations(ids);
    } else {
      for (const id of ids) {
        onDeleteAutomation(id);
      }
    }
    setSelectedProjectIds(new Set());
  }, [onDeleteAutomation, onDeleteAutomations, selectedProjectIds]);

  const handlePageChange = useCallback((nextPageIndex: number) => {
    setPageIndex(nextPageIndex);
  }, []);

  const emptyMessage =
    viewMode === "demo" || automationProjects.length > 0
      ? "No automations match these filters"
      : "No automations yet";
  const listTotalCount =
    viewMode === "demo" ? filteredDemoRows.length : filteredProjects.length;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${FORGE_RECIPE_PAGE_CLASS}`}>
      <div className="flex h-14 shrink-0 flex-nowrap items-center gap-3 overflow-x-auto px-4">
        <ForgeAutomationsFilterBar
          query={query}
          filterOptions={filterOptions}
          sites={sites}
          onChange={patchQuery}
        />
        {viewMode === "live" && filteredProjects.length > 0 ? (
          <ForgeAutomationBulkSelectBar
            selectedCount={selectedCount}
            allFilteredSelected={allFilteredSelected}
            someSelected={someSelected}
            onSelectAllFiltered={selectAllFiltered}
            onClearSelection={clearSelection}
            onDeleteSelected={() => void bulkDeleteSelected()}
          />
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            type="button"
            disabled={viewMode !== "live"}
            onClick={onCreateBlank}
          >
            New automation
          </Button>
          {VIEW_MODES.map((mode) => (
            <WorkspacePill
              key={mode.id}
              label={mode.label}
              square
              active={viewMode === mode.id}
              onClick={() => {
                setMode(mode.id);
                setPageIndex(0);
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
        <div className={FORGE_AUTOMATIONS_GRID_CLASS}>
          {viewMode === "demo" ? (
            listTotalCount === 0 ? (
              <p className={cn(FORGE_AUTOMATIONS_EMPTY_CLASS, "text-base text-muted-foreground")}>
                {emptyMessage}
              </p>
            ) : (
              <>
                {paginatedDemoRows.map((row) => (
                  <ForgeAutomationListTile
                    key={row.id}
                    title={row.title}
                    siteId={siteIdByName.get(row.siteName.toLowerCase()) ?? row.siteName}
                    siteName={row.siteName}
                    scheduleLabel={row.scheduleLabel}
                    compareLabel={row.compareLabel}
                    executionTimeLabel={row.executionTimeLabel}
                    active={row.active}
                    demoMode
                  />
                ))}
                <ForgeAutomationGridPlaceholders
                  count={Math.max(0, FORGE_AUTOMATIONS_PAGE_SIZE - paginatedDemoRows.length)}
                />
              </>
            )
          ) : listTotalCount === 0 ? (
            <p className={cn(FORGE_AUTOMATIONS_EMPTY_CLASS, "text-base text-muted-foreground")}>
              {emptyMessage}
            </p>
          ) : (
            <>
              {paginatedProjects.map((project) => {
                const siteId = project.wordpressSiteId?.trim() ?? "";
                const siteName = siteId ? siteNameById.get(siteId) ?? siteId : "—";
                const bundle = projectBundles[project.id];
                const activeRun = activeRunForProject(runs, project.id, projectBundles);
                const task = bundle?.tasks[0];
                const showExecute =
                  task != null &&
                  taskSupportsManualAutomationExecute(task, project, bundle?.tasks, members);
                const visibilityLabel = automationVisibilityLabel(resolveAutomationVisibility(project));
                return (
                  <ForgeAutomationListTile
                    key={project.id}
                    title={project.title}
                    siteId={siteId}
                    visibilityLabel={visibilityLabel}
                    siteName={siteName}
                    scheduleLabel={formatAutomationScheduleLabel(task)}
                    compareLabel={formatAutomationCompareLabel(task)}
                    executionTimeLabel={formatAutomationExecutionTime(task)}
                    active={activeRun != null}
                    project={project}
                    teamId={teamId}
                    task={task ?? null}
                    showExecute={showExecute}
                    onOpenSettings={() =>
                      onEditAutomation(project, {
                        initialTab: "setup",
                      })
                    }
                    onDelete={() => onDeleteAutomation(project.id)}
                    onExecuted={() => onTaskExecuted?.(project.id)}
                    selectable
                    selected={selectedProjectIds.has(project.id)}
                    onSelectedChange={(selected) => toggleProjectSelected(project.id, selected)}
                  />
                );
              })}
              <ForgeAutomationGridPlaceholders
                count={Math.max(0, FORGE_AUTOMATIONS_PAGE_SIZE - paginatedProjects.length)}
              />
            </>
          )}
        </div>
        <ForgeAutomationsGridPagination
          pageIndex={safePageIndex}
          totalCount={listTotalCount}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}
