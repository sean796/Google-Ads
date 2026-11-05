import { Fragment, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  countOverviewRowsByErrorFilter,
  OVERVIEW_ROW_ERROR_FILTER_GROUPS,
  overviewRowMatchesErrorFilters,
  type OverviewRowErrorFilterKey,
} from "@/lib/overview/overview-row-error-filters";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export interface OverviewErrorsFilterMenuProps {
  rows: OverviewRow[];
  activeFilters: Set<OverviewRowErrorFilterKey>;
  onToggle: (key: OverviewRowErrorFilterKey) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function OverviewErrorsFilterMenu({
  rows,
  activeFilters,
  onToggle,
  onClear,
  disabled = false,
}: OverviewErrorsFilterMenuProps) {
  const counts = useMemo(() => countOverviewRowsByErrorFilter(rows), [rows]);
  const filteredCount = useMemo(() => {
    if (activeFilters.size === 0) return rows.length;
    return rows.filter((row) => overviewRowMatchesErrorFilters(row, activeFilters, rows)).length;
  }, [rows, activeFilters]);
  const filterActive = activeFilters.size > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="quiet"
          type="button"
          disabled={disabled}
          aria-label="Filter by errors"
        >
          Errors{filterActive ? ` (${filteredCount})` : ""}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="text-base font-semibold leading-normal">
          Filter errors
        </DropdownMenuLabel>
        {OVERVIEW_ROW_ERROR_FILTER_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.label}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-base font-medium leading-normal text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.key}
                checked={activeFilters.has(option.key)}
                onCheckedChange={() => onToggle(option.key)}
                onSelect={(e) => e.preventDefault()}
                className="text-base leading-normal"
              >
                <span className="min-w-0 flex-1">{option.label}</span>
                <span className="ml-2 shrink-0 tabular-nums text-semantic-analysis-foreground">{counts[option.key]}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </Fragment>
        ))}
        {filterActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-base leading-normal" onSelect={onClear}>
              Clear filters
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
