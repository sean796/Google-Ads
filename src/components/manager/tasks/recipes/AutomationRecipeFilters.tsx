import React from "react";
import {
  AUTOMATION_RECIPE_BUCKET_LABELS,
  AUTOMATION_RECIPE_CATEGORY_LABELS,
  AUTOMATION_RECIPE_CATEGORY_ORDER,
  AUTOMATION_RECIPE_EXECUTION_LABELS,
  AUTOMATION_RECIPE_SIGNAL_LABELS,
  AUTOMATION_RECIPE_VERTICAL_LABELS,
} from "@/lib/automation-recipes-filters";
import type {
  AutomationRecipeFilterOptions,
  AutomationRecipeListQuery,
} from "@/lib/automation-recipes-types";
import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";
import { Field, SelectField } from "@/ui";

export type AutomationRecipeFiltersProps = {
  query: AutomationRecipeListQuery;
  filterOptions: AutomationRecipeFilterOptions;
  onChange: (patch: Partial<AutomationRecipeListQuery>) => void;
  className?: string;
  searchPlaceholder?: string;
};

const ALL = "__all__";

function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}): React.ReactElement {
  return (
    <SelectField
      placeholder={label}
      value={value || ALL}
      onValueChange={(v) => onChange(v === ALL ? "" : v)}
      options={[{ value: ALL, label: allLabel }, ...options]}
    />
  );
}

export function AutomationRecipeFilters({
  query,
  filterOptions,
  onChange,
  className,
  searchPlaceholder = "Search recipes",
}: AutomationRecipeFiltersProps): React.ReactElement {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2 bg-black", className)}>
      <Field
        value={query.q ?? ""}
        onChange={(e) => onChange({ q: e.target.value })}
        placeholder={searchPlaceholder}
      />
      <span className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
      <FilterSelect
        label="Category"
        allLabel="All categories"
        value={query.category ?? ""}
        onChange={(category) => onChange({ category })}
        options={AUTOMATION_RECIPE_CATEGORY_ORDER.filter((cat) => filterOptions.categories.includes(cat)).map((cat) => ({
          value: cat,
          label: AUTOMATION_RECIPE_CATEGORY_LABELS[cat] ?? cat,
        }))}
      />
      <FilterSelect
        label="Bucket"
        allLabel="All buckets"
        value={query.bucket ?? ""}
        onChange={(bucket) => onChange({ bucket })}
        options={filterOptions.buckets.map((bucket) => ({ value: bucket, label: AUTOMATION_RECIPE_BUCKET_LABELS[bucket] ?? bucket }))}
      />
      <FilterSelect
        label="Signal"
        allLabel="All signals"
        value={query.signal ?? ""}
        onChange={(signal) => onChange({ signal })}
        options={filterOptions.signals.map((signal) => ({ value: signal, label: AUTOMATION_RECIPE_SIGNAL_LABELS[signal] ?? signal }))}
      />
      <FilterSelect
        label="Vertical"
        allLabel="All verticals"
        value={query.vertical ?? ""}
        onChange={(vertical) => onChange({ vertical })}
        options={filterOptions.verticals.map((vertical) => ({ value: vertical, label: AUTOMATION_RECIPE_VERTICAL_LABELS[vertical] ?? vertical }))}
      />
      <FilterSelect
        label="Execution"
        allLabel="Any execution"
        value={query.execution ?? ""}
        onChange={(execution) => onChange({ execution: execution as AutomationRecipeListQuery["execution"] })}
        options={(["meta-only", "full-aiseo", "entity-page-creator"] as const).map((execution) => ({
          value: execution,
          label: AUTOMATION_RECIPE_EXECUTION_LABELS[execution],
        }))}
      />
    </div>
  );
}