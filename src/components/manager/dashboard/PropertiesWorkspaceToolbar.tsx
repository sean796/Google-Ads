import { Trash2, Wand2 } from "lucide-react";
import { Button, CheckField, Field, FilterRow } from "@/ui";
import type { PropertiesWorkspaceToolbarState } from "@/components/manager/dashboard/PropertiesDashboardChromeContext";

export type PropertiesWorkspaceToolbarProps = PropertiesWorkspaceToolbarState;

export function PropertiesWorkspaceToolbar({
  sitesCount,
  siteSearchQuery,
  onSearchChange,
  selectAllChecked,
  onSelectAll,
  selectedCount,
  onDeleteSelected,
  showGbpBulk,
  isBulkGmbNamesBusy,
  onBulkApplyGmbDisplayNames,
  trailingActions,
}: PropertiesWorkspaceToolbarProps) {
  const showSelectionControls =
    sitesCount > 0 && Boolean((onSelectAll ?? onDeleteSelected) || showGbpBulk);

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
      {showSelectionControls ? (
        <FilterRow>
          {(onSelectAll ?? onDeleteSelected) ? (
            <>
              <CheckField
                aria-label="Select all"
                title="Select all"
                checked={selectAllChecked}
                onCheckedChange={(checked) => onSelectAll?.(checked)}
              />
              <Button
                variant="danger"
                size="icon"
                icon={Trash2}
                reserved={!(selectedCount > 0 && onDeleteSelected)}
                onClick={onDeleteSelected}
                title={`Delete ${selectedCount} selected`}
                aria-label={`Delete ${selectedCount} selected`}
              />
            </>
          ) : null}
          {showGbpBulk ? (
            <Button
              variant="tool"
              icon={Wand2}
              disabled={isBulkGmbNamesBusy}
              onClick={() => void onBulkApplyGmbDisplayNames()}
              title="Set each property’s display name from DataForSEO Business Listings + Google Business Profile (visible rows only)"
            >
              GBP
            </Button>
          ) : null}
        </FilterRow>
      ) : null}
      <Field
        placeholder="Search sites by name"
        value={siteSearchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {trailingActions ? <FilterRow align="end">{trailingActions}</FilterRow> : null}
    </div>
  );
}
