import { Download, Filter, Tag, UserPlus } from "lucide-react";
import { Button, Field, FilterRow, Popover, PopoverContent, PopoverTrigger } from "@/ui";

import type { HostedTag } from "@/lib/hosting-api";
import { MySitesFilterPopover } from "./MySitesFilterPopover";
import { activeFilterCount, type MySitesFilters } from "./my-sites-view-model";
import { MY_SITES_POPOVER, MY_SITES_TOOLBAR_BAND } from "./my-sites-theme";

export type MySitesToolbarProps = {
  filters: MySitesFilters;
  onFiltersChange: (next: MySitesFilters) => void;
  tags: HostedTag[];
  phpVersions: string[];
  canAdmin: boolean;
  onManageTags: () => void;
  onAddUserToAllSites: () => void;
  onDownloadCsv: () => void;
};

export function MySitesToolbar({
  filters,
  onFiltersChange,
  tags,
  phpVersions,
  canAdmin,
  onManageTags,
  onAddUserToAllSites,
  onDownloadCsv,
}: MySitesToolbarProps) {
  const active = activeFilterCount(filters);
  return (
    <div className={MY_SITES_TOOLBAR_BAND}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="tool" icon={Filter}>
            Filter ({active})
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={`w-72 p-3 ${MY_SITES_POPOVER}`}>
          <MySitesFilterPopover filters={filters} onChange={onFiltersChange} tags={tags} phpVersions={phpVersions} />
        </PopoverContent>
      </Popover>
      <Field
        placeholder="Search sites"
        value={filters.query}
        onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
      />
      <FilterRow align="end">
        <Button variant="tool" icon={Tag} disabled={!canAdmin} onClick={onManageTags}>
          Manage tags
        </Button>
        <Button variant="tool" icon={UserPlus} disabled={!canAdmin} onClick={onAddUserToAllSites}>
          Add user to all sites
        </Button>
        <Button variant="tool" icon={Download} onClick={onDownloadCsv}>
          CSV
        </Button>
      </FilterRow>
    </div>
  );
}
