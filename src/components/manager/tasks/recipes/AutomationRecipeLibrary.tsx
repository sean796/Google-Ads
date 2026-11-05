import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAutomationRecipes } from "@/lib/automation-recipes-api";
import {
  filterAutomationRecipesClient,
  mergeFilterOptions,
  automationRecipeSearchPlaceholder,
} from "@/lib/automation-recipes-filters";
import { setAutomationRecipeKeywords } from "@/lib/task-automation-templates";
import type {
  AutomationRecipeCatalogItem,
  AutomationRecipeFilterOptions,
  AutomationRecipeListQuery,
} from "@/lib/automation-recipes-types";
import { AutomationRecipeCard } from "@/components/manager/tasks/recipes/AutomationRecipeCard";
import { AutomationRecipeFilters } from "@/components/manager/tasks/recipes/AutomationRecipeFilters";
import { FORGE_DASHBOARD_SECTION_LABEL_CLASS } from "@/components/manager/pulse-forge/forge-dashboard-styles";
import {
  FORGE_RECIPE_PAGE_CLASS,
  groupRecipesByCategory,
} from "@/components/manager/pulse-forge/forge-recipe-styles";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";

export type AutomationRecipeLibraryProps = {
  teamId: number;
  sites: WordPressSiteOption[];
  defaultSiteId?: string | null;
  onInstalled?: (projectId: number) => void;
  onRecipeClick?: (recipe: AutomationRecipeCatalogItem) => void;
  onRecipeInstall?: (recipe: AutomationRecipeCatalogItem) => void;
};

export function AutomationRecipeLibrary({
  teamId,
  onRecipeClick,
  onRecipeInstall,
}: AutomationRecipeLibraryProps): React.ReactElement {
  const [allRecipes, setAllRecipes] = useState<AutomationRecipeCatalogItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<AutomationRecipeFilterOptions>({
    categories: [],
    verticals: [],
    buckets: [],
    signals: [],
  });
  const [query, setQuery] = useState<AutomationRecipeListQuery>({});
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAutomationRecipes(teamId, { includeTasks: true }).then(({ recipes, filters }) => {
      if (cancelled) return;
      setAllRecipes(recipes);
      setFilterOptions(mergeFilterOptions(filters, recipes));
      setAutomationRecipeKeywords(recipes.map((r) => r.keyword));
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError("Could not load agents.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const filteredRecipes = useMemo(
    () => filterAutomationRecipesClient(allRecipes, query),
    [allRecipes, query],
  );

  const categorySections = useMemo(
    () => groupRecipesByCategory(filteredRecipes),
    [filteredRecipes],
  );

  const patchQuery = useCallback((patch: Partial<AutomationRecipeListQuery>) => {
    setQuery((current) => ({ ...current, ...patch }));
  }, []);

  const filtersActive = useMemo(() => {
    if (filteredRecipes.length !== allRecipes.length) return true;
    return Boolean(
      query.category?.trim() ||
        query.bucket?.trim() ||
        query.execution?.trim() ||
        query.signal?.trim() ||
        query.vertical?.trim() ||
        query.q?.trim(),
    );
  }, [allRecipes.length, filteredRecipes.length, query]);

  const searchPlaceholder = automationRecipeSearchPlaceholder({
    filteredCount: filteredRecipes.length,
    totalCount: allRecipes.length,
    filtersActive,
  });

  if (loading) {
    return (
      <div className={`flex h-full items-center justify-center ${FORGE_RECIPE_PAGE_CLASS}`}>
        <p className="text-base text-muted-foreground">Loading agents…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex h-full items-center justify-center px-4 ${FORGE_RECIPE_PAGE_CLASS}`}>
        <p className="text-base text-ui-danger-hover">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${FORGE_RECIPE_PAGE_CLASS}`}>
      <div className="shrink-0 px-4 pt-4 pb-2">
        <AutomationRecipeFilters
          query={query}
          filterOptions={filterOptions}
          onChange={patchQuery}
          searchPlaceholder={searchPlaceholder}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {filteredRecipes.length === 0 ? (
          <p className="px-2 py-8 text-base text-muted-foreground">No agents match these filters.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {categorySections.map((section) => (
              <section key={section.category} className="flex flex-col gap-3">
                <h2 className={FORGE_DASHBOARD_SECTION_LABEL_CLASS}>{section.label}</h2>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {section.recipes.map((recipe) => (
                    <AutomationRecipeCard
                      key={recipe.keyword}
                      recipe={recipe}
                      selected={selectedKeyword === recipe.keyword}
                      onSelect={() => {
                        setSelectedKeyword(recipe.keyword);
                        onRecipeClick?.(recipe);
                      }}
                      onInstall={() => onRecipeInstall?.(recipe)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
